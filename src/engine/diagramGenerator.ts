/**
 * Context-Aware Diagram Generator — W1.1 Staged Pipeline
 *
 * Three-stage pipeline for generating context-aware diagrams:
 *   Stage 1 — generateDiagramText:  { topic, context, previousConcept } → { text, keyComponents }
 *   Stage 2 — extractDiagramJSON:   { text, keyComponents, diagramType? } → Diagram | null
 *   Stage 3 — mergeAndValidate:     { text, diagram } → { markdown, widgets }
 *
 * Orchestrator: generateContextDiagram(topic, context, previousConcepts, options?)
 *
 * Design philosophy (works even with weak models):
 *   - Separate concerns: prose generation ≠ structural extraction ≠ merging.
 *   - Validate at each stage against the W1.2 DiagramSchema (generatorSchema.ts).
 *   - Stage 2 retries up to `maxRetries` (default 2) with a stricter prompt,
 *     validator error feedback, and exponential backoff (500ms → 1000ms → ...).
 *   - Graceful degradation: if extraction fails, the pipeline returns a useful
 *     text-only representation (buildTextFallback) — it never feels broken.
 *
 * Idempotency & caching:
 *   - Stage 2 runs at temperature 0 with deterministic prompts and caches
 *     successful results keyed by its exact input → same input, same output.
 *   - Stage 1 output is cached too, so Stage 2 retries (or repeated pipeline
 *     runs, e.g. "regenerate diagram") never regenerate the text.
 *
 * This replaces the old free-form NodeGraph/mermaid generator. The output
 * widget is `context-diagram` (see components/universal/ContextDiagram.tsx).
 */

import { generateRawCompletion } from './aiService';
import {
  extractJson,
  validateDiagram,
  formatDiagramErrors,
  WidgetConfigSchema,
  type Diagram,
  type DiagramType,
  type WidgetConfig,
} from './generatorSchema';
import { useSettingsStore, type AISettings } from './settings';
import {
  DIAGRAM_TEXT_SYSTEM_PROMPT,
  DIAGRAM_EXTRACTION_SYSTEM_PROMPT,
  DIAGRAM_EXTRACTION_STRICT_PROMPT,
  buildDiagramTextUserPrompt,
  buildDiagramExtractionUserPrompt,
} from './diagramPrompts';

// Re-export prompts for convenience/backward compatibility
export {
  DIAGRAM_TEXT_SYSTEM_PROMPT,
  DIAGRAM_EXTRACTION_SYSTEM_PROMPT,
  DIAGRAM_EXTRACTION_STRICT_PROMPT,
};

// ───────────────────────────────────────────────────────────────
// Contracts (input/output types for each stage)
// ───────────────────────────────────────────────────────────────

/** Stage 1 input: what to explain and where it fits. */
export interface DiagramTextInput {
  /** The concept/topic to explain */
  topic: string;
  /** Surrounding lesson/course context (may be empty) */
  context: string;
  /** Concepts already covered — build on them, don't re-explain */
  previousConcept: string[];
}

/** Stage 1 output: prose + the entities that become diagram nodes. */
export interface DiagramTextOutput {
  /** Markdown explanation (200-400 words, trailer line removed) */
  text: string;
  /** Key components/entities extracted from the explanation (max 8, ≤20 chars each) */
  keyComponents: string[];
}

/** Stage 2 input: text to structure into a diagram. */
export interface DiagramJSONInput {
  /** The explanation text to extract a diagram from */
  text: string;
  /** Entities that should become the primary nodes */
  keyComponents: string[];
  /** Force a diagram type; otherwise the model chooses the best fit */
  diagramType?: DiagramType;
}

/** Stage 3 input: combine prose with the (possibly failed) diagram. */
export interface MergeAndValidateInput {
  /** The markdown explanation text */
  text: string;
  /** Validated diagram, or null if Stage 2 failed */
  diagram: Diagram | null;
  /** Optional: components used to build a richer text-only fallback outline */
  keyComponents?: string[];
}

/** Stage 3 output: lesson-ready content. */
export interface MergeAndValidateOutput {
  /** Markdown with a {{widget:id}} marker (or text-only fallback note) */
  markdown: string;
  /** Widget configs referenced by the markdown (empty on text-only fallback) */
  widgets: WidgetConfig[];
}

/** Runtime options shared by AI-calling stages. */
export interface StageRuntimeOptions {
  /** AI provider settings (defaults to the settings store) */
  settings?: AISettings;
  /** AbortSignal to cancel generation */
  signal?: AbortSignal;
}

/** Stage 2 options: retry behavior. */
export interface ExtractionOptions extends StageRuntimeOptions {
  /** Max retries after the first attempt (default: 2 → up to 3 attempts) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 500 → 500, 1000, ...). Use 0 in tests. */
  retryBaseDelayMs?: number;
}

/** Stage 3 options. */
export interface MergeOptions {
  /** Widget ID used in the markdown marker (default: "context-diagram-1") */
  widgetId?: string;
}

/** Orchestrator configuration. */
export interface ContextDiagramOptions extends ExtractionOptions, MergeOptions {
  /** Skip Stage 1 when text is already provided (via existingText or context) */
  skipTextGeneration?: boolean;
  /** Pre-written explanation to use when skipTextGeneration is true (falls back to context) */
  existingText?: string;
  /** Optional keyComponents override for the skip path (otherwise parsed from the text) */
  keyComponents?: string[];
  /** Force a diagram type in Stage 2 */
  diagramType?: DiagramType;
  /** If true (default), never fail — always return a useful text-only result on errors */
  fallbackToTextOnly?: boolean;
}

/** Full orchestrator result — final widget configuration + debugging metadata. */
export interface ContextDiagramResult extends MergeAndValidateOutput {
  /** The explanation text (always present, even on fallback) */
  text: string;
  /** Key components extracted in Stage 1 (or parsed on the skip path) */
  keyComponents: string[];
  /** The validated diagram, or null if extraction failed */
  diagram: Diagram | null;
  /** True if the result is text-only because diagram generation failed */
  textOnlyFallback: boolean;
  /** How many Stage 2 retries were used (0 = first attempt succeeded) */
  retriesUsed: number;
  /** Error message describing what failed (set even on graceful fallback) */
  error?: string;
}

// ───────────────────────────────────────────────────────────────
// Constants & internal helpers
// ───────────────────────────────────────────────────────────────

const LOG_PREFIX = '[diagramGenerator]';
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const MAX_COMPONENTS = 8;
const MAX_COMPONENT_LENGTH = 20;
const TEXT_CACHE_LIMIT = 30;
const DIAGRAM_CACHE_LIMIT = 50;

/** Compact single-line preview for logs (never dump full prompts). */
function preview(value: string, max = 160): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Diagram generation aborted.', 'AbortError');
  }
}

/** Abort-aware sleep used for exponential backoff between retries. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Diagram generation aborted.', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** FIFO-bounded cache insert (prevents unbounded memory growth). */
function cacheSet<T>(cache: Map<string, T>, key: string, value: T, limit: number): void {
  if (cache.size >= limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function resolveSettings(options: StageRuntimeOptions): AISettings {
  return options.settings ?? useSettingsStore.getState().aiSettings;
}

/** Deterministic widget ID derived from the topic (kebab-case slug). */
export function defaultDiagramWidgetId(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug ? `${slug}-diagram` : 'context-diagram-1';
}

// ───────────────────────────────────────────────────────────────
// Key-component parsing (pure, deterministic — no AI involved)
// ───────────────────────────────────────────────────────────────

function cleanComponent(raw: string): string {
  return raw
    .replace(/[`*]/g, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/[.\s]+$/g, '')
    .trim()
    .slice(0, MAX_COMPONENT_LENGTH)
    .trim();
}

function dedupeComponents(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const cleaned = cleanComponent(item);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= MAX_COMPONENTS) break;
  }
  return result;
}

/**
 * Fallback component extraction (when no "Key components:" trailer exists):
 * collects **bold** spans, then markdown headings. Pure and deterministic.
 */
export function extractKeyComponents(text: string): string[] {
  const bold = [...text.matchAll(/\*\*([^*\n]{2,60})\*\*/g)].map((m) => m[1]);
  if (bold.length > 0) return dedupeComponents(bold);
  const headings = [...text.matchAll(/^#{2,4}\s+(.+)$/gm)].map((m) => m[1]);
  return dedupeComponents(headings);
}

/**
 * Parses the Stage 1 response: strips wrapping code fences, finds the
 * "Key components:" trailer line (bold-tolerant), removes it from the text,
 * and falls back to bold/heading extraction when the trailer is missing.
 */
function parseStage1Response(raw: string): DiagramTextOutput {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, '');

  const lines = cleaned.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const stripped = lines[i].replace(/\*\*/g, '').replace(/__/g, '').trim();
    const match = stripped.match(/^key components\s*:\s*(.+)$/i);
    if (match) {
      const keyComponents = dedupeComponents(match[1].split(/[,;]/));
      const text = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').trim();
      return { text, keyComponents };
    }
  }

  return { text: cleaned, keyComponents: extractKeyComponents(cleaned) };
}

// ───────────────────────────────────────────────────────────────
// Text-only fallback (pure, deterministic — can never fail)
// ───────────────────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function findSentenceMentioning(text: string, component: string): string | null {
  const needle = component.toLowerCase();
  const sentence = splitSentences(text).find((s) => s.toLowerCase().includes(needle));
  if (!sentence) return null;
  return sentence.length > 140 ? `${sentence.slice(0, 140).trimEnd()}…` : sentence;
}

/**
 * Builds a useful text-based representation of what the diagram would have
 * shown. Used when Stage 2 fails after all retries — pure code, no AI call,
 * so the fallback itself can never fail.
 *
 * Strategy:
 *   - ≥2 key components → numbered walkthrough, each enriched with the first
 *     sentence from the text that mentions that component.
 *   - Otherwise → reuse existing list lines from the text, or summarize the
 *     first few sentences as bullets.
 * Always starts with a friendly note explaining the diagram is unavailable.
 */
export function buildTextFallback(text: string, keyComponents: string[] = []): string {
  const parts: string[] = [
    '> 📝 **Note:** The interactive diagram for this section could not be generated, so the same structure is summarized below as text.',
  ];

  const components = keyComponents.slice(0, MAX_COMPONENTS);
  if (components.length >= 2) {
    const items = components.map((component, index) => {
      const sentence = findSentenceMentioning(text, component);
      return `${index + 1}. **${component}**${sentence ? ` — ${sentence}` : ''}`;
    });
    parts.push(`### Key components in order\n\n${items.join('\n')}`);
  } else {
    const listLines = text
      .split('\n')
      .filter((l) => /^\s*(?:\d+[.)]|[-*])\s+/.test(l))
      .slice(0, 6);
    if (listLines.length >= 2) {
      parts.push(`### Summary\n\n${listLines.join('\n')}`);
    } else {
      const sentences = splitSentences(text).filter((s) => s.length > 20).slice(0, 3);
      if (sentences.length > 0) {
        parts.push(`### Summary\n\n${sentences.map((s) => `- ${s}`).join('\n')}`);
      }
    }
  }

  return parts.join('\n\n');
}

// ───────────────────────────────────────────────────────────────
// Caches (idempotency + "don't regenerate text on retry")
// ───────────────────────────────────────────────────────────────

const textCache = new Map<string, DiagramTextOutput>();
const diagramCache = new Map<string, Diagram>();

/** Clears the Stage 1 / Stage 2 caches (used by tests and after settings changes). */
export function clearDiagramCaches(): void {
  textCache.clear();
  diagramCache.clear();
}

// ───────────────────────────────────────────────────────────────
// Stage 1: Text Generation
// ───────────────────────────────────────────────────────────────

/**
 * **Stage 1 — Text Generation**
 *
 * Generates a natural-language explanation of the topic focused on
 * relationships, flows, or architecture, and extracts the key components
 * that will become diagram nodes.
 *
 * Results are cached by (topic, context, previousConcept, provider, model),
 * so repeated calls — e.g. when Stage 2 fails and the user retries — reuse
 * the same text instead of regenerating it.
 *
 * @throws Error if the topic is empty or the AI call fails
 */
export async function generateDiagramText(
  input: DiagramTextInput,
  options: StageRuntimeOptions = {}
): Promise<DiagramTextOutput> {
  const { topic, context, previousConcept } = input;
  if (!topic || !topic.trim()) {
    throw new Error('generateDiagramText requires a non-empty "topic".');
  }
  throwIfAborted(options.signal);
  const settings = resolveSettings(options);

  const cacheKey = JSON.stringify([
    'text',
    topic.trim(),
    context.trim(),
    previousConcept,
    settings.provider,
    settings.model,
  ]);
  const cached = textCache.get(cacheKey);
  if (cached) {
    console.info(`${LOG_PREFIX} Stage 1 cache hit — reusing previously generated text.`);
    return cached;
  }

  console.debug(`${LOG_PREFIX} Stage 1 (text) input:`, {
    topic,
    context: preview(context),
    previousConcept,
  });

  const userPrompt = buildDiagramTextUserPrompt(topic, context, previousConcept);
  const raw = await generateRawCompletion(DIAGRAM_TEXT_SYSTEM_PROMPT, userPrompt, settings, {
    temperature: 0.4,
    signal: options.signal,
  });

  const result = parseStage1Response(raw);
  if (!result.text.trim()) {
    throw new Error('Stage 1 returned empty explanation text.');
  }

  console.debug(`${LOG_PREFIX} Stage 1 output:`, {
    text: preview(result.text),
    keyComponents: result.keyComponents,
  });

  cacheSet(textCache, cacheKey, result, TEXT_CACHE_LIMIT);
  return result;
}

// ───────────────────────────────────────────────────────────────
// Stage 2: JSON Extraction (retry + backoff + idempotency cache)
// ───────────────────────────────────────────────────────────────

/**
 * Deterministic pre-validation cleanup for weak models: clamps over-long
 * string fields to the schema limits (title 50, label 20, description 200,
 * edge label 15). Never touches IDs, types, or structure — semantic rules
 * are still enforced by the validator.
 */
export function normalizeDiagramCandidate(parsed: unknown): unknown {
  const clampField = (value: unknown, max: number): unknown =>
    typeof value === 'string' && value.length > max ? value.slice(0, max).trimEnd() : value;

  if (typeof parsed !== 'object' || parsed === null) return parsed;
  const candidate = parsed as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...candidate };
  normalized.title = clampField(candidate.title, 50);

  if (Array.isArray(candidate.nodes)) {
    normalized.nodes = candidate.nodes.map((node) => {
      if (typeof node !== 'object' || node === null) return node;
      const n = node as Record<string, unknown>;
      return {
        ...n,
        label: clampField(n.label, 20),
        description: clampField(n.description, 200),
      };
    });
  }
  if (Array.isArray(candidate.edges)) {
    normalized.edges = candidate.edges.map((edge) => {
      if (typeof edge !== 'object' || edge === null) return edge;
      const e = edge as Record<string, unknown>;
      return { ...e, label: clampField(e.label, 15) };
    });
  }
  return normalized;
}

/** Internal Stage 2 result with retry metadata (used by the orchestrator). */
interface ExtractionMeta {
  diagram: Diagram | null;
  /** Total AI attempts made (0 when served from cache) */
  attempts: number;
  lastError: string | null;
  fromCache: boolean;
}

async function extractDiagramWithMeta(
  input: DiagramJSONInput,
  options: ExtractionOptions = {}
): Promise<ExtractionMeta> {
  const { text, keyComponents, diagramType } = input;
  if (!text || !text.trim()) {
    throw new Error('extractDiagramJSON requires non-empty "text".');
  }
  throwIfAborted(options.signal);
  const settings = resolveSettings(options);
  const maxRetries = Math.max(0, Math.min(5, options.maxRetries ?? DEFAULT_MAX_RETRIES));
  const baseDelay = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;

  // Idempotency: same input + same model → same output (served from cache).
  const cacheKey = JSON.stringify([
    'diagram',
    text,
    keyComponents,
    diagramType ?? null,
    settings.provider,
    settings.model,
  ]);
  const cached = diagramCache.get(cacheKey);
  if (cached) {
    console.info(`${LOG_PREFIX} Stage 2 cache hit — returning identical diagram (idempotent).`);
    return { diagram: cached, attempts: 0, lastError: null, fromCache: true };
  }

  console.debug(`${LOG_PREFIX} Stage 2 (JSON) input:`, {
    text: preview(text),
    keyComponents,
    diagramType: diagramType ?? '(auto)',
    maxRetries,
  });

  let lastError = '';
  const totalAttempts = maxRetries + 1;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    throwIfAborted(options.signal);
    const strict = attempt > 0;
    const systemPrompt = strict
      ? DIAGRAM_EXTRACTION_STRICT_PROMPT
      : DIAGRAM_EXTRACTION_SYSTEM_PROMPT;
    const userPrompt = buildDiagramExtractionUserPrompt(text, keyComponents, diagramType, {
      strict,
      validationError: strict ? lastError : undefined,
    });

    console.debug(
      `${LOG_PREFIX} Stage 2 attempt ${attempt + 1}/${totalAttempts} (${strict ? 'strict' : 'standard'} prompt)...`
    );

    try {
      const response = await generateRawCompletion(systemPrompt, userPrompt, settings, {
        temperature: 0,
        signal: options.signal,
      });
      const parsed = extractJson(response);
      const candidate = normalizeDiagramCandidate(parsed);
      const validation = validateDiagram(candidate);
      if (!validation.valid) {
        throw new Error(formatDiagramErrors(validation.errors));
      }

      console.debug(`${LOG_PREFIX} Stage 2 output:`, {
        type: validation.diagram.type,
        title: validation.diagram.title,
        nodes: validation.diagram.nodes.length,
        edges: validation.diagram.edges.length,
      });
      cacheSet(diagramCache, cacheKey, validation.diagram, DIAGRAM_CACHE_LIMIT);
      return { diagram: validation.diagram, attempts: attempt + 1, lastError: null, fromCache: false };
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = errorMessage(error);
      console.warn(
        `${LOG_PREFIX} Stage 2 attempt ${attempt + 1}/${totalAttempts} failed: ${lastError}`
      );
      if (attempt < totalAttempts - 1) {
        const backoff = baseDelay * 2 ** attempt;
        console.info(`${LOG_PREFIX} Retrying Stage 2 in ${backoff}ms (exponential backoff)...`);
        await delay(backoff, options.signal);
      }
    }
  }

  console.warn(
    `${LOG_PREFIX} Stage 2 exhausted all ${totalAttempts} attempts — using text-only fallback representation.`
  );
  return { diagram: null, attempts: totalAttempts, lastError, fromCache: false };
}

/**
 * **Stage 2 — JSON Extraction**
 *
 * Converts the text explanation into a structured Diagram, validated
 * against the W1.2 DiagramSchema (generatorSchema.ts).
 *
 * Retry behavior: up to `maxRetries` retries (default 2 → 3 total attempts).
 * Retries use the stricter system prompt plus the exact validator errors,
 * with exponential backoff (500ms, 1000ms, ... by default).
 *
 * Fallback: returns `null` when all attempts fail — the pipeline then uses
 * the deterministic text-based representation (buildTextFallback) in Stage 3.
 *
 * Idempotent: temperature 0 + deterministic prompts + a success cache keyed
 * by the exact input guarantee the same input produces the same output.
 *
 * @throws Error only for invalid input (empty text) or abort — validation
 *         failures are handled internally and result in `null`.
 */
export async function extractDiagramJSON(
  input: DiagramJSONInput,
  options: ExtractionOptions = {}
): Promise<Diagram | null> {
  const meta = await extractDiagramWithMeta(input, options);
  return meta.diagram;
}

// ───────────────────────────────────────────────────────────────
// Stage 3: Merge and Validate (pure — no AI, no side effects)
// ───────────────────────────────────────────────────────────────

/**
 * **Stage 3 — Merge and Validate**
 *
 * Combines the text explanation with the diagram widget configuration:
 *   - Diagram present → re-validates it (defense in depth), builds a
 *     `context-diagram` WidgetConfig, validates it against WidgetConfigSchema,
 *     and appends the canonical `{{widget:id}}` marker to the markdown.
 *   - Diagram null (or invalid at merge time) → returns the text plus a
 *     friendly note and a text-based outline (buildTextFallback). Never
 *     returns empty or broken-looking content.
 *
 * Pure function: same input → same output, no AI calls.
 */
export function mergeAndValidate(
  input: MergeAndValidateInput,
  options: MergeOptions = {}
): MergeAndValidateOutput {
  const { text, diagram, keyComponents = [] } = input;
  const widgetId = options.widgetId ?? 'context-diagram-1';
  const cleanText = text.trim();

  console.debug(`${LOG_PREFIX} Stage 3 (merge) input:`, {
    text: preview(cleanText),
    hasDiagram: diagram !== null,
    widgetId,
  });

  if (diagram) {
    const validation = validateDiagram(diagram);
    if (validation.valid) {
      const widget: WidgetConfig = {
        id: widgetId,
        type: 'context-diagram',
        props: { diagram: validation.diagram },
      };
      const widgetCheck = WidgetConfigSchema.safeParse(widget);
      if (widgetCheck.success) {
        const markdown = cleanText
          ? `${cleanText}\n\n{{widget:${widgetId}}}`
          : `{{widget:${widgetId}}}`;
        console.debug(`${LOG_PREFIX} Stage 3 output: markdown + 1 context-diagram widget.`);
        return { markdown, widgets: [widgetCheck.data] };
      }
      console.warn(
        `${LOG_PREFIX} Stage 3: widget config failed schema validation — falling back to text-only.`
      );
    } else {
      console.warn(
        `${LOG_PREFIX} Stage 3: diagram failed re-validation — falling back to text-only.\n${formatDiagramErrors(validation.errors)}`
      );
    }
  }

  // Text-only path (diagram generation failed or produced an invalid diagram)
  const fallbackBlock = buildTextFallback(cleanText, keyComponents);
  const markdown = cleanText ? `${cleanText}\n\n${fallbackBlock}` : fallbackBlock;
  console.debug(`${LOG_PREFIX} Stage 3 output: text-only fallback (0 widgets).`);
  return { markdown, widgets: [] };
}

// ───────────────────────────────────────────────────────────────
// Orchestrator: Stage 1 → Stage 2 → Stage 3
// ───────────────────────────────────────────────────────────────

/**
 * **Full Pipeline Orchestrator**
 *
 * Runs Text → JSON → Merge in sequence, passing outputs between stages and
 * handling errors gracefully at each stage:
 *   - Stage 1 failure → (default) text-only result built from existingText /
 *     context, with the error recorded; or throws if fallbackToTextOnly=false.
 *   - Stage 2 failure after retries → text-only result with a useful outline.
 *     Stage 1 text is cached, so retrying the pipeline never regenerates it.
 *   - Aborts always propagate immediately (user cancellation is not a failure).
 *
 * @param topic - The concept to visualize
 * @param context - Surrounding lesson/course context
 * @param previousConcepts - Concepts already covered (coherence)
 * @param options - Pipeline configuration (see ContextDiagramOptions)
 * @returns Lesson-ready { markdown, widgets } plus debugging metadata
 *
 * @example
 * ```ts
 * const result = await generateContextDiagram('HTTP Request Lifecycle', lessonMarkdown, ['DNS']);
 * lesson.content.markdown += '\n\n' + result.markdown;
 * lesson.content.widgets.push(...result.widgets);
 * ```
 */
export async function generateContextDiagram(
  topic: string,
  context: string,
  previousConcepts: string[] = [],
  options: ContextDiagramOptions = {}
): Promise<ContextDiagramResult> {
  const {
    skipTextGeneration = false,
    existingText,
    keyComponents: keyComponentsOverride,
    diagramType,
    fallbackToTextOnly = true,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseDelayMs,
    widgetId,
    signal,
  } = options;

  const resolvedSettings = resolveSettings(options);
  const resolvedWidgetId = widgetId ?? defaultDiagramWidgetId(topic);

  console.debug(`${LOG_PREFIX} Pipeline start:`, {
    topic,
    context: preview(context),
    previousConcepts,
    skipTextGeneration,
    diagramType: diagramType ?? '(auto)',
    maxRetries,
    fallbackToTextOnly,
  });

  let stage1: DiagramTextOutput | null = null;

  try {
    throwIfAborted(signal);

    // ── Stage 1: Text Generation (or skip when text is already provided) ──
    if (skipTextGeneration) {
      const text = (existingText ?? context ?? '').trim();
      if (!text) {
        throw new Error(
          'skipTextGeneration requires "existingText" (or a non-empty "context") to extract from.'
        );
      }
      stage1 = {
        text,
        keyComponents: keyComponentsOverride ?? extractKeyComponents(text),
      };
      console.info(`${LOG_PREFIX} Stage 1 skipped — using provided text.`);
    } else {
      try {
        stage1 = await generateDiagramText(
          { topic, context, previousConcept: previousConcepts },
          { settings: resolvedSettings, signal }
        );
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new Error(`Stage 1 (text generation) failed: ${errorMessage(error)}`);
      }
    }

    // ── Stage 2: JSON Extraction (retries happen inside; text is fixed) ──
    const meta = await extractDiagramWithMeta(
      { text: stage1.text, keyComponents: stage1.keyComponents, diagramType },
      { settings: resolvedSettings, signal, maxRetries, retryBaseDelayMs }
    );
    const retriesUsed = Math.max(0, meta.attempts - 1);

    if (!meta.diagram) {
      const stage2Error = `Stage 2 (JSON extraction) failed after ${meta.attempts} attempt(s): ${meta.lastError}`;
      if (!fallbackToTextOnly) {
        throw new Error(stage2Error);
      }
      const merged = mergeAndValidate(
        { text: stage1.text, diagram: null, keyComponents: stage1.keyComponents },
        { widgetId: resolvedWidgetId }
      );
      console.info(`${LOG_PREFIX} Pipeline complete: text-only fallback (Stage 2 failed).`);
      return {
        ...merged,
        text: stage1.text,
        keyComponents: stage1.keyComponents,
        diagram: null,
        textOnlyFallback: true,
        retriesUsed,
        error: stage2Error,
      };
    }

    // ── Stage 3: Merge and Validate ──
    const merged = mergeAndValidate(
      { text: stage1.text, diagram: meta.diagram, keyComponents: stage1.keyComponents },
      { widgetId: resolvedWidgetId }
    );
    const textOnlyFallback = merged.widgets.length === 0;

    console.info(
      `${LOG_PREFIX} Pipeline complete: ${textOnlyFallback ? 'text-only fallback' : 'diagram + text'} (retries used: ${retriesUsed}).`
    );
    return {
      ...merged,
      text: stage1.text,
      keyComponents: stage1.keyComponents,
      diagram: meta.diagram,
      textOnlyFallback,
      retriesUsed,
      error: textOnlyFallback
        ? 'Stage 3 (merge & validate) failed — could not produce a valid widget config.'
        : undefined,
    };
  } catch (error) {
    // Abort = user cancellation → always propagate, never mask as fallback.
    if (isAbortError(error) || signal?.aborted) throw error;
    if (!fallbackToTextOnly) throw error;

    const message = errorMessage(error);
    console.warn(`${LOG_PREFIX} Pipeline failed gracefully: ${message}`);

    const safeText =
      stage1?.text?.trim() ||
      existingText?.trim() ||
      context?.trim() ||
      (topic.trim()
        ? `# ${topic.trim()}\n\nWe couldn't generate the explanation for this topic right now. Please check your AI connection and try again.`
        : 'Content generation failed. Please check your AI connection and try again.');
    const safeComponents =
      stage1?.keyComponents ?? keyComponentsOverride ?? extractKeyComponents(safeText);

    const merged = mergeAndValidate(
      { text: safeText, diagram: null, keyComponents: safeComponents },
      { widgetId: resolvedWidgetId }
    );
    return {
      ...merged,
      text: safeText,
      keyComponents: safeComponents,
      diagram: null,
      textOnlyFallback: true,
      retriesUsed: 0,
      error: message,
    };
  }
}
