#!/usr/bin/env node
/**
 * Live bridge between the MCP authoring drafts and the running website.
 *
 * The MCP server writes drafts to src/content/_drafts/. This small HTTP server
 * exposes them read-only on loopback so a browser session (Vite dev server) can
 * preview an agent-authored course *before* it is promoted into the curriculum —
 * which is the "connect while the user is using the website" half of the MCP story.
 *
 * Security posture: binds 127.0.0.1 only, GET/OPTIONS only, no writes, and CORS is
 * restricted to localhost dev origins. It never exposes the filesystem beyond the
 * drafts folder.
 *
 * Run: node mcp-server/bridge.mjs [--port 8787]
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DRAFT_DIR = join(REPO_ROOT, 'src', 'content', '_drafts');

function argPort(argv, fallback) {
  const index = argv.indexOf('--port');
  if (index !== -1 && argv[index + 1]) return Number(argv[index + 1]) || fallback;
  return fallback;
}

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

function isLoopbackHost(value) {
  return !value || /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(value);
}

/**
 * Extracts the exported lessons array from a draft module without importing it.
 * Drafts are written by the MCP server as a JSON array literal, so slicing the
 * array text and parsing it is exact for our own output. Anything else fails
 * closed.
 */
function readDraft(draftId) {
  const file = join(DRAFT_DIR, `${draftId}.ts`);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('[', text.search(/export\s+const\s+\w+Lessons\s*:\s*Lesson\[\]\s*=\s*\[/));
  if (start === -1) return { draftId, error: 'no lessons array found', lessons: [] };

  let depth = 0;
  let inString = null;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return { draftId, error: 'unterminated lessons array', lessons: [] };

  try {
    const lessons = JSON.parse(text.slice(start, end + 1));
    return { draftId, lessons, bytes: statSync(file).size, mtime: statSync(file).mtimeMs };
  } catch (error) {
    return { draftId, error: `not a plain JSON array (${error.message})`, lessons: [] };
  }
}

function listDrafts() {
  if (!existsSync(DRAFT_DIR)) return [];
  return readdirSync(DRAFT_DIR)
    .filter((name) => name.endsWith('.ts') && !name.startsWith('.'))
    .map((name) => name.replace(/\.ts$/, ''));
}

function send(response, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

export function createBridge(port = 8787) {
  return createServer((request, response) => {
    const origin = request.headers.origin;
    const host = request.headers.host ?? '';

    // Reject any request addressed to a non-loopback host: DNS rebinding guard.
    if (!isLoopbackHost(host)) {
      send(response, 403, { error: 'bridge accepts loopback hosts only' }, origin);
      return;
    }

    if (request.method === 'OPTIONS') {
      const headers = {
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      };
      if (origin && ALLOWED_ORIGINS.has(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Vary'] = 'Origin';
      }
      response.writeHead(204, headers);
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', `http://${host || '127.0.0.1'}`);

    if (request.method !== 'GET') {
      send(response, 405, { error: 'method not allowed — the bridge is read-only' }, origin);
      return;
    }

    if (url.pathname === '/health') {
      send(response, 200, { ok: true, drafts: listDrafts().length }, origin);
      return;
    }

    if (url.pathname === '/drafts') {
      const drafts = listDrafts().map((id) => {
        const file = join(DRAFT_DIR, `${id}.ts`);
        return { id, bytes: statSync(file).size, mtime: statSync(file).mtimeMs };
      });
      send(response, 200, { drafts }, origin);
      return;
    }

    const match = url.pathname.match(/^\/drafts\/([a-z0-9-]+)$/);
    if (match) {
      const draft = readDraft(match[1]);
      if (!draft) {
        send(response, 404, { error: `no draft named ${match[1]}` }, origin);
        return;
      }
      send(response, 200, draft, origin);
      return;
    }

    send(response, 404, { error: 'not found', routes: ['/health', '/drafts', '/drafts/:id'] }, origin);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const port = argPort(process.argv, 8787);
  const server = createBridge(port);
  server.listen(port, '127.0.0.1', () => {
    process.stderr.write(
      `[interactive-roadmaps-bridge] http://127.0.0.1:${port}  drafts: ${
        existsSync(DRAFT_DIR) ? listDrafts().length : 0
      }\n`
    );
  });
}
