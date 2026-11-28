/**
 * S4 — Stage Output Validators
 *
 * Cheap, fast checks on each stage's output before it is fed to the next stage.
 * Deliberately lenient on structure and strict only where a bad output would
 * poison later stages or the learner's experience (anti-repetition, the widget
 * schema, the word budget).
 *
 * Anything repairable is returned in `fixed` so the pipeline can continue;
 * `errors` are what actually blocked acceptance, `warnings` are advisory.
 *
 * Reuse over re-specification: `extractJson`, `WidgetConfigSchema`,
 * `DiagramSchema` and `fixCommonDiagramErrors` come from generatorSchema,
 * `countWords` from stageContext, `stripFiller` from modelCapability, and
 * repetition detection is injected from S3's `checkRepetition` so there is only
 * ever one definition of "already explained".
 */
import {
  WidgetConfigSchema,
  DiagramSchema,
  extractJson,
  fixCommonDiagramErrors,
  type WidgetConfig,
  type Diagram,
} from './generatorSchema';
import { countWords, type RepetitionIssue } from './stageContext';
import { getModelTierConfig, stripFiller, type ModelTier } from './modelCapability';
import type { StagePromptContext, StageType } from './stageContext';

export interface StageValidationResult<T = string> {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Corrected output, present when the issue was auto-repairable. */
  fixed?: T;
}

export interface WidgetStageResult {
  widgets: WidgetConfig[];
  dropped: Array<{ type: string; reason: string }>;
}

export interface ValidateProseOptions {
  stage: StageType;
  targetWords: number;
  tier: ModelTier;
  context?: StagePromptContext;
  /**
   * Repetition detector, normally `(text) => manager.checkRepetition(text, exclude)`
   * from S3. Injected so the rule lives in exactly one place.
   */
  repetition?: (text: string) => RepetitionIssue[];
}

export interface ValidateWidgetsOptions {
  tier: ModelTier;
  /** Widget kinds this lesson may use; defaults to the tier's list. */
  allowed?: string[];
}

const MIN_WORDS_RATIO: Record<ModelTier, number> = { weak: 0.35, medium: 0.5, strong: 0.7 };
const MAX_WORDS_RATIO = 2.2;
const MIN_QUESTIONS: Record<ModelTier, number> = { weak: 1, medium: 2, strong: 2 };
const MAX_WIDGETS: Record<ModelTier, number> = { weak: 1, medium: 3, strong: 3 };

/** Section output must not start with an H1 — the lesson title already owns one. */
const LEADING_H1 = /^\s*#\s+\S/;

/** Stages are generated once and independently, so promises about later text break. */
const PLANNED_AHEAD_PHRASES: RegExp[] = [
  /\bin the next section,?\s+(?:we|you)(?:\s+will)?\b/i,
  /\bcoming up\b/i,
  /\bwe(?:'ll| will) cover(?: this)? later\b/i,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function minWordsFor(tier: ModelTier, targetWords: number): number {
  return Math.max(20, Math.round(targetWords * MIN_WORDS_RATIO[tier]));
}

/**
 * Validates prose stages (introduction, motivation, explanation, example, quiz,
 * summary, review). `fixed` is the filler-stripped text whenever stripping changed
 * the output, so the caller can accept the repaired version.
 */
export function validateProseStage(
  text: string,
  options: ValidateProseOptions
): StageValidationResult<string> {
  const { stage, targetWords, tier, context, repetition } = options;
  const errors: string[] = [];
  const warnings: string[] = [];

  const raw = typeof text === 'string' ? text : '';
  const stripped = stripFiller(raw);
  const repaired = stripped.trim() !== raw.trim();

  if (stripped.trim().length === 0) {
    return { valid: false, errors: ['Stage output is empty after removing preamble.'], warnings };
  }

  const words = countWords(stripped);
  const floor = minWordsFor(tier, targetWords);
  if (words < floor) {
    errors.push(`Too short: ${words} words, expected at least ${floor}.`);
  } else if (words > targetWords * MAX_WORDS_RATIO) {
    // Over-length is advisory: readable but it eats the remaining budget.
    warnings.push(`Over length: ${words} words against a ${targetWords}-word target.`);
  }

  if (LEADING_H1.test(stripped)) {
    warnings.push('Section starts with an H1; the lesson title already provides one.');
  }

  if (stage === 'quiz') {
    const questions = (stripped.match(/\*\*Q\d+\./g) ?? []).length;
    const answers = (stripped.match(/^\s*Answer:/gim) ?? []).length;
    const minimum = MIN_QUESTIONS[tier];
    if (questions === 0) {
      errors.push('Quiz has no questions in the required "**Q1. ..." format.');
    } else if (questions < minimum) {
      errors.push(`Quiz needs at least ${minimum} questions, found ${questions}.`);
    }
    if (questions > 0 && answers < questions) {
      errors.push(`Quiz has ${questions} questions but only ${answers} "Answer:" lines.`);
    }
  }

  if (stage === 'explanation' && context && context.conceptsRemaining.length > 0) {
    const uncovered = context.conceptsRemaining.filter(
      (concept) => !new RegExp(`\\b${escapeRegExp(concept)}\\b`, 'i').test(stripped)
    );
    if (uncovered.length > 0) {
      const message = `Concepts promised but not covered: ${uncovered.join(', ')}.`;
      // Weak models get partial credit — some coverage still teaches.
      if (tier === 'weak') warnings.push(message);
      else errors.push(message);
    }
  }

  if (context && context.conceptsAlreadyKnown.length > 0) {
    const detector = repetition ?? defaultRepetition(context.conceptsAlreadyKnown);
    for (const issue of detector(stripped)) {
      const message = `Re-explains "${issue.concept}" (already taught): ${issue.phrase}`;
      if (issue.severity === 'error' && tier !== 'weak') errors.push(message);
      else warnings.push(message);
    }
  }

  if (PLANNED_AHEAD_PHRASES.some((pattern) => pattern.test(stripped))) {
    warnings.push('Refers to content in a later section; stages are generated independently.');
  }

  const valid = errors.length === 0;
  return { valid, errors, warnings, fixed: repaired ? stripped : undefined };
}

/**
 * Validates the widget stage. Unusable widgets are dropped and reported rather
 * than failing the lesson, matching how lessonParser treats authored content.
 */
export function validateWidgetStage(
  text: string,
  options: ValidateWidgetsOptions
): StageValidationResult<WidgetStageResult> {
  const { tier } = options;
  const permitted =
    options.allowed && options.allowed.length > 0 ? options.allowed : getModelTierConfig(tier).allowedWidgets;
  const errors: string[] = [];
  const warnings: string[] = [];
  const widgets: WidgetConfig[] = [];
  const dropped: WidgetStageResult['dropped'] = [];

  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, errors: ['Widget stage output is not a JSON object.'], warnings };
  }

  const rawWidgets = (parsed as { widgets?: unknown }).widgets;
  if (!Array.isArray(rawWidgets)) {
    return { valid: false, errors: ['Widget stage output has no "widgets" array.'], warnings };
  }

  if (rawWidgets.length === 0) {
    // Producing no widgets is a legitimate outcome; prose alone still teaches.
    warnings.push('No widgets produced.');
    return { valid: true, errors, warnings, fixed: { widgets: [], dropped } };
  }

  rawWidgets.forEach((entry, index) => {
    const type =
      entry && typeof entry === 'object' ? String((entry as { type?: unknown }).type ?? '') : '';

    if (!permitted.includes(type)) {
      dropped.push({ type: type || '(missing)', reason: `not available for the ${tier} tier` });
      warnings.push(
        `Dropped widget ${index}: type "${type || '(missing)'}" is not in ${permitted.join(', ')}.`
      );
      return;
    }

    const candidate = { id: `generated-widget-${index}`, ...(entry as object) };
    const result = WidgetConfigSchema.safeParse(candidate);
    if (result.success) {
      widgets.push(result.data as WidgetConfig);
      return;
    }

    if (type === 'context-diagram') {
      const rescued = rescueDiagram(candidate);
      if (rescued) {
        widgets.push(rescued);
        warnings.push(`Repaired diagram widget ${index} (duplicate IDs, dangling or orphaned edges).`);
        return;
      }
    }

    dropped.push({ type, reason: 'failed schema validation' });
    errors.push(
      `Widget ${index} ("${type}") is invalid: ${result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`
    );
  });

  const cap = MAX_WIDGETS[tier];
  const kept = widgets.slice(0, cap);
  if (widgets.length > kept.length) {
    warnings.push(`Kept ${kept.length} widgets; the ${tier} tier supports at most ${cap}.`);
  }

  return { valid: errors.length === 0, errors, warnings, fixed: { widgets: kept, dropped } };
}

/** Whole-lesson coherence pass, used after assembly (S5). */
export function validateLessonCoherence(
  markdown: string,
  context: StagePromptContext,
  repetition?: (text: string) => RepetitionIssue[]
): StageValidationResult<string> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const words = countWords(markdown);
  if (words === 0) errors.push('Assembled lesson is empty.');
  if (context.targetWordCount > 0 && words < context.targetWordCount * MIN_WORDS_RATIO.weak) {
    warnings.push(`Lesson is ${words} words against a ${context.targetWordCount}-word plan.`);
  }

  if (context.conceptsAlreadyKnown.length > 0) {
    const detector = repetition ?? defaultRepetition(context.conceptsAlreadyKnown);
    for (const issue of detector(markdown)) {
      const message = `Re-explains "${issue.concept}" (already taught): ${issue.phrase}`;
      if (issue.severity === 'error') errors.push(message);
      else warnings.push(message);
    }
  }

  for (const phrase of context.antiRepetitionList) {
    if (phrase && new RegExp(escapeRegExp(phrase), 'i').test(markdown)) {
      warnings.push(`Banned phrase present: "${phrase}".`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Fallback used only when S1 has no StageContextManager instance to borrow from
 * (direct calls and unit tests). The pipeline always injects the real detector.
 */
function defaultRepetition(
  knownConcepts: string[]
): (text: string) => RepetitionIssue[] {
  return (text) => {
    const issues: RepetitionIssue[] = [];
    for (const concept of knownConcepts) {
      const match = text.match(
        new RegExp(
          `\\b${escapeRegExp(concept)}\\b[^.\\n]{0,60}?\\b(is|refers|means|describes|can be)\\b[^.\\n]{0,60}`,
          'i'
        )
      );
      if (!match) continue;
      issues.push({
        concept,
        phrase: match[0].trim(),
        severity: /\b(is a way to|refers to|is defined as|means that|can be described as)\b/i.test(
          match[0]
        )
          ? 'error'
          : 'warning',
      });
    }
    return issues;
  };
}

/** Applies the automatic diagram repairs before giving up on a widget. */
function rescueDiagram(candidate: Record<string, unknown>): WidgetConfig | null {
  const props = candidate.props as { diagram?: unknown } | undefined;
  const diagram = props?.diagram;
  if (!diagram || typeof diagram !== 'object') return null;
  if (DiagramSchema.safeParse(diagram).success) return null;

  try {
    const repaired = fixCommonDiagramErrors(diagram as Partial<Diagram>);
    const result = WidgetConfigSchema.safeParse({
      ...candidate,
      props: { ...props, diagram: repaired },
    });
    return result.success ? (result.data as WidgetConfig) : null;
  } catch {
    return null;
  }
}
