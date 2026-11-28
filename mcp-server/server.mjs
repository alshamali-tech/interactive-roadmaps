#!/usr/bin/env node
/**
 * Interactive Roadmaps MCP server
 *
 * A dependency-free Model Context Protocol server (JSON-RPC 2.0 over stdio) that
 * lets local AI agents in Qwen Desktop or Claude Desktop author courses and
 * lessons for this repo without writing app code.
 *
 * Why zero dependencies: this project is "no build complexity, works offline" and
 * deliberately keeps zero custom CLI scripts. Hand-rolling the ~120 lines of MCP
 * framing we actually use avoids adding a runtime dependency tree.
 *
 * Why it validates by running the repo's own test: `src/engine/contentValidation.
 * test.ts` parses authored content with the real Zod schemas (WidgetConfigSchema,
 * DiagramSchema). Re-declaring those rules here in JavaScript would drift from
 * `src/engine/generatorSchema.ts` the first time a widget changes.
 *
 * Run:        node mcp-server/server.mjs
 * Self-check:  node mcp-server/server.mjs --smoke
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const SERVER_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
export const REPO_ROOT = resolve(SERVER_DIR, '..');
const PROTOCOL_VERSION = '2024-11-05';
const DRAFT_DIR_REL = join('src', 'content', '_drafts');

/** Read-only allowlist: docs, authored content, curriculum graph, schemas. */
const READ_ALLOW = [
  'README.md',
  'docs',
  join('src', 'content'),
  join('src', 'curriculum'),
  join('src', 'engine', 'generatorSchema.ts'),
  join('src', 'engine', 'lessonParser.ts'),
];

/** Writable area: drafts only. Promoting a draft is its own audited tool. */
const WRITE_ALLOW = [DRAFT_DIR_REL, join('src', 'content')];

const CANONICAL_WIDGETS = ['sandbox', 'mutator', 'trade-off', 'context-diagram', 'socratic-chat'];
/** Widget spellings the specs keep using; caught here so they never ship. */
const WIDGET_ALIASES = {
  node_graph: 'context-diagram',
  context_diagram: 'context-diagram',
  trade_off: 'trade-off',
  socratic_chat: 'socratic-chat',
};

class ToolError extends Error {}

// ─── path helpers ────────────────────────────────────────────────────────────

function within(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function repoPath(rel, allow = null) {
  if (typeof rel !== 'string' || rel.trim() === '') throw new ToolError('path must be a non-empty string');
  const abs = resolve(REPO_ROOT, rel);
  if (!within(REPO_ROOT, abs)) throw new ToolError(`path escapes the repository: ${rel}`);
  if (allow) {
    const inside = allow.some((base) => within(join(REPO_ROOT, base), abs));
    if (!inside) {
      throw new ToolError(`path is outside the allowed areas: ${allow.map((a) => a + '/').join(', ')}`);
    }
  }
  return abs;
}

function relPath(abs) {
  return relative(REPO_ROOT, abs).split(sep).join('/');
}

// ─── content model checks ────────────────────────────────────────────────────

function normalizeWidgetTypes(value, issues, where) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    value.forEach((item, i) => normalizeWidgetTypes(item, issues, `${where}[${i}]`));
    return value;
  }
  if (typeof value.type === 'string') {
    const alias = WIDGET_ALIASES[value.type];
    if (alias) {
      issues.push(`${where}.type "${value.type}" is not a registered widget key; rewrote it to "${alias}".`);
      value.type = alias;
    }
    if (!CANONICAL_WIDGETS.includes(value.type)) {
      issues.push(
        `${where}.type "${value.type}" is unknown. Valid keys: ${CANONICAL_WIDGETS.join(', ')}.`
      );
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'type') continue;
    if (child && typeof child === 'object') normalizeWidgetTypes(child, issues, `${where}.${key}`);
  }
  return value;
}

/**
 * Structural pre-checks we can do cheaply before invoking the real validator.
 * This is a guardrail, not the source of truth — Zod in `contentValidation.test.ts`
 * decides validity.
 */
function checkLessonShape(lesson, index) {
  const issues = [];
  const where = `lessons[${index}]`;
  if (!lesson || typeof lesson !== 'object') throw new ToolError(`${where} must be an object`);

  for (const field of ['id', 'title', 'content']) {
    if (lesson[field] === undefined) issues.push(`${where}.${field} is required.`);
  }
  if (typeof lesson.id === 'string' && !/^[a-z0-9][a-z0-9-]*$/.test(lesson.id)) {
    issues.push(`${where}.id "${lesson.id}" should be kebab-case (lowercase letters, digits, hyphens).`);
  }
  if (lesson.content && typeof lesson.content === 'object') {
    if (typeof lesson.content.markdown !== 'string' || lesson.content.markdown.trim() === '') {
      issues.push(`${where}.content.markdown must be a non-empty string.`);
    }
    const widgets = lesson.content.widgets;
    if (widgets !== undefined) {
      if (!Array.isArray(widgets)) issues.push(`${where}.content.widgets must be an array.`);
      else normalizeWidgetTypes(widgets, issues, `${where}.content`);
    }
  }
  // Widget placeholders must resolve or the tag renders as dead text.
  const markdown = typeof lesson.content?.markdown === 'string' ? lesson.content.markdown : '';
  const stripped = markdown.replace(/<!--[\s\S]*?-->/g, '');
  const declared = Array.isArray(lesson.content?.widgets) ? lesson.content.widgets.map((w) => w?.id) : [];
  for (const match of stripped.matchAll(/\{\{widget:([^}]+)\}\}/g)) {
    if (!declared.includes(match[1].trim())) {
      issues.push(`${where} references {{widget:${match[1]}}} with no matching entry in content.widgets.`);
    }
  }
  for (const id of declared) {
    if (id && !stripped.includes(`<widget id="${id}"`) && !stripped.includes(`{{widget:${id}}}`)) {
      issues.push(`${where} declares widget "${id}" that never appears in the markdown.`);
    }
  }
  return issues;
}

// ─── the repo's real validator ───────────────────────────────────────────────

function runRepoValidation() {
  const result = spawnSync(
    'npx',
    ['vitest', 'run', 'src/engine/contentValidation.test.ts', '--reporter=dot'],
    { cwd: REPO_ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000, maxBuffer: 8 * 1024 * 1024 }
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return {
    ok: result.status === 0,
    exitCode: result.status,
    // Keep the tail: the summary and the failing assertion are what matter.
    tail: output.split('\n').slice(-40).join('\n'),
  };
}

// ─── tools ───────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'project_info',
    description:
      'Orientation for an AI authoring agent: repo layout, the widget keys that actually exist, the lesson shape, and where the authoritative rules live. Call this first.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_content',
    description:
      'List authored content modules, the draft folder, and the curriculum graph files, with a heuristic list of lesson ids found in each module.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_file',
    description:
      'Read a file from an allowed area (docs/, src/content/, src/curriculum/, README.md, the Zod schema, the lesson parser). Size-capped.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo-relative path, e.g. docs/MCP_INSTRUCTIONS.md' },
        maxBytes: { type: 'integer', minimum: 512, maximum: 400000, default: 60000 },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate_content',
    description:
      'Run the repository Zod validation over everything under src/content (including drafts) and report pass/fail. This is the authoritative check — the same one CI runs.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_lesson_draft',
    description:
      'Write one or more lessons as a draft module under src/content/_drafts/. Drafts are type-checked and validated but not imported by the app, so nothing ships until promoted. Structural problems are reported before writing.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'kebab-case file name, no extension' },
        lessons: {
          type: 'array',
          minItems: 1,
          description: 'Lesson objects matching GeneratedLessonSchema: id, title, description, prerequisites, metadata{difficulty,estimatedMinutes,tags,version}, content{markdown,widgets[]}',
          items: { type: 'object' },
        },
        note: { type: 'string' },
      },
      required: ['draftId', 'lessons'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_drafts',
    description: 'List draft modules currently waiting in src/content/_drafts/.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'delete_draft',
    description: 'Remove a draft module from src/content/_drafts/.',
    inputSchema: {
      type: 'object',
      properties: { draftId: { type: 'string' } },
      required: ['draftId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_content_module',
    description:
      'Create a brand-new content module file (src/content/<track>/<module>.ts) from validated lessons. Only creates files that do not already exist.',
    inputSchema: {
      type: 'object',
      properties: {
        track: { type: 'string', description: 'kebab-case track folder, e.g. ai-engineer' },
        moduleFile: { type: 'string', description: 'file name without extension, e.g. module-03-rag' },
        exportName: { type: 'string', description: 'camelCase export, e.g. module03Lessons' },
        lessons: { type: 'array', minItems: 1, items: { type: 'object' } },
        header: { type: 'string', description: 'Optional doc comment for the file' },
      },
      required: ['track', 'moduleFile', 'exportName', 'lessons'],
      additionalProperties: false,
    },
  },
  {
    name: 'promote_draft',
    description:
      'Append the lessons of a draft into an existing content module, writing a .bak copy first and restoring it automatically if repository validation then fails. Refuses to touch anything but the target module array.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        targetPath: { type: 'string', description: 'e.g. src/content/ai-engineer/module-01-foundations.ts' },
      },
      required: ['draftId', 'targetPath'],
      additionalProperties: false,
    },
  },
];

function toolProjectInfo() {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  return {
    name: pkg.name,
    stack: 'Vite + React 19 + TypeScript strict + Tailwind v4 + Dexie; no backend',
    scripts: Object.keys(pkg.scripts ?? {}),
    widgetKeys: CANONICAL_WIDGETS,
    widgetKeyWarning:
      'Canonical keys are HYPHENATED. Underscore spellings (context_diagram, trade_off, socratic_chat, node_graph) match no schema literal or registry entry and silently never render.',
    lessonSchema: 'GeneratedLessonSchema in src/engine/generatorSchema.ts (id, title, metadata{difficulty,estimatedMinutes,tags,version}, prerequisites, content{markdown,widgets})',
    widgetSyntaxForAiAuthoredMarkdown: ':::widget context-diagram ... :::' ,
    widgetSyntaxForStaticContent: '{{widget:id}} marker plus a matching entry in content.widgets',
    authoritativeRules: [
      'docs/MCP_INSTRUCTIONS.md (authoring contract for agents)',
      'src/engine/generatorSchema.ts (Zod schemas)',
      'src/engine/contentValidation.test.ts (validation entry point)',
      'src/components/universal/README.md (widget docs)',
    ],
    note: 'No npm validate:lesson script exists; validation runs through the Vitest runner.',
  };
}

function collectContentFiles() {
  const base = join(REPO_ROOT, 'src', 'content');
  const walk = (dir, out = []) => {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  };
  return walk(base);
}

function toolListContent() {
  const modules = collectContentFiles().map((file) => {
    const text = readFileSync(file, 'utf8');
    const ids = [...text.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);
    const widgetCount = (text.match(/^\s*type:\s*'(sandbox|mutator|trade-off|context-diagram|socratic-chat)'/gm) ?? []).length;
    return { path: relPath(file), lessonIds: ids, widgetBlocks: widgetCount, bytes: statSync(file).size };
  });
  return {
    contentModules: modules,
    drafts: listDraftFiles().map((f) => relPath(f)),
    curriculum: existsSync(join(REPO_ROOT, 'src', 'curriculum', 'graph.ts'))
      ? ['src/curriculum/graph.ts', 'src/curriculum/schema.ts']
      : [],
  };
}

function listDraftFiles() {
  const dir = join(REPO_ROOT, DRAFT_DIR_REL);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.startsWith('.'))
    .map((name) => join(dir, name));
}

function toolReadFile({ path, maxBytes = 60000 }) {
  const abs = repoPath(path, READ_ALLOW);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new ToolError(`not found: ${path}`);
  const text = readFileSync(abs, 'utf8');
  return {
    path: relPath(abs),
    bytes: Buffer.byteLength(text, 'utf8'),
    truncated: Buffer.byteLength(text, 'utf8') > maxBytes,
    content: text.slice(0, maxBytes),
  };
}

function toolValidateContent() {
  const result = runRepoValidation();
  return {
    ...result,
    hint: result.ok
      ? 'All authored content parses against the Zod schemas.'
      : 'Fix the reported issues. Drafts under src/content/_drafts are included in this check.',
  };
}

function draftModuleSource(draftId, lessons, note) {
  const body = lessons.map((lesson) => JSON.stringify(lesson, null, 2)).join(',\n  ');
  return `/**
 * DRAFT — authored via the MCP server${note ? `: ${note.replace(/\*\//g, '*\\/')}` : ''}.
 * Not imported by the application. Validated by src/engine/contentValidation.test.ts.
 * Promote with the promote_draft tool, or delete this file.
 */
import type { Lesson } from '@/curriculum/schema';

export const draftLessons: Lesson[] = [
  ${body},
];
`;
}

function toolCreateLessonDraft({ draftId, lessons, note }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(draftId)) {
    throw new ToolError('draftId must be kebab-case (lowercase letters, digits, hyphens)');
  }
  const issues = lessons.flatMap((lesson, i) => checkLessonShape(lesson, i));
  const target = repoPath(join(DRAFT_DIR_REL, `${draftId}.ts`), [DRAFT_DIR_REL]);
  if (existsSync(target)) throw new ToolError(`draft "${draftId}" already exists — delete it or pick another id`);

  mkdirSync(join(REPO_ROOT, DRAFT_DIR_REL), { recursive: true });
  writeFileSync(target, draftModuleSource(draftId, lessons, note), 'utf8');

  return {
    draftPath: relPath(target),
    lessons: lessons.length,
    normalizedOrSuspect: issues,
    next: issues.length
      ? 'Fix the items above, then call validate_content.'
      : 'Call validate_content to run the authoritative Zod check.',
  };
}

function toolDeleteDraft({ draftId }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(draftId)) throw new ToolError('draftId must be kebab-case');
  const target = repoPath(join(DRAFT_DIR_REL, `${draftId}.ts`), [DRAFT_DIR_REL]);
  if (!existsSync(target)) throw new ToolError(`no draft named "${draftId}"`);
  rmSync(target);
  return { deleted: relPath(target) };
}

function toolListDrafts() {
  return {
    drafts: listDraftFiles().map((file) => ({
      path: relPath(file),
      bytes: statSync(file).size,
    })),
  };
}

function moduleArrayBounds(text) {
  const open = text.search(/export\s+const\s+\w+Lessons\s*:\s*Lesson\[\]\s*=\s*\[/);
  if (open === -1) return null;
  const start = text.indexOf('[', open);
  let depth = 0;
  let inString = null;
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
      if (depth === 0) return { start, end: i };
    }
  }
  return null;
}

function toolCreateContentModule({ track, moduleFile, exportName, lessons, header }) {
  for (const [label, value, pattern] of [
    ['track', track, /^[a-z0-9][a-z0-9-]*$/],
    ['moduleFile', moduleFile, /^[a-z0-9][a-z0-9-]*$/],
    ['exportName', exportName, /^[A-Za-z_$][A-Za-z0-9_$]*$/],
  ]) {
    if (!pattern.test(value)) throw new ToolError(`${label} is not a valid identifier/path segment: ${value}`);
  }
  const issues = lessons.flatMap((lesson, i) => checkLessonShape(lesson, i));
  const rel = join('src', 'content', track, `${moduleFile}.ts`);
  const target = repoPath(rel, [join('src', 'content')]);
  if (existsSync(target)) throw new ToolError(`${relPath(target)} already exists — use promote_draft instead`);

  mkdirSync(resolve(target, '..'), { recursive: true });
  const doc = header ? `/**\n * ${header.replace(/\*\//g, '*\\/').split('\n').join('\n * ')}\n */\n` : '';
  const body = lessons.map((lesson) => JSON.stringify(lesson, null, 2)).join(',\n  ');
  writeFileSync(
    target,
    `${doc}import type { Lesson } from '@/curriculum/schema';

export const ${exportName}: Lesson[] = [
  ${body},
];
`,
    'utf8'
  );

  return {
    created: relPath(target),
    lessons: lessons.length,
    normalizedOrSuspect: issues,
    next: 'Run validate_content, then wire the module into src/curriculum/graph.ts if it should be navigable.',
  };
}

function toolPromoteDraft({ draftId, targetPath }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(draftId)) throw new ToolError('draftId must be kebab-case');
  const draftAbs = repoPath(join(DRAFT_DIR_REL, `${draftId}.ts`), [DRAFT_DIR_REL]);
  if (!existsSync(draftAbs)) throw new ToolError(`no draft named "${draftId}"`);
  const targetAbs = repoPath(targetPath, [join('src', 'content')]);
  if (!existsSync(targetAbs) || targetAbs === draftAbs) {
    throw new ToolError('targetPath must be an existing content module other than the draft');
  }

  // Draft lessons come from the draft source; parse the array literal we wrote.
  const draftText = readFileSync(draftAbs, 'utf8');
  const bounds = moduleArrayBounds(draftText);
  if (!bounds) throw new ToolError('could not read the lessons array from the draft');
  let lessons;
  try {
    lessons = JSON.parse(draftText.slice(bounds.start, bounds.end + 1));
  } catch (error) {
    throw new ToolError(`draft array is not valid JSON/TS literal: ${error.message}`);
  }
  const issues = lessons.flatMap((lesson, i) => checkLessonShape(lesson, i));
  if (issues.length) throw new ToolError(`draft has structural problems: ${issues.join(' ')}`);

  const original = readFileSync(targetAbs, 'utf8');
  const targetBounds = moduleArrayBounds(original);
  if (!targetBounds) throw new ToolError(`${relPath(targetAbs)} has no "export const ...Lessons: Lesson[] = [" array to append to`);

  const existingIds = new Set();
  const tail = original.slice(targetBounds.start, targetBounds.end);
  for (const match of tail.matchAll(/^\s*id:\s*'([^']+)'/gm)) existingIds.add(match[1]);
  const duplicates = lessons.map((l) => l.id).filter((id) => existingIds.has(id));
  if (duplicates.length) throw new ToolError(`target module already declares lesson ids: ${duplicates.join(', ')}`);

  const insertion = lessons.map((lesson) => JSON.stringify(lesson, null, 2)).join(',\n  ');
  const before = original.slice(0, targetBounds.end);
  const trimmedBefore = before.replace(/\s*$/, '');
  const needsComma = !trimmedBefore.endsWith('[');
  const updated =
    trimmedBefore + (needsComma ? ',\n  ' : '\n  ') + insertion + '\n' + original.slice(targetBounds.end);

  const backup = `${targetAbs}.bak`;
  renameSync(targetAbs, backup);
  writeFileSync(targetAbs, updated, 'utf8');

  const validation = runRepoValidation();
  if (!validation.ok) {
    rmSync(targetAbs, { force: true });
    renameSync(backup, targetAbs);
    return {
      promoted: false,
      rolledBack: true,
      target: relPath(targetAbs),
      validation,
      hint: 'The module was restored from the backup because repository validation failed after the append.',
    };
  }

  rmSync(backup, { force: true });
  rmSync(draftAbs, { force: true });
  return {
    promoted: true,
    target: relPath(targetAbs),
    lessonsAdded: lessons.length,
    draftRemoved: relPath(draftAbs),
    validation: { ok: true, tail: validation.tail },
  };
}

const HANDLERS = {
  project_info: toolProjectInfo,
  list_content: toolListContent,
  read_file: toolReadFile,
  validate_content: toolValidateContent,
  create_lesson_draft: toolCreateLessonDraft,
  list_drafts: toolListDrafts,
  delete_draft: toolDeleteDraft,
  create_content_module: toolCreateContentModule,
  promote_draft: toolPromoteDraft,
};

function callTool(name, args) {
  const handler = HANDLERS[name];
  if (!handler) throw new ToolError(`unknown tool: ${name}`);
  return handler(args ?? {});
}

// ─── JSON-RPC / MCP framing ──────────────────────────────────────────────────

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function handle(request) {
  const { id, method, params } = request ?? {};
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'interactive-roadmaps', version: '1.0.0' },
        instructions:
          'Authoring server for the Interactive Roadmaps content library. Start with project_info, then read docs/MCP_INSTRUCTIONS.md before writing. Always validate_content before promoting a draft.',
      });
      return;
    case 'ping':
      reply(id, {});
      return;
    case 'tools/list':
      reply(id, { tools: TOOLS });
      return;
    case 'tools/call': {
      const name = params?.name;
      try {
        const data = callTool(name, params?.arguments);
        reply(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Tool failures are reported in-band so the model can self-correct.
        reply(id, { content: [{ type: 'text', text: `Error: ${message}` }], isError: true });
        return;
      }
      return;
    }
    default:
      if (isRequest) replyError(id, -32601, `method not found: ${method}`);
      return; // notifications are ignored
  }
}

function startStdioServer() {
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      replyError(null, -32700, 'parse error');
      return;
    }
    if (Array.isArray(parsed)) parsed.forEach(handle);
    else handle(parsed);
  });
  process.stderr.write('[interactive-roadmaps-mcp] stdio server ready\n');
}

/** `--smoke` exercises the tool surface without a client, for CI and setup checks. */
function smoke() {
  const results = [];
  results.push(['project_info', () => toolProjectInfo().widgetKeys.length === 5]);
  results.push(['list_content', () => Array.isArray(toolListContent().contentModules)]);
  results.push(['read_file allowlist', () => {
    try {
      toolReadFile({ path: join('..', '..', 'windows', 'hosts') });
      return false;
    } catch (error) {
      return /escapes the repository/.test(error.message);
    }
  }]);
  results.push(['widget alias rewrite', () => {
    const issues = [];
    const widgets = normalizeWidgetTypes([{ type: 'context_diagram', props: {} }], issues, 'content.widgets');
    return widgets[0].type === 'context-diagram' && issues.length === 1;
  }]);
  results.push(['dangling marker detected', () => {
    const issues = checkLessonShape(
      { id: 'x-1', title: 'T', content: { markdown: '{{widget:ghost}}', widgets: [] } },
      0
    );
    return issues.some((issue) => issue.includes('ghost'));
  }]);
  results.push(['unknown widget rejected', () => {
    const issues = checkLessonShape(
      { id: 'x-1', title: 'T', content: { markdown: 'ok', widgets: [{ id: 'w1', type: 'mermaid', props: {} }] } },
      0
    );
    return issues.some((issue) => issue.includes('unknown'));
  }]);

  let failed = 0;
  for (const [name, fn] of results) {
    let ok = false;
    let detail = '';
    try {
      ok = fn();
    } catch (error) {
      detail = error.message;
    }
    if (!ok) failed++;
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv.includes('--smoke')) smoke();
else startStdioServer();
