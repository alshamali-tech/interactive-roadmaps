/**
 * S6 — Model Capability Detection
 *
 * Maps a provider + model name to a capability tier and exposes the tier's
 * generation configuration, so the staged pipeline (S1) can pick how many stages
 * to run, which widgets are safe to ask for, and whether to strip AI filler.
 *
 * Rules are data, not code paths: new models are one-line table entries. The
 * ordering matters — see NAMED_MEDIUM — because substring matching on cloud model
 * families otherwise over-rates small variants (`gpt-4o-mini` contains `gpt-4o`).
 */

/** Canonical tier type. `stageContext.ts` re-exports this definition. */
export type ModelTier = 'weak' | 'medium' | 'strong';

/** What the user can store in settings: a fixed tier, or auto-detect. */
export type ModelTierSelection = ModelTier | 'auto';

export interface TierConfig {
  stageCount: {
    short: number;
    medium: number;
    long: number;
  };
  /** Registered widget keys this tier may be asked to produce. */
  allowedWidgets: string[];
  maxRetries: number;
  fillerStripping: boolean;
  fewShotExamples: boolean;
  /** Assumed context window in tokens, for budget guards. */
  contextWindow: number;
}

export interface TierDecision {
  tier: ModelTier;
  reason: string;
  source: 'override' | 'detected';
}

/**
 * Widget keys as the registry and WidgetConfigSchema actually spell them
 * (hyphenated). The S3/S6 spec wrote these with underscores; using that form
 * here would hand S1/S5 names that no schema or registry entry accepts.
 */
const W_SANDBOX = 'sandbox';
const W_MUTATOR = 'mutator';
const W_TRADE_OFF = 'trade-off';
const W_CONTEXT_DIAGRAM = 'context-diagram';
const W_SOCRATIC_CHAT = 'socratic-chat';

const TIER_CONFIGS: Record<ModelTier, TierConfig> = {
  weak: {
    stageCount: { short: 5, medium: 5, long: 6 },
    allowedWidgets: [W_SANDBOX, W_SOCRATIC_CHAT, W_TRADE_OFF],
    maxRetries: 3,
    fillerStripping: true,
    fewShotExamples: false,
    contextWindow: 4096,
  },
  medium: {
    stageCount: { short: 5, medium: 6, long: 7 },
    allowedWidgets: [
      W_SANDBOX,
      W_MUTATOR,
      W_TRADE_OFF,
      W_CONTEXT_DIAGRAM,
      W_SOCRATIC_CHAT,
    ],
    maxRetries: 2,
    fillerStripping: true,
    fewShotExamples: true,
    contextWindow: 8192,
  },
  strong: {
    stageCount: { short: 4, medium: 5, long: 6 },
    allowedWidgets: [
      W_SANDBOX,
      W_MUTATOR,
      W_TRADE_OFF,
      W_CONTEXT_DIAGRAM,
      W_SOCRATIC_CHAT,
    ],
    maxRetries: 2,
    fillerStripping: false,
    fewShotExamples: true,
    contextWindow: 32768,
  },
};

/**
 * Small cloud variants, matched BEFORE the strong family names below so that
 * `gpt-4o-mini` is not read as `gpt-4o`.
 */
const NAMED_MEDIUM: Array<[RegExp, string]> = [
  [/^gpt-4o-mini$|^gpt-4\.1-mini$/, 'gpt-4o-mini / gpt-4.1-mini mid-tier'],
  [/^gpt-4\.1-nano$/, 'nano variant deliberately small'],
  [/claude[^ ]*haiku/, 'Claude Haiku is the fast tier'],
  [/gemini[^ ]*flash/, 'Gemini Flash is the fast tier'],
  [/^grok-3-mini/, 'Grok mini variant'],
];

/** Cloud models treated as capable. */
const NAMED_STRONG: Array<[RegExp, string]> = [
  [/^gpt-4($|\.|-)/, 'GPT-4 family'],
  [/^gpt-4o$/, 'GPT-4o'],
  [/^gpt-4-turbo/, 'GPT-4 Turbo'],
  [/^gpt-4\.1$/, 'GPT-4.1'],
  [/^o[134]( |-|$)/, 'OpenAI reasoning series'],
  [/claude[^ ]*(sonnet|opus)/, 'Claude Sonnet/Opus'],
  [/gemini[^ ]*pro/, 'Gemini Pro'],
  [/deepseek-(v[23]|chat)[^b]*$/, 'DeepSeek instruct family'],
];

/** Cloud models explicitly treated as weak (per the S6 spec). */
const NAMED_WEAK: Array<[RegExp, string]> = [
  [/^gpt-3\.5/, 'gpt-3.5-turbo is weak for structured output'],
  [/^gemini-pro$/, 'legacy gemini-pro'],
  [/^palm/, 'PaLM'],
  [/^groq-/, 'unnamed groq alias'],
];

/**
 * Parameter count found in a model tag, e.g. `llama3.1:70b` -> 70.
 * Local models below 30B are weak, 30B-99B medium, 100B+ strong. The spec listed
 * "70B+" as both medium and strong; 100B+ is where the named examples
 * (llama3.1:405b) actually sit, so the boundary is placed there and documented.
 */
const LOCAL_STRONG_MIN_B = 100;
const LOCAL_MEDIUM_MIN_B = 30;

function parseParamCount(normalized: string): number | null {
  const match = normalized.match(/(?:^|[:_-])(\d{1,3}(?:\.\d)?)b(?:$|[^a-z0-9])/) ??
    normalized.match(/(\d{1,3}(?:\.\d)?)b$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function firstMatch(table: Array<[RegExp, string]>, name: string) {
  for (const [pattern, reason] of table) {
    if (pattern.test(name)) return reason;
  }
  return null;
}

/**
 * Detects the capability tier for a provider + model name.
 * Unknown models and empty names default to `weak`, which is the safe
 * assumption: it yields fewer widget types, more retries and filler stripping.
 */
export function detectModelTierDetailed(provider: string, modelName: string): TierDecision {
  const name = (modelName ?? '').toLowerCase().trim();
  const providerName = (provider ?? '').toLowerCase().trim();

  if (!name) {
    return { tier: 'weak', reason: 'no model name configured', source: 'detected' };
  }

  const weakReason = firstMatch(NAMED_WEAK, name);
  if (weakReason) {
    return { tier: 'weak', reason: weakReason, source: 'detected' };
  }

  // Small variants before their stronger parent families.
  const mediumNamed = firstMatch(NAMED_MEDIUM, name);
  if (mediumNamed) {
    return { tier: 'medium', reason: mediumNamed, source: 'detected' };
  }

  // A parameter tag is more specific than a family name: `llama3.1:8b` must not
  // inherit "llama" strength, and `qwen2.5:72b` outranks a generic local guess.
  const params = parseParamCount(name);
  if (params !== null) {
    if (params >= LOCAL_STRONG_MIN_B) {
      return { tier: 'strong', reason: `${params}B local model`, source: 'detected' };
    }
    if (params >= LOCAL_MEDIUM_MIN_B) {
      return { tier: 'medium', reason: `${params}B local model`, source: 'detected' };
    }
    return { tier: 'weak', reason: `${params}B local model`, source: 'detected' };
  }

  const strongReason = firstMatch(NAMED_STRONG, name);
  if (strongReason) {
    return { tier: 'strong', reason: strongReason, source: 'detected' };
  }

  if (providerName === 'ollama') {
    // Local model with no size tag in the name — cannot assume capability.
    return { tier: 'weak', reason: 'ollama model without a parameter tag', source: 'detected' };
  }

  return { tier: 'weak', reason: `unrecognized model "${name}" defaults to weak`, source: 'detected' };
}

export function detectModelTier(provider: string, modelName: string): ModelTier {
  return detectModelTierDetailed(provider, modelName).tier;
}

/**
 * Resolves the tier to actually use: a manual override wins, otherwise detect.
 *
 * Takes a structural slice rather than importing `AISettings` so this module does
 * not participate in an import cycle with settings.ts; any AISettings value is
 * assignable to it.
 */
export interface TierSettingsSlice {
  provider: string;
  model: string;
  modelTierOverride?: ModelTierSelection;
}

export function resolveModelTier(settings: TierSettingsSlice): TierDecision {
  const override = settings.modelTierOverride ?? 'auto';
  if (override !== 'auto') {
    return {
      tier: override,
      reason: `manual override (auto would say ${detectModelTierDetailed(
        settings.provider,
        settings.model
      ).tier})`,
      source: 'override',
    };
  }
  return detectModelTierDetailed(settings.provider, settings.model);
}

/** Returns a defensive copy so callers cannot mutate the shared table. */
export function getModelTierConfig(tier: ModelTier): TierConfig {
  const config = TIER_CONFIGS[tier];
  return {
    ...config,
    stageCount: { ...config.stageCount },
    allowedWidgets: [...config.allowedWidgets],
  };
}

/** Lesson-length buckets keyed on minutes, since no lessonLength field exists. */
export type LessonLength = keyof TierConfig['stageCount'];

export function lessonLengthFromMinutes(estimatedMinutes: number): LessonLength {
  if (estimatedMinutes <= 8) return 'short';
  if (estimatedMinutes <= 20) return 'medium';
  return 'long';
}

export function stageCountFor(tier: ModelTier, estimatedMinutes: number): number {
  return getModelTierConfig(tier).stageCount[lessonLengthFromMinutes(estimatedMinutes)];
}

export function isWidgetAllowed(tier: ModelTier, widgetType: string): boolean {
  return getModelTierConfig(tier).allowedWidgets.includes(widgetType);
}

/** Filler lines/prefixes that weak models emit ahead of real content. */
const FILLER_LINE_PATTERNS: RegExp[] = [
  /^\s*(sure|certainly|of course|absolutely|great question|good question)[!,. ]*\s*$/i,
  /^\s*(let me help you with that|i'?d be happy to|i will help you with|here'?s (?:your|the) answer)\b[^\n]*$/i,
  /^\s*as an ai (?:language model|assistant)\b[^\n]*$/i,
  /^\s*(?:here|below)(?:\s+(?:is|are)|['’]s)\b[^:]{0,60}:\s*$/i,
];

const FILLER_PREFIX = /^\s*(?:sure|certainly|of course|absolutely|great question)[!,. ]+\s*/i;

/**
 * Removes conversational preamble while preserving content.
 *
 * Only leading filler is stripped and only while the document still starts with
 * filler, so a legitimate sentence such as "Sure is the opposite of no." deep in
 * the text survives untouched.
 */
export function stripFiller(text: string): string {
  if (!text) return '';
  let lines = text.split('\n');

  const trimLeading = () => {
    while (lines.length > 0) {
      const first = lines[0];
      if (first.trim() === '') {
        lines = lines.slice(1);
        continue;
      }
      if (FILLER_LINE_PATTERNS.some((pattern) => pattern.test(first))) {
        lines = lines.slice(1);
        continue;
      }
      const withoutPrefix = first.replace(FILLER_PREFIX, '');
      if (withoutPrefix !== first) {
        lines = [withoutPrefix, ...lines.slice(1)];
      }
      break;
    }
  };

  trimLeading();
  // A heading or code fence may only appear after the preamble lines.
  while (lines.length > 0 && lines[0].trim() === '') lines = lines.slice(1);

  return lines.join('\n').replace(/^\s*\n+/, '');
}

/**
 * Logs the tier decision and the configuration in use.
 * Kept as a function so callers (and tests) can opt in or stub it.
 */
export function logTierDecision(decision: TierDecision, config: TierConfig): void {
  console.info(
    `[modelCapability] tier=${decision.tier} (${decision.source}) ${decision.reason} | ` +
      `stages=${JSON.stringify(config.stageCount)} widgets=${config.allowedWidgets.join(',')} ` +
      `retries=${config.maxRetries} filler=${config.fillerStripping} fewShot=${config.fewShotExamples}`
  );
}
