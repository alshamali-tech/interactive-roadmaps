# Architecture review

Assessment of Interactive Roadmaps as of 2026-11-28, after the W1.x diagram work, Sprint 2
staged generation, and a full UI-reachability audit. Ordered by risk, with the file evidence
for each claim.

## What the architecture gets right

- **No backend is a real design, not a shortcut.** Content is TS modules, progress is
  Zustand + `localStorage`, generated courses are Dexie/IndexedDB, AI goes browser→provider.
  It deploys as static files to Cloudflare Pages and keeps working offline once a model is
  local.
- **Zod as the single content contract.** Every AI output lands in a schema
  (`generatorSchema.ts`), and the same schemas validate authored content
  (`contentValidation.test.ts`) and power the MCP server's promotion gate.
- **Deterministic fallbacks everywhere they matter.** Focused mode survives malformed JSON,
  `fixCommonDiagramErrors` repairs diagrams, staged generation degrades per stage and then
  per lesson back to the single-call path, the journal degrades to a no-op without IndexedDB.
- **Test discipline.** 800 tests, provider always mocked, no test can reach the network.

## High risk

### 1. Two sources of truth for the same types

`src/engine/generatorSchema.ts` derives `WidgetConfig` via `z.infer`, while
`src/curriculum/schema.ts:243-281` hand-writes a parallel `WidgetConfig` union; `Lesson`
(curriculum) and `GeneratedLesson` (Zod) are two more near-identical shapes. They agree today
by discipline only — nothing fails if one gains a field.

**Fix:** make `curriculum/schema.ts` re-export the inferred types and delete the hand-written
union, keeping only the `Lesson` alias if the authored shape genuinely differs. One commit,
`tsc` proves it.

### 2. The registry cannot type-check a widget against its own props schema

`registry.ts:40` declares `WidgetComponent<P extends WidgetProps = any>` and registration uses
`as unknown as WidgetComponent<WidgetProps>` (`context-diagram`, `socratic-chat`). I verified
the shapes currently agree — but the cast means renaming `props.diagram` would fail only at
runtime, in production, for one widget type.

**Fix:** a `WidgetPropsByType` map keyed by the literal union, so `register<'context-diagram'>`
requires `ContextDiagramProps`. Removes both casts.

### 3. Retry/abort logic is duplicated and inconsistent

`courseGenerator.ts:withRetry` retries a fixed 500 ms, has no backoff growth, **and retries
`AbortError` like any other failure**; `diagramGenerator.ts` has correct `throwIfAborted` +
exponential backoff + abort-aware sleep. Two implementations of one concern, one of them wrong.

**Fix:** extract one `engine/retry.ts` (abort-aware, exponential, jitter) and use it in both.

### 4. Capability tiers only apply in one of two generation modes

`resolveModelTier` is called exclusively from `stagePipeline.ts`. In the default single-call
path nothing filters widgets by tier, so the same model gets `context-diagram` requests it is
known to fail — which is precisely the failure the Sprint 2 spec exists to prevent. Now that
`CustomCourse` and the lesson page reach all widgets, this is user-visible.

**Fix:** filter `widgetSuggestions` by tier in `buildLessonUserPrompt`/`buildFocusedUserPrompt`
too, using the existing `isWidgetAllowed`.

### 5. Two interview state machines

`src/engine/interviewState.ts` (`useInterviewStore`) and `src/engine/interviewPrompts.ts` have
zero production callers — `SocraticChat.tsx:47,197` keeps its own local `InterviewState` and
builds prompts inline. A live feature is therefore maintained in exactly one of two places,
and the other is dead code that reads like the real one.

**Fix:** delete the unused modules, or migrate `SocraticChat` to them. Do not leave both.

## Medium risk

6. **Schema↔prompt drift is this repo's recurring bug class.** Widget keys, diagram rules,
   and word limits are restated in prose in `generatorSchema.ts`, `diagramPrompts.ts`,
   `stagePrompts.ts`, `docs/MCP_INSTRUCTIONS.md` and `universal/README.md`. I found and fixed
   three independent drifts (schema Rule 5 untaught, braced `:::widget` markers that parsed as
   nothing, underscore widget keys). Only some paths are guarded by tests.
   **Fix:** export constraint strings from one module and assert them in tests; the diagram
   prompts already have such a test — extend the pattern.
7. **`Lesson.tsx:392` attaches a `MutationObserver` to `document.body`** for the whole subtree
   while a lesson is open, alongside an IntersectionObserver. With streaming chat DOM churn
   this is measurable. **Fix:** scope observation to the article container, or rely on
   IntersectionObserver alone.
8. **Custom course rendering duplicates the lesson page** rather than sharing a component, so
   fixes (tutor, progress, headings) must be made twice — which is how generated courses ended
   up with no completion tracking at all. **Fix:** one `LessonView` component; pages supply data.
9. **Routing gaps:** no `ScrollRestoration` and no per-route `errorElement` because
   `BrowserRouter` is used (react-router 7 data APIs need `createBrowserRouter`); `/track/:trackId`
   is an orphan route nothing links to. **Fix:** adopt a data router or add a scroll effect;
   either link the track route or remove it.
10. **Per-phase review is plan-only.** Lessons can be reordered/renamed/deleted during plan
    review, but there is no editing at all after generation, and `rawResponse` on
    `GenerationError` is declared and never populated — so a provider failure that returned
    garbage is unrecoverable for debugging.

## Low risk / hygiene

- `src/hooks/useTheme.ts` is dead (the live one is `layout/themeStore.ts`); `SettingsModal`
  keeps an unused `firstInputRef`; `generateCourse`, `resetProgress`, `validateDAG`,
  `defaultTrack` have no callers.
- 21 `any` annotations remain, almost all in test files; the single production one is the
  widget props bag in `MarkdownRenderer.tsx:133`.
- `graph.ts` still advertises drag/connect/delete for the pipeline lesson although the widget is
  now read-only React Flow; `module-01-foundations.ts` ships a commented-out widget TODO.
- No coverage provider, so the >80% diagram-code target is unmeasurable.

## Not yet implemented (Phase 3 items)

| Item | Recommended dependency-free approach |
|---|---|
| P5 WebLLM in-browser model | Needs `@mlc-ai/web-llm` (large, GPU-gated). Build the provider seam + "unsupported without the optional dep" path first |
| P6 PDF export | `window.print()` + a print stylesheet — no html2pdf dependency needed |
| P7 Offline indicator | Hand-written service worker + cache-first for hashed assets; the app is already offline-capable after first load |
| P8 Analytics | Local event bus + queued `localStorage` counters, optional POST target; nothing phones home today and that should stay the default |

## Suggested order of attack

1. Single source of truth for widget/lesson types (#1) — small, compiler-provable.
2. Shared abort-aware retry (#3) — removes a real defect class.
3. Tier gating in the default mode (#4) — makes the capability work users were promised.
4. Resolve the interview duplication (#5).
5. Then Phase 3 items in the order above.
