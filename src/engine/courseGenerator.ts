/**
 * Course Generator Orchestrator
 *
 * Multi-stage generation strategy (Plan → Execute → Merge) that produces
 * high-quality courses.
 *
 * Two generation modes:
 * - "structured": AI outputs JSON directly (best with strong models)
 * - "focused": AI writes markdown with widget markers, code parses it (works with any model)
 *
 * Why the focused mode works for weak models:
 * 1. Writing natural markdown is easier than producing valid nested JSON
 * 2. Widget markers (:::widget ... :::) are simple and forgiving
 * 3. The deterministic parser always produces valid lesson structure
 * 4. Invalid widgets are silently skipped (lesson still succeeds)
 */

import { generateRawCompletion } from './aiService';
import type { AISettings } from './settings';
import {
  PLAN_SYSTEM_PROMPT,
  LESSON_SYSTEM_PROMPT,
  FOCUSED_SYSTEM_PROMPT,
  buildPlanUserPrompt,
  buildLessonUserPrompt,
  buildFocusedUserPrompt,
  parsePlanResponse,
  parseLessonResponse,
  GeneratedCourseSchema,
  type CoursePlan,
  type LessonPlan,
  type GeneratedLesson,
  type GeneratedCourse,
} from './generatorSchema';
import { parseFocusedLesson } from './lessonParser';

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
  const userPrompt = buildPlanUserPrompt(sourceContent, numLessons);

  const response = await generateRawCompletion(
    PLAN_SYSTEM_PROMPT,
    userPrompt,
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
  const mode = settings.generationMode ?? 'focused';

  if (mode === 'focused') {
    // ─── Focused mode: AI writes markdown, code parses widgets ───
    const response = await generateRawCompletion(
      FOCUSED_SYSTEM_PROMPT,
      buildFocusedUserPrompt(sourceContent, plan, lessonPlan, previousLessons),
      settings,
      { temperature: 0.4, signal }
    );

    const { markdown, widgets } = parseFocusedLesson(response, lessonPlan.id);

    if (!markdown.trim()) {
      throw new Error('AI returned empty lesson content.');
    }

    return {
      id: lessonPlan.id,
      title: lessonPlan.title,
      metadata: {
        difficulty: lessonPlan.suggestedDifficulty ?? 'beginner',
        estimatedMinutes: 10,
        tags: [],
        version: '1.0.0',
      },
      prerequisites: [],
      content: {
        markdown,
        widgets,
      },
    };
  }

  // ─── Structured mode: AI outputs JSON directly ───
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
 * Stage 1 only: Generate a course plan (blueprint) from source content.
 * Use this when you want to show the plan to the user for review/editing
 * before generating the full lesson content.
 */
export async function generateCoursePlan(
  sourceContent: string,
  numLessons: number,
  settings: AISettings,
  options: { onProgress?: ProgressCallback; signal?: AbortSignal; maxRetries?: number } = {}
): Promise<CoursePlan> {
  const { onProgress, signal, maxRetries = 2 } = options;
  const clampedLessons = Math.max(1, Math.min(8, numLessons));

  onProgress?.({
    stage: 'planning',
    message: `Analyzing content and creating a ${clampedLessons}-lesson plan...`,
  });

  return await withRetry(
    () => generatePlan(sourceContent, clampedLessons, settings, signal),
    maxRetries,
    'plan'
  );
}

/**
 * Stage 2+3: Generate lesson content from an existing plan and merge into a course.
 * Use this after the user has reviewed (and possibly edited) the plan.
 */
export async function generateLessonsFromPlan(
  sourceContent: string,
  plan: CoursePlan,
  settings: AISettings,
  options: { onProgress?: ProgressCallback; signal?: AbortSignal; maxRetries?: number } = {}
): Promise<GeneratedCourse> {
  const { onProgress, signal, maxRetries = 2 } = options;

  const lessonsToGenerate = plan.lessons;
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

  onProgress?.({
    stage: 'merging',
    message: 'Assembling and validating final course...',
  });

  return mergeCourse(plan, generatedLessons);
}

/**
 * Regenerate a single lesson while keeping all others intact.
 * Useful when one lesson in a generated course is unsatisfactory.
 *
 * @param sourceContent - The original source text
 * @param plan - The course plan
 * @param lessonIndex - Index of the lesson to regenerate (0-based)
 * @param existingLessons - All currently generated lessons
 * @param settings - AI provider settings
 * @param options - Generation options
 * @returns A new array of lessons with the target lesson replaced
 */
export async function regenerateLesson(
  sourceContent: string,
  plan: CoursePlan,
  lessonIndex: number,
  existingLessons: GeneratedLesson[],
  settings: AISettings,
  options: { onProgress?: ProgressCallback; signal?: AbortSignal; maxRetries?: number } = {}
): Promise<GeneratedLesson[]> {
  const { onProgress, signal, maxRetries = 2 } = options;

  if (lessonIndex < 0 || lessonIndex >= existingLessons.length) {
    throw new Error(`Invalid lesson index: ${lessonIndex}`);
  }

  const lessonPlan = plan.lessons[lessonIndex];
  if (!lessonPlan) {
    throw new Error(`No plan entry found for lesson index ${lessonIndex}`);
  }

  // Lessons before the target are used as context (coherence)
  const lessonsBefore = existingLessons.slice(0, lessonIndex);

  onProgress?.({
    stage: 'generating-lesson',
    currentLesson: lessonIndex + 1,
    totalLessons: existingLessons.length,
    lessonTitle: lessonPlan.title,
    message: `Regenerating lesson ${lessonIndex + 1}: ${lessonPlan.title}`,
  });

  const newLesson = await withRetry(
    () =>
      generateSingleLesson(
        sourceContent,
        plan,
        lessonPlan,
        lessonsBefore,
        settings,
        signal
      ),
    maxRetries,
    `lesson-${lessonPlan.id}-regen`
  );

  // Return a new array with the regenerated lesson in place
  return existingLessons.map((l, i) => (i === lessonIndex ? newLesson : l));
}

/**
 * Generate a complete course from source content using a multi-stage
 * Plan → Execute → Merge strategy.
 * This is a convenience wrapper that runs all stages without a review checkpoint.
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

  const plan = await generateCoursePlan(sourceContent, numLessons, settings, {
    onProgress,
    signal,
    maxRetries,
  });

  return generateLessonsFromPlan(sourceContent, plan, settings, {
    onProgress,
    signal,
    maxRetries,
  });
}
