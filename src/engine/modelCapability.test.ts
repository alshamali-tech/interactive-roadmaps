/**
 * S6 — Model Capability Detection tests.
 *
 * The detection table is the risky part: a substring match that rates
 * `gpt-4o-mini` as `gpt-4o` would silently give a weak local model the strong
 * pipeline (few-shot prompts, complex widgets, fewer retries).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectModelTier,
  detectModelTierDetailed,
  resolveModelTier,
  getModelTierConfig,
  stageCountFor,
  lessonLengthFromMinutes,
  isWidgetAllowed,
  stripFiller,
  logTierDecision,
} from './modelCapability';
import { widgetRegistry } from './registry';

const cases: Array<[string, string, 'weak' | 'medium' | 'strong', string]> = [
  // Local Ollama models keyed on the parameter tag.
  ['ollama', 'llama3.2:3b', 'weak', 'tiny local model'],
  ['ollama', 'qwen2.5:7b', 'weak', '7B local'],
  ['ollama', 'mistral:7b', 'weak', '7B local'],
  ['ollama', 'gemma2:9b', 'weak', '9B local'],
  ['ollama', 'llama3:latest', 'weak', 'no parameter tag stays conservative'],
  ['ollama', 'qwen2.5:32b', 'medium', '30B band'],
  ['ollama', 'llama3.1:70b', 'medium', 'sub-100B band'],
  ['ollama', 'llama3.1:405b', 'strong', '100B+ band'],
  // Cloud: the mini/flash/haiku variants must win over their parent families.
  ['openai', 'gpt-4o-mini', 'medium', 'trap case'],
  ['openai', 'gpt-4o', 'strong', 'full GPT-4o'],
  ['openai', 'gpt-4-turbo', 'strong', 'GPT-4 turbo'],
  ['openai', 'gpt-4', 'strong', 'GPT-4'],
  ['openai', 'gpt-3.5-turbo', 'weak', 'explicitly weak per spec'],
  ['anthropic', 'claude-3-haiku', 'medium', 'Haiku fast tier'],
  ['anthropic', 'claude-3-sonnet', 'strong', 'Sonnet'],
  ['anthropic', 'claude-3-5-sonnet', 'strong', 'Sonnet'],
  ['google', 'gemini-1.5-flash', 'medium', 'Flash fast tier'],
  ['google', 'gemini-1.5-pro', 'strong', 'Pro'],
  ['google', 'gemini-pro', 'weak', 'legacy gemini-pro'],
  ['groq', 'llama-3.1-70b-versatile', 'medium', 'groq 70B'],
  ['groq', 'llama-3.1-8b-instant', 'weak', 'groq 8B'],
  // Unknown and empty default to the safest tier.
  ['openai', 'some-new-model-9000', 'weak', 'unrecognized'],
  ['ollama', '', 'weak', 'no model configured'],
];

describe('detectModelTier', () => {
  it.each(cases)('%s %s -> %s (%s)', (provider, model, expected) => {
    expect(detectModelTier(provider, model)).toBe(expected);
  });

  it('explains every decision so the log is actionable', () => {
    const decision = detectModelTierDetailed('openai', 'gpt-4o-mini');
    expect(decision.tier).toBe('medium');
    expect(decision.reason).toMatch(/mid-tier/);
    expect(decision.source).toBe('detected');

    const local = detectModelTierDetailed('ollama', 'qwen2.5:32b');
    expect(local.reason).toMatch(/32B local model/);
  });
});

describe('manual override (S6 criterion 7)', () => {
  it('takes precedence over detection and records what auto would have said', () => {
    const decision = resolveModelTier({
      provider: 'ollama',
      model: 'llama3.1:405b',
      modelTierOverride: 'weak',
    });
    expect(decision.tier).toBe('weak');
    expect(decision.source).toBe('override');
    expect(decision.reason).toContain('strong');
  });

  it('falls back to detection for "auto" and for a missing field', () => {
    expect(
      resolveModelTier({ provider: 'openai', model: 'gpt-4o', modelTierOverride: 'auto' }).tier
    ).toBe('strong');
    expect(resolveModelTier({ provider: 'openai', model: 'gpt-4o' }).tier).toBe('strong');
  });

  it('accepts a persisted settings slice unchanged', () => {
    // AISettings carries modelTierOverride optionally; structural typing must hold.
    expect(
      resolveModelTier({
        provider: 'ollama',
        model: 'llama3.2:3b',
        modelTierOverride: undefined,
      }).tier
    ).toBe('weak');
  });
});

describe('tier configuration', () => {
  it('matches the spec values for every tier', () => {
    expect(getModelTierConfig('weak')).toMatchObject({
      stageCount: { short: 5, medium: 5, long: 6 },
      maxRetries: 3,
      fillerStripping: true,
      fewShotExamples: false,
      contextWindow: 4096,
    });
    expect(getModelTierConfig('medium')).toMatchObject({
      stageCount: { short: 5, medium: 6, long: 7 },
      maxRetries: 2,
      fillerStripping: true,
      fewShotExamples: true,
      contextWindow: 8192,
    });
    expect(getModelTierConfig('strong')).toMatchObject({
      stageCount: { short: 4, medium: 5, long: 6 },
      maxRetries: 2,
      fillerStripping: false,
      fewShotExamples: true,
      contextWindow: 32768,
    });
  });

  it('names only widgets the registry actually knows', () => {
    // Guards the hyphen/underscore drift this repo has hit repeatedly: a tier
    // config saying "context_diagram" would pass validation and render nothing.
    for (const tier of ['weak', 'medium', 'strong'] as const) {
      for (const widget of getModelTierConfig(tier).allowedWidgets) {
        expect(widget, `${tier} -> ${widget}`).toMatch(/^[a-z-]+$/);
        expect(widgetRegistry.has(widget), `${tier} -> ${widget}`).toBe(true);
      }
    }
  });

  it('restricts weak to widgets a small model can actually emit', () => {
    const weak = getModelTierConfig('weak').allowedWidgets;
    expect(weak).toEqual(['sandbox', 'socratic-chat', 'trade-off']);
    expect(isWidgetAllowed('weak', 'mutator')).toBe(false);
    expect(isWidgetAllowed('weak', 'context-diagram')).toBe(false);
    expect(isWidgetAllowed('strong', 'context-diagram')).toBe(true);
  });

  it('returns a defensive copy so callers cannot corrupt the table', () => {
    const config = getModelTierConfig('weak');
    config.allowedWidgets.push('mutator');
    config.stageCount.long = 99;

    expect(getModelTierConfig('weak').allowedWidgets).not.toContain('mutator');
    expect(getModelTierConfig('weak').stageCount.long).toBe(6);
  });
});

describe('lesson length mapping', () => {
  it('derives short/medium/long from minutes because no lessonLength field exists', () => {
    expect(lessonLengthFromMinutes(5)).toBe('short');
    expect(lessonLengthFromMinutes(8)).toBe('short');
    expect(lessonLengthFromMinutes(9)).toBe('medium');
    expect(lessonLengthFromMinutes(20)).toBe('medium');
    expect(lessonLengthFromMinutes(21)).toBe('long');
  });

  it('stage count adapts to tier and length together', () => {
    expect(stageCountFor('strong', 5)).toBe(4);
    expect(stageCountFor('weak', 5)).toBe(5);
    expect(stageCountFor('medium', 15)).toBe(6);
    expect(stageCountFor('weak', 45)).toBe(6);
  });
});

describe('stripFiller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes standalone preamble lines and blank leading lines', () => {
    expect(stripFiller('Sure!\n\n# Tokens\nA token is a chunk.')).toBe('# Tokens\nA token is a chunk.');
    expect(stripFiller('Certainly!\nOf course!\n\nBody text.')).toBe('Body text.');
  });

  it('removes a filler prefix on the first line but keeps the sentence', () => {
    expect(stripFiller("Here's your lesson:\n\n# Title")).toBe('# Title');
    expect(stripFiller('Sure! Python is interpreted.')).toBe('Python is interpreted.');
  });

  it('never touches legitimate content deeper in the text', () => {
    const text = '# Title\n\nThe word sure is not filler here.\nCertainly! is also fine mid-document.';
    expect(stripFiller(text)).toBe(text);
  });

  it('handles empty input', () => {
    expect(stripFiller('')).toBe('');
  });
});

describe('logging', () => {
  it('logs the tier, source and active configuration', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const decision = resolveModelTier({ provider: 'ollama', model: 'llama3.2:3b' });
    logTierDecision(decision, getModelTierConfig(decision.tier));

    expect(info).toHaveBeenCalledTimes(1);
    const line = info.mock.calls[0][0] as string;
    expect(line).toContain('tier=weak');
    expect(line).toContain('detected');
    expect(line).toContain('retries=3');
  });
});
