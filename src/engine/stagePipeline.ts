/**
 * S1 — Staged Generation Pipeline
 *
 * Breaks lesson generation into small focused steps so weak local models can
 * produce quality content. Each stage does one job, receives the accumulated
 * context from S3, is validated cheaply by S4, and is retried at most twice with
 * a stricter prompt. Stage choice comes from S6's tier configuration.
 *
 * Flow: determineStages() -> per stage { buildStagePrompt -> generateRawCompletion
 * -> validate -> retry once with buildStageRetryPrompt -> record } -> S5 assembly.
 *
 * NOTE ON A SPEC CONFLICT: S1's instruction text says weak models use 5 stages for
 * short lessons and 6 for medium, while S6's own table says 5/5/6. The tier table
 * in modelCapability.ts is treated as the single source of truth here, so stage
 * counts are read from it rather than duplicated.
 */
import { generateRawCompletion } from './aiService';
import type { AISettings } from './settings';
import type { CoursePlan, GeneratedLesson, LessonPlan, WidgetConfig } from './generatorSchema';
import { GeneratedLessonSchema } from './generatorSchema';
import {
  DEFAULT_STAGES,
  StageContextManager,
  type StageContextManager as StageContextManagerType,
  type StageType,
} from './stageContext';
import {
  getModelTierConfig,
  lessonLengthFromMinutes,
  resolveModelTier,
  stageCountFor,
  type LessonLength,
  type ModelTier,
} from './modelCapability';
import {
  buildStagePrompt,
  buildStageRetryPrompt,
  stageWordTarget,
  STAGE_LABELS,
} from './stagePrompts';
import { validateProseStage, validateWidgetStage } from './stageValidators';
import { assembleStagedLesson, type StageOutput } from './stageAssembler';
import { clearLessonHistory, getCompletedStages, saveStageOutput } from './generationHistory';

/** Order stages run in before merging/removal is applied. */
const STAGE_ORDER: StageType[] = [
  'introduction',
  'motivation',
  'explanation',
  'example',
  'widget_generation',
  'quiz',
  'summary',
  'review',
];

export interface StagePlanStep {
  type: StageType;
  description: string;
}

export interface StagePipelineProgress {
  lessonId: string;
  lessonTitle: string;
  stage: StageType;
  stageIndex: number;
  totalStages: number;
  status: 'started' | 'completed' | 'retried' | 'failed' | 'skipped';
  message: string;
  percent: number;
  retries: number;
}

export type StageProgressCallback = (progress: StagePipelineProgress) => void;

export interface RunStagePipelineParams {
  lessonPlan: LessonPlan;
  plan: CoursePlan;
  lessonIndex: number;
  previousLessons: GeneratedLesson[];
  sourceContent: string;
  settings: AISettings;
  signal?: AbortSignal;
  onProgress?: StageProgressCallback;
  /** Overrides the tier's retry count. */
  maxRetries?: number;
  /** Reuse saved stage context + completed stages after a reload (S8). */
  resume?: boolean;
  estimatedMinutes?: number;
  /** Resume journal is IndexedDB-backed; disabled in tests without one. */
  journal?: boolean;
}

export interface StagedLessonResult {
  lesson: GeneratedLesson;
  tier: ModelTier;
  tierReason: string;
  stages: StageType[];
  retriesUsed: number;
  warnings: string[];
  resumedStages: StageType[];
}

const TEMPERATURE: Record<StageType, number> = {
  introduction: 0.5,
  motivation: 0.5,
  explanation: 0.3,
  example: 0.4,
  widget_generation: 0.1,
  quiz: 0.4,
  summary: 0.3,
  review: 0.5,
};

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Generation aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Generation aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Chooses the stage list for one lesson: tier budget, lesson length, and what the
 * plan actually asks for. Excess stages are merged into their neighbour rather
 * than dropped, so no planned content disappears.
 */
export function determineStages(
  lessonLength: LessonLength,
  tier: ModelTier,
  contentTypes: string[] = ['text'],
  widgetSuggestions: string[] = []
): StageType[] {
  const wantsWidgets =
    widgetSuggestions.length > 0 ||
    contentTypes.includes('interactive') ||
    contentTypes.includes('visual');
  const wantsCode = contentTypes.includes('code') || wantsWidgets;

  let stages = STAGE_ORDER.filter((stage) => {
    if (stage === 'widget_generation') {
      return wantsWidgets && getModelTierConfig(tier).allowedWidgets.length > 0;
    }
    if (stage === 'example') return wantsCode || lessonLength !== 'short';
    if (stage === 'review') return lessonLength === 'long';
    return true;
  });

  const target = stageCountFor(tier, lengthToMinutes(lessonLength));

  // Merge order: cheapest-quality loss first. Each entry replaces `remove`
  // content-wise with `keep`, which is why the survivor stays in place.
  const merges: Array<{ remove: StageType; keep: StageType }> = [
    { remove: 'review', keep: 'summary' },
    { remove: 'motivation', keep: 'introduction' },
    { remove: 'example', keep: 'explanation' },
    { remove: 'widget_generation', keep: 'example' },
    { remove: 'quiz', keep: 'summary' },
  ];

  for (const merge of merges) {
    if (stages.length <= target) break;
    if (!stages.includes(merge.remove)) continue;
    // Only merge into a stage that is actually running.
    if (!stages.includes(merge.keep)) continue;
    stages = stages.filter((stage) => stage !== merge.remove);
  }

  // Still over budget: drop from the tail, keeping the teaching core.
  while (stages.length > target && stages.length > 3) {
    stages = stages.filter((stage) => stage !== stages[stages.length - 2]);
  }

  return stages;
}

function lengthToMinutes(length: LessonLength): number {
  return length === 'short' ? 6 : length === 'medium' ? 12 : 30;
}

/** Content types implied by the plan, for determineStages. */
export function contentTypesForPlan(lessonPlan: LessonPlan): string[] {
  const types = ['text'];
  if (lessonPlan.widgetSuggestions.length > 0) types.push('interactive');
  if (lessonPlan.keyPoints.some((point) => /code|function|query|implement/i.test(point))) {
    types.push('code');
  }
  if (lessonPlan.keyPoints.some((point) => /architect|flow|pipeline|diagram|system/i.test(point))) {
    types.push('visual');
  }
  return types;
}

function toLessonLength(estimatedMinutes: number): LessonLength {
  return lessonLengthFromMinutes(estimatedMinutes);
}

/** Runs the whole staged pipeline for ONE lesson. */
export async function generateLessonStaged(
  params: RunStagePipelineParams
): Promise<StagedLessonResult> {
  const {
    lessonPlan,
    plan,
    lessonIndex,
    previousLessons,
    sourceContent,
    settings,
    signal,
    onProgress,
    journal = true,
  } = params;

  const estimatedMinutes = params.estimatedMinutes ?? 10;
  const decision = resolveModelTier(settings);
  const config = getModelTierConfig(decision.tier);
  const maxRetries = params.maxRetries ?? config.maxRetries - 1; // attempts beyond the first

  const { context, restored } = buildContext(
    lessonPlan,
    plan,
    lessonIndex,
    previousLessons,
    decision.tier,
    estimatedMinutes,
    params.resume,
    journal
  );

  // A fresh manager already carries DEFAULT_STAGES, so the default plan must
  // never be mistaken for restored progress — only a loaded context may override
  // the tier/length-driven stage choice.
  const live = context.getContext();
  const stages =
    restored && (live.stagesCompleted.length > 0 || live.stagesRemaining.length > 0)
      ? [...live.stagesCompleted, ...live.stagesRemaining]
      : determineStages(
          toLessonLength(estimatedMinutes),
          decision.tier,
          contentTypesForPlan(lessonPlan),
          lessonPlan.widgetSuggestions.map((widget) => widget.type)
        );
  context.setStages(stages);

  const outputs: StageOutput[] = [];
  const warnings: string[] = [...(context.getContext().keyDecisionsMade ?? [])];
  let retriesUsed = 0;

  const resumed = journal ? await getCompletedStages(lessonPlan.id) : [];
  const resumedStages = resumed
    .map((entry) => entry.stage)
    .filter((stage): stage is StageType => stages.includes(stage));

  for (const entry of resumed) {
    if (!stages.includes(entry.stage)) continue;
    outputs.push({ stage: entry.stage, text: entry.output });
  }

  let index = 0;
  for (const stage of stages) {
    index += 1;
    if (resumedStages.includes(stage)) {
      onProgress?.({
        lessonId: lessonPlan.id,
        lessonTitle: lessonPlan.title,
        stage,
        stageIndex: index,
        totalStages: stages.length,
        status: 'skipped',
        message: `${STAGE_LABELS[stage]} restored from previous session`,
        percent: Math.round((index / stages.length) * 100),
        retries: 0,
      });
      continue;
    }

    throwIfAborted(signal);
    onProgress?.({
      lessonId: lessonPlan.id,
      lessonTitle: lessonPlan.title,
      stage,
      stageIndex: index,
      totalStages: stages.length,
      status: 'started',
      message: `Writing ${STAGE_LABELS[stage].toLowerCase()}...`,
      percent: Math.round(((index - 1) / stages.length) * 100),
      retries: 0,
    });

    const outcome = await runStage({
      stage,
      context,
      config,
      tier: decision.tier,
      lessonPlan,
      sourceContent,
      settings,
      signal,
      maxRetries,
      onProgress,
      stageIndex: index,
      totalStages: stages.length,
    });

    retriesUsed += outcome.retries;
    outputs.push({ stage, text: outcome.text, widgets: outcome.widgets });
    warnings.push(...outcome.warnings);

    context.updateAfterStage(stage, outcome.text);
    if (journal) {
      await saveStageOutput({
        lessonId: lessonPlan.id,
        stage,
        output: outcome.text,
        savedAt: Date.now(),
        valid: outcome.valid,
      });
    }

    onProgress?.({
      lessonId: lessonPlan.id,
      lessonTitle: lessonPlan.title,
      stage,
      stageIndex: index,
      totalStages: stages.length,
      status: outcome.valid ? 'completed' : 'failed',
      message: outcome.valid
        ? `${STAGE_LABELS[stage]} done`
        : `${STAGE_LABELS[stage]} kept in reduced form`,
      percent: Math.round((index / stages.length) * 100),
      retries: outcome.retries,
    });
  }

  const lesson = assembleStagedLesson({
    lessonPlan,
    planTitle: plan.title,
    outputs,
    context: context.getContext(),
    estimatedMinutes,
  });

  const validated = GeneratedLessonSchema.safeParse(lesson);
  if (!validated.success) {
    throw new Error(
      `Staged assembly produced an invalid lesson: ${validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`
    );
  }

  if (journal) await clearLessonHistory(lessonPlan.id);
  StageContextManager.clear(lessonPlan.id);

  return {
    lesson: validated.data,
    tier: decision.tier,
    tierReason: decision.reason,
    stages,
    retriesUsed,
    warnings,
    resumedStages,
  };
}

interface StageRunArgs {
  stage: StageType;
  context: StageContextManagerType;
  config: ReturnType<typeof getModelTierConfig>;
  tier: ModelTier;
  lessonPlan: LessonPlan;
  sourceContent: string;
  settings: AISettings;
  signal?: AbortSignal;
  maxRetries: number;
  onProgress?: StageProgressCallback;
  stageIndex: number;
  totalStages: number;
}

interface StageOutcome {
  text: string;
  widgets?: WidgetConfig[];
  valid: boolean;
  retries: number;
  warnings: string[];
}

async function runStage(args: StageRunArgs): Promise<StageOutcome> {
  const { stage, context, config, tier, settings, signal, maxRetries, onProgress } = args;
  const promptContext = context.getStagePromptContext();
  const baseParams = {
    stage,
    context: promptContext,
    config,
    topic: args.lessonPlan.title,
    sourceContent: args.sourceContent,
    widgetPlan: stage === 'widget_generation' ? widgetPlanFor(args.lessonPlan, config.allowedWidgets) : undefined,
  };

  const warnings: string[] = [];
  let messages = buildStagePrompt(baseParams);
  let best = '';
  let bestWidgets: WidgetConfig[] | undefined;
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    throwIfAborted(signal);

    let raw: string;
    try {
      raw = await generateRawCompletion(messages[0].content, messages[1].content, settings, {
        temperature: TEMPERATURE[stage],
        signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (attempt === maxRetries) throw error;
      await delay(500 * 2 ** attempt, signal);
      continue;
    }

    // Must match the number the prompt told the model to aim for (S2), otherwise
    // the validator penalizes output for missing a target it was never given.
    const targetWords = stageWordTarget(stage, promptContext.targetWordCount) || 120;

    let text: string;
    let widgets: WidgetConfig[] | undefined;
    let valid: boolean;
    let errors: string[];
    let stageWarnings: string[];

    if (stage === 'widget_generation') {
      const validated = validateWidgetStage(raw, { tier, allowed: baseParams.widgetPlan });
      const payload = validated.fixed ?? { widgets: [] as WidgetConfig[], dropped: [] };
      text = JSON.stringify({ widgets: payload.widgets });
      widgets = payload.widgets;
      valid = validated.valid;
      errors = validated.errors;
      stageWarnings = validated.warnings;
    } else {
      const validated = validateProseStage(raw, {
        stage,
        targetWords,
        tier,
        context: promptContext,
        repetition: (body) =>
          context.checkRepetition(body, conceptsOfStage(stage, args.lessonPlan)),
      });
      text = validated.fixed ?? raw;
      widgets = undefined;
      valid = validated.valid;
      errors = validated.errors;
      stageWarnings = validated.warnings;
    }

    if (valid) {
      return {
        text,
        widgets,
        valid: true,
        retries: attempt,
        warnings: [...stageWarnings, ...warnings],
      };
    }

    lastErrors = errors;
    best = text;
    if (stage === 'widget_generation') bestWidgets = widgets ?? [];

    if (attempt < maxRetries) {
      onProgress?.({
        lessonId: args.lessonPlan.id,
        lessonTitle: args.lessonPlan.title,
        stage,
        stageIndex: args.stageIndex,
        totalStages: args.totalStages,
        status: 'retried',
        message: `${STAGE_LABELS[stage]} needs a fix (${errors[0] ?? 'invalid output'})`,
        percent: Math.round(((args.stageIndex - 0.5) / args.totalStages) * 100),
        retries: attempt + 1,
      });
      await delay(500 * 2 ** attempt, signal);
      messages = buildStageRetryPrompt(baseParams, errors);
    }
  }

  // Out of retries: keep what we have rather than failing the lesson. Widgets
  // degrade to none; prose degrades to the best attempt.
  if (stage === 'widget_generation') {
    warnings.push(`Skipped widgets: ${lastErrors[0] ?? 'validation failed'}`);
    return { text: JSON.stringify({ widgets: bestWidgets ?? [] }), widgets: bestWidgets ?? [], valid: false, retries: maxRetries, warnings };
  }

  warnings.push(`Kept unrepaired ${STAGE_LABELS[stage].toLowerCase()}: ${lastErrors[0] ?? 'validation failed'}`);
  return { text: best, valid: false, retries: maxRetries, warnings };
}

function widgetPlanFor(lessonPlan: LessonPlan, allowed: string[]): string[] {
  const planned = lessonPlan.widgetSuggestions.map((suggestion) => suggestion.type);
  const filtered = planned.filter((type) => allowed.includes(type));
  return filtered.length > 0 ? filtered : allowed.slice(0, 2);
}

function conceptsOfStage(stage: StageType, lessonPlan: LessonPlan): string[] {
  // The stage's own subject must not be flagged as repetition.
  return stage === 'introduction' || stage === 'explanation' ? lessonPlan.keyPoints : [];
}

function buildContext(
  lessonPlan: LessonPlan,
  plan: CoursePlan,
  lessonIndex: number,
  previousLessons: GeneratedLesson[],
  tier: ModelTier,
  estimatedMinutes: number,
  resume?: boolean,
  journal = true
): { context: StageContextManagerType; restored: boolean } {
  const courseContext = {
    courseTitle: plan.title,
    lessonPosition: lessonIndex + 1,
    totalLessons: plan.lessons.length,
    previousLessons: previousLessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      keyPoints: lesson.metadata.tags,
    })),
    modelTier: tier,
    estimatedMinutes,
  };

  if (resume && journal) {
    const restored = StageContextManager.load(lessonPlan.id);
    if (restored) return { context: restored, restored: true };
  }
  return {
    context: new StageContextManager(lessonPlan, courseContext, { persist: journal }),
    restored: false,
  };
}

export { DEFAULT_STAGES };
