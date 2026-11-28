# MCP Server — connecting Qwen Desktop / Claude Desktop to this repo

The server in `mcp-server/` lets a local AI agent author **courses and lessons** for
Interactive Roadmaps directly: it reads the repo's authoring contract, writes drafts,
runs the project's own Zod validation, and only then promotes content into a module.

It has **no dependencies** — nothing to install, and it works offline.

---

## 1. Prerequisites

- Node.js 18+ (this repo was verified on v24).
- The repository cloned locally. Paths below assume `C:\Users\<you>\Desktop\projects\engineerAcademy`.
- Vitest already present via the project's `package.json` (validation runs through it).

Verify the server before wiring any client:

```powershell
node mcp-server/server.mjs --smoke
```

Expected: six `PASS` lines and exit code 0.

---

## 2. Register with Claude Desktop

1. Open **Settings → Developer → Edit Config** (or edit the file directly):

   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```

2. Add (merge into any existing `mcpServers` block — do not replace it):

   ```json
   {
     "mcpServers": {
       "interactive-roadmaps": {
         "command": "node",
         "args": [
           "C:\\Users\\<you>\\Desktop\\projects\\engineerAcademy\\mcp-server\\server.mjs"
         ]
       }
     }
   }
   ```

3. **Fully quit and relaunch** Claude Desktop (tray icon → Quit; closing the window is
   not enough — the MCP config is read at process start).
4. The hammer/plug icon should list `interactive-roadmaps` with 9 tools. Ask it:
   *"Call project_info and tell me the valid widget keys."*

## 3. Register with Qwen Desktop / Qwen Code

Qwen reads MCP servers from its settings JSON — project-level
`.qwen/settings.json` (this repo) or global `~/.qwen/settings.json`:

```json
{
  "mcpServers": {
    "interactive-roadmaps": {
      "command": "node",
      "args": [
        "C:\\Users\\<you>\\Desktop\\projects\\engineerAcademy\\mcp-server\\server.mjs"
      ]
    }
  }
}
```

Restart the session, then confirm with `/mcp` (or ask the agent to list tools).
The same block works for any MCP-capable client (Cursor, Windsurf, Continue,
`mcp-cli`), with the client's own config path.

**Debugging a client that shows no tools** — speak JSON-RPC to it yourself:

```powershell
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node mcp-server/server.mjs
```

A `protocolVersion`/`serverInfo` reply means the server is fine and the client config
(path, `command`, or backslash escaping) is the problem.

---

## 4. The tools

| Tool | What it does |
|---|---|
| `project_info` | Repo orientation: widget keys, lesson shape, where the rules live. Call first |
| `list_content` | Content modules, draft files, curriculum graph, heuristic lesson ids |
| `read_file` | Read `docs/`, `src/content/`, `src/curriculum/`, the schema, the parser. Allowlisted |
| `validate_content` | Runs `src/engine/contentValidation.test.ts` — the authoritative Zod check |
| `create_lesson_draft` | Writes `src/content/_drafts/<id>.ts`; reports structural problems first |
| `list_drafts` / `delete_draft` | Manage the pending queue |
| `create_content_module` | Creates a **new** module file (never overwrites an existing one) |
| `promote_draft` | Appends a draft's lessons into a real module, backs up to `.bak`, runs validation, **auto-rolls-back on failure** |

### Why validation shells out to Vitest

`src/engine/contentValidation.test.ts` parses authored content with the real
`WidgetConfigSchema` / `DiagramSchema` from `src/engine/generatorSchema.ts`. Re-declaring
those rules in JavaScript would drift the first time a widget changes, so the server
delegates and reports the actual result.

### Guardrails built in

- **Widget key rewriting.** Authoring specs keep writing `context_diagram`, `trade_off`,
  `socratic_chat`, `node_graph`; the registry only knows the hyphenated forms and an
  unrecognised key renders nothing at all. The server rewrites the known aliases and says
  so, and rejects anything still unknown.
- **Dangling markers.** `{{widget:id}}` in markdown without a matching `content.widgets`
  entry (or the reverse) is reported before the draft is written. HTML comments are
  excluded, so a disabled `<!-- {{widget:...}} -->` TODO is not a false positive.
- **Path containment.** Reads are allowlisted; writes are limited to
  `src/content/_drafts/` and new module files. Anything escaping the repo is refused.
- **Nothing ships silently.** Drafts are not imported by the app; a human or the agent
  must `promote_draft`, and that step only sticks if validation passes.

---

## 5. Live bridge — connect while using the website

Drafts are files, so a browser session can't see them. The optional HTTP bridge exposes
them read-only on loopback, which lets the running site preview an agent-authored course
before it is promoted:

```powershell
node mcp-server/bridge.mjs --port 8787
```

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness + draft count |
| `GET /drafts` | Draft ids, sizes, mtimes |
| `GET /drafts/:id` | Parsed lesson objects |

Security posture: binds `127.0.0.1` only, `GET`/`OPTIONS` only, CORS restricted to the
localhost dev origins (`5173`, `4173`), and a non-loopback `Host` header is rejected
(DNS-rebinding guard). It never writes.

Point a browser at `http://127.0.0.1:8787/drafts` while `npm run dev` is running to
confirm the pair works.

---

## 6. Recommended agent workflow

1. `project_info`
2. `read_file` → `docs/MCP_INSTRUCTIONS.md` (the authoring contract: style, widget syntax,
   diagram constraints)
3. `read_file` → an existing module, to match tone and structure
4. `create_lesson_draft`
5. `validate_content` → fix until green
6. `promote_draft` (or `delete_draft`)
7. `git diff` review before committing
