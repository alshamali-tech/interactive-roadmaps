# Connecting Ollama (local models, no API key)

Interactive Roadmaps talks to Ollama through its **OpenAI-compatible** API, so no account,
key or internet connection is needed once a model is downloaded. Everything runs on your
machine and your data never leaves it.

---

## 1. Install Ollama

Download from <https://ollama.com/download> and install. Verify:

```powershell
ollama --version
```

Ollama listens on `127.0.0.1:11434` by default and starts with your session. If it is not
running as a service, start it manually:

```powershell
ollama serve
```

## 2. Pull a model

```powershell
ollama pull llama3.2:3b        # small, fast, fine for testing the UI
ollama pull qwen2.5:7b         # better text quality, still quick
ollama pull qwen2.5:32b        # needs ~20-24 GB VRAM/RAM
ollama pull llama3.1:70b       # serious hardware
```

Check what you have:

```powershell
ollama list
```

## 3. Configure the app

Open the app → **Settings** → the **Local (Ollama)** tab, and set:

| Field | Value |
|---|---|
| Base URL | `http://localhost:11434/v1` (this is the default) |
| Model | the exact name from `ollama list`, e.g. `qwen2.5:7b` |
| API key | leave empty |

Then press **Test connection**. The app requests `<Base URL>/models`, so a green result
means Ollama is reachable from the browser.

Because the model name is typed free-form, copy it exactly — `qwen2.5:7b` and
`qwen2.5:7b-instruct` are different models and Ollama answers `404 model not found`.

## 4. If it fails with "Failed to fetch"

This is almost always **CORS**. The app runs in a browser, which sends an `Origin` header;
Ollama only answers origins it recognises. The app's own error message points at exactly
this, and it is the most common first-run blocker.

Allow your dev origin, then restart Ollama so the variable takes effect:

```powershell
# PowerShell (current session)
$env:OLLAMA_ORIGINS = "http://localhost:5173"
ollama serve
```

```powershell
# Persistent for your Windows user
setx OLLAMA_ORIGINS "http://localhost:5173"
# then fully quit and restart the Ollama tray app
```

Any origin (convenient, less strict):

```powershell
setx OLLAMA_ORIGINS "*"
```

- `http://localhost:5173` is `npm run dev`; `http://localhost:4173` is `npm run preview`.
- If you changed the dev port, use that port.
- macOS / Linux: `launchctl setenv OLLAMA_ORIGINS "*"` or add it to your shell profile,
  then restart Ollama.

### Other failures

| Symptom | Cause and fix |
|---|---|
| `404` from the completion call | Base URL missing `/v1`. The app appends `/chat/completions`, so it must be `http://localhost:11434/v1` |
| `connection refused` | Ollama is not running → `ollama serve`, or reopen the tray app |
| `404 model not found` | Model name mismatch → copy it from `ollama list` |
| Works on `localhost`, fails on a LAN IP | Ollama binds `127.0.0.1`; set `OLLAMA_HOST=0.0.0.0` and add that origin to `OLLAMA_ORIGINS` |
| Very slow first token | Model too large for your hardware — try `llama3.2:3b`, or close other GPU users |
| Response arrives then stops mid-way | Context exhaustion; see the tier note below |

## 5. Which model the app will expect from you

On the lesson/course generator the app detects a capability **tier from the model name**
(`src/engine/modelCapability.ts`) and adapts generation to it:

| Model tag pattern | Tier | Consequence |
|---|---|---|
| under `30b` (`llama3.2:3b`, `qwen2.5:7b`) | **weak** | fewer stages, only `sandbox` / `socratic-chat` / `trade-off` widgets, more retries, AI filler stripped |
| `30b`–`99b` (`qwen2.5:32b`, `llama3.1:70b`) | **medium** | `mutator` and `context-diagram` unlocked, few-shot examples on |
| `100b`+ (`llama3.1:405b`) | **strong** | most compact stage plan, no filler stripping |

Names with no size tag (e.g. `llama3:latest`) are treated as **weak on purpose** — the app
assumes nothing it cannot measure. If you know better, override it in
**Settings → Model Capability → Override tier**; the panel shows the detected tier and the
reason next to the override, so you can see what you are changing.

## 6. Optional: stronger generation with staged mode

**Settings → Lesson Generation Pipeline → Staged generation (experimental)** generates each
lesson in small focused steps with per-stage validation, one retry, and automatic fallback
to the single-pass path if a stage still fails. It exists specifically for local models.
Off by default.

## 7. Fully offline use

After a model is pulled, everything except the optional URL-content fetcher works without
internet: static curriculum, AI tutor, course generation, progress and generated courses
(kept in your browser's IndexedDB). Fetching an article URL needs internet; pasting text
into the generator does not.
