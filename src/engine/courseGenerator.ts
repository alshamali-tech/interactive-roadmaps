/**
 * Course Generator Orchestrator
 *
 * Multi-stage generation strategy (Plan → Execute → Merge) that produces
 * high-quality courses even with weak/small LLMs.
 *
 * Why this works for both strong and weak models:
 * 1. Stage 1 (Plan) generates a small JSON blueprint (~300 tokens). Even
 *    the weakest models can reliably output this.
 * 2. Stage 2 (Execute) generates ONE lesson at a time (~500 tokens each).
 *    Small, focused output = fewer truncation errors, fewer hallucinations.
 *    Each lesson can be retried independently on failure.
 * 3. Stage 3 (Merge) is pure logic — no LLM involved. Combines lessons,
 *    wires prerequisites, validates with Zod.
 */

import { generateRawCompletion } from './aiService';
import type { AISettings } from './settings';
import {
  PLAN_SYSTEM_PROMPT,
  LESSON_SYSTEM_PROMPT,
  buildPlanUserPrompt,
  buildLessonUserPrompt,
  parsePlanResponse,
  parseLessonResponse,
  GeneratedCourseSchema,
  type CoursePlan,
  type LessonPlan,
  type GeneratedLesson,
  type GeneratedCourse,
} from './generatorSchema';

// ───────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────

export interface GenerationProgress {
  stage: 'planning' | 'generating-lesson' | 'merging';
  currentLesson?: number;
  totalLessons?: number;
  lessonTitle?: string;
  message: string;
}

export type ProgressCallback = (progress: GenerationProgress) => void;

export interface GenerateOptions {
  /** Number of lessons to plan (1-8, default 3) */
  numLessons?: number;
  /** Progress callback for UI updates */
  onProgress?: ProgressCallback;
  /** AbortSignal to cancel generation */
  signal?: AbortSignal;
  /** Max retries per stage (default 2) */
  maxRetries?: number;
}

// ───────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  stageName: string
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(
        `[courseGenerator] ${stageName} failed (attempt ${attempt + 1}/${maxRetries + 1}):`,
        error instanceof Error ? error.message : error
      );
      if (attempt < maxRetries) {
        // Brief pause before retry (gives the model a fresh shot)
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  throw lastError;
}

// ───────────────────────────────────────────────────────────────
// Stage 1: PLAN
// ───────────────────────────────────────────────────────────────

async function generatePlan(
  sourceContent: string,
  numLessons: number,
  settings: AISettings,
  signal?: AbortSignal
): Promise<CoursePlan> {
  const response = await generateRawCompletion(
    PLAN_SYSTEM_PROMPT,
    buildPlanUserPrompt(sourceContent, numLessons),
    settings,
    { temperature: 0.1, signal }
  );
  return parsePlanResponse(response);
}

// ───────────────────────────────────────────────────────────────
// Stage 2: EXECUTE (one lesson at a time)
// ───────────────────────────────────────────────────────────────

async function generateSingleLesson(
  sourceContent: string,
  plan: CoursePlan,
  lessonPlan: LessonPlan,
  previousLessons: GeneratedLesson[],
  settings: AISettings,
  signal?: AbortSignal
): Promise<GeneratedLesson> {
  const response = await generateRawCompletion(
    LESSON_SYSTEM_PROMPT,
    buildLessonUserPrompt(sourceContent, plan, lessonPlan, previousLessons),
    settings,
    { temperature: 0.1, signal }
  );
  return parseLessonResponse(response);
}

// ───────────────────────────────────────────────────────────────
// Stage 3: MERGE (no LLM)
// ───────────────────────────────────────────────────────────────

function mergeCourse(plan: CoursePlan, lessons: GeneratedLesson[]): GeneratedCourse {
  // Wire prerequisites: each lesson depends on the previous one
  const wiredLessons = lessons.map((lesson, index) => ({
    ...lesson,
    prerequisites: index > 0 ? [lessons[index - 1].id] : [],
  }));

  const course: GeneratedCourse = {
    title: plan.title,
    description: plan.description,
    lessons: wiredLessons,
  };

  // Final validation
  const result = GeneratedCourseSchema.safeParse(course);
  if (!result.success) {
    const fieldErrors = result.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Final course validation failed.\n\n${fieldErrors}`);
  }

  return result.data;
}

// ───────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────

/**
 * Generate a complete course from source content using a multi-stage
 * Plan → Execute → Merge strategy.
 *
 * @param sourceContent - The extracted source text (article, docs, etc.)
 * @param settings - AI provider settings
 * @param options - Generation options (numLessons, onProgress, signal)
 * @returns The fully generated course
 */
export async function generateCourse(
  sourceContent: string,
  settings: AISettings,
  options: GenerateOptions = {}
): Promise<GeneratedCourse> {
  const {
    numLessons = 3,
    onProgress,
    signal,
    maxRetries = 2,
  } = options;

  const clampedLessons = Math.max(1, Math.min(8, numLessons));

  // ── Stage 1: Plan ──────────────────────────────────────────
  onProgress?.({
    stage: 'planning',
    message: `Analyzing content and creating a ${clampedLessons}-lesson plan...`,
  });

  const plan = await withRetry(
    () => generatePlan(sourceContent, clampedLessons, settings, signal),
    maxRetries,
    'plan'
  );

  // If the model produced fewer lessons than requested, that's fine — adapt
  const lessonsToGenerate = plan.lessons;

  // ── Stage 2: Execute (one lesson at a time) ────────────────
  const generatedLessons: GeneratedLesson[] = [];

  for (let i = 0; i < lessonsToGenerate.length; i++) {
    const lessonPlan = lessonsToGenerate[i];

    onProgress?.({
      stage: 'generating-lesson',
      currentLesson: i + 1,
      totalLessons: lessonsToGenerate.length,
      lessonTitle: lessonPlan.title,
      message: `Writing lesson ${i + 1} of ${lessonsToGenerate.length}: ${lessonPlan.title}`,
    });

    const lesson = await withRetry(
      () =>
        generateSingleLesson(
          sourceContent,
          plan,
          lessonPlan,
          generatedLessons,
          settings,
          signal
        ),
      maxRetries,
      `lesson-${lessonPlan.id}`
    );

    generatedLessons.push(lesson);
  }

  // ── Stage 3: Merge ─────────────────────────────────────────
  onProgress?.({
    stage: 'merging',
    message: 'Assembling and validating final course...',
  });

  return mergeCourse(plan, generatedLessons);
}
