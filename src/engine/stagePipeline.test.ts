/**
 * S1 + S9 — Staged pipeline orchestration and integration tests.
 *
 * The AI service is fully mocked, so no test can reach a provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateRawCompletion } from './aiService';
import { generateLessonStaged, determineStages, contentTypesForPlan } from './stagePipeline';
import { generateLessonsFromPlan } from './courseGenerator';
import {
  clearLessonHistory,
  getCompletedStages,
  saveStageOutput,
} from './generationHistory';
import type { CoursePlan, GeneratedLesson, LessonPlan } from './generatorSchema';
import type { AISettings } from './settings';

vi.mock('./aiService', () => ({ generateRawCompletion: vi.fn() }));
vi.mock('./generationHistory', () => ({
  saveStageOutput: vi.fn().mockResolvedValue(true),
  getCompletedStages: vi.fn().mockResolvedValue([]),
  getStageOutput: vi.fn().mockResolvedValue(null),
  clearLessonHistory: vi.fn().mockResolvedValue(undefined),
  pruneHistory: vi.fn().mockResolvedValue(0),
  getInterruptedLessons: vi.fn().mockResolvedValue(new Map()),
}));

const mockGenerate = vi.mocked(generateRawCompletion);

const weakSettings: AISettings = {
  provider: 'ollama',
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3.2:3b',
  generationMode: 'focused',
};

const lessonPlan: LessonPlan = {
  id: 'lesson-1',
  title: 'Vector Stores',
  suggestedDifficulty: 'beginner',
  keyPoints: ['Embeddings', 'ANN Search'],
  widgetSuggestions: [],
};

const plan: CoursePlan = {
  title: 'AI Engineer',
  description: 'Foundations',
  lessons: [lessonPlan],
};

/** ~120 words: clears the weak-tier floor for every prose stage at this budget. */
const prose = Array.from({ length: 120 }, (_, i) => `alpha${i % 7}`).join(' ');

const quizProse = `### Knowledge Check\n\n**Q1. What does an index do?**\nAnswer: It lets the store skip irrelevant vectors.\n\n${prose}`;

/**
 * Stage-aware fake completion: the prompts are written so that a fixture can
 * branch on them, which keeps tests free of needless retry sleeps.
 */
function respond(system: string): string {
  if (system.includes('JSON API for interactive learning widgets')) {
    return '{"widgets":[]}';
  }
  if (system.includes('KNOWLEDGE CHECK')) return quizProse;
  return prose;
}

const validLessonJson = JSON.stringify({
  id: 'lesson-1',
  title: 'Vector Stores',
  metadata: { difficulty: 'beginner', estimatedMinutes: 5, tags: [], version: '1.0.0' },
  prerequisites: [],
  content: { markdown: '# Vector Stores\n\nBody text.', widgets: [] },
});

function params(overrides: Record<string, unknown> = {}) {
  return {
    lessonPlan,
    plan,
    lessonIndex: 0,
    previousLessons: [] as GeneratedLesson[],
    sourceContent: 'Source about vector stores.',
    settings: weakSettings,
    estimatedMinutes: 5,
    journal: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(getCompletedStages).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('determineStages', () => {
  it('respects the tier stage budget from S6 rather than a hardcoded list', () => {
    expect(determineStages('short', 'weak')).toHaveLength(5);
    expect(determineStages('short', 'strong')).toHaveLength(4);
    expect(determineStages('long', 'weak')).toHaveLength(6);
    expect(determineStages('medium', 'medium')).toHaveLength(6);
  });

  it('merges sections instead of dropping them when over budget', () => {
    const stages = determineStages('short', 'strong');
    expect(stages).toContain('introduction');
    expect(stages).not.toContain('motivation'); // merged into introduction
    expect(stages).not.toContain('review'); // long-only
  });

  it('only schedules the widget stage when the plan wants interactivity', () => {
    expect(determineStages('medium', 'weak', ['text'])).not.toContain('widget_generation');
    expect(determineStages('medium', 'weak', ['interactive'])).toContain('widget_generation');
  });

  it('derives content types from the lesson plan', () => {
    expect(contentTypesForPlan(lessonPlan)).toEqual(['text']);
    expect(
      contentTypesForPlan({
        ...lessonPlan,
        keyPoints: ['Implement a query'],
        widgetSuggestions: [{ type: 'sandbox', purpose: 'try it' }],
      })
    ).toEqual(['text', 'interactive', 'code']);
  });
});

describe('generateLessonStaged', () => {
  it('runs one call per stage and returns a schema-valid lesson', async () => {
    mockGenerate.mockImplementation(async (system: string) => respond(system));

    const result = await generateLessonStaged(params());

    expect(result.tier).toBe('weak');
    expect(result.stages).toHaveLength(5);
    expect(mockGenerate).toHaveBeenCalledTimes(5);
    expect(result.lesson.content.markdown).toContain('alpha0');
    expect(result.lesson.id).toBe('lesson-1');
    expect(saveStageOutput).toHaveBeenCalledTimes(5);
    expect(clearLessonHistory).toHaveBeenCalledWith('lesson-1');
    expect(localStorage.getItem('stage-context:lesson-1')).toBeNull();
  });

  it('reports progress for every stage with a monotonic percentage', async () => {
    mockGenerate.mockImplementation(async (system: string) => respond(system));
    const onProgress = vi.fn();

    await generateLessonStaged(params({ onProgress }));

    const percents = onProgress.mock.calls.map((call) => call[0].percent);
    expect([...percents].sort((a, b) => a - b)).toEqual(percents);
    expect(onProgress.mock.calls.at(-1)![0].status).toBe('completed');
    expect(onProgress.mock.calls[0][0].message).toMatch(/writing/i);
  });

  it('retries a failing stage once with a stricter prompt, then accepts it', async () => {
    mockGenerate
      .mockResolvedValueOnce('Too short.')
      .mockResolvedValue(prose);

    const result = await generateLessonStaged(params({ maxRetries: 1 }));

    expect(result.retriesUsed).toBeGreaterThanOrEqual(1);
    expect(result.lesson.content.markdown).toContain('alpha0');

    const retryPrompt = mockGenerate.mock.calls[1][0];
    expect(retryPrompt).toMatch(/REJECTED BY THE VALIDATOR/);
    expect(retryPrompt).toMatch(/smallest change/i);
  });

  it('drops disallowed widgets but still produces the lesson', async () => {
    const widgetPlanLesson: LessonPlan = {
      ...lessonPlan,
      widgetSuggestions: [{ type: 'mutator', purpose: 'practice' }],
    };
    mockGenerate.mockImplementation(async (system: string) =>
      system.includes('JSON API for interactive learning widgets')
        ? '{"widgets":[{"type":"mutator","props":{"language":"python","brokenCode":"x=1","hint":"h"}}]}'
        : prose
    );

    const result = await generateLessonStaged(
      params({ lessonPlan: widgetPlanLesson, maxRetries: 0 })
    );

    expect(result.lesson.content.widgets).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/Dropped widget/);
  });

  it('repairs a structurally broken diagram instead of discarding it', async () => {
    // Diagrams are not offered to the weak tier, so this needs a medium model.
    const mediumSettings: AISettings = { ...weakSettings, model: 'qwen2.5:32b' };
    const widgetPlanLesson: LessonPlan = {
      ...lessonPlan,
      widgetSuggestions: [{ type: 'context-diagram', purpose: 'show flow' }],
    };
    const brokenDiagram = JSON.stringify({
      widgets: [
        {
          type: 'context-diagram',
          props: {
            diagram: {
              type: 'flow',
              title: 'Flow',
              nodes: [
                { id: 'a', label: 'Start', type: 'input' },
                { id: 'b', label: 'End', type: 'output' },
              ],
              // 'ghost' does not exist -> dangling edge, auto-fixable
              edges: [{ from: 'a', to: 'ghost' }],
            },
          },
        },
      ],
    });
    mockGenerate.mockImplementation(async (system: string) =>
      system.includes('JSON API for interactive learning widgets') ? brokenDiagram : prose
    );

    const result = await generateLessonStaged(
      params({ lessonPlan: widgetPlanLesson, settings: mediumSettings, maxRetries: 0 })
    );

    expect(result.lesson.content.widgets).toHaveLength(1);
    expect(result.warnings.join(' ')).toMatch(/Repaired diagram widget/);
  });

  it('propagates abort without falling through to later stages', async () => {
    const controller = new AbortController();
    controller.abort();
    mockGenerate.mockImplementation(async (system: string) => respond(system));

    await expect(
      generateLessonStaged(params({ signal: controller.signal }))
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('skips AI calls for stages already journaled (resume)', async () => {
    vi.mocked(getCompletedStages).mockResolvedValueOnce([
      {
        id: 'lesson-1:introduction',
        lessonId: 'lesson-1',
        stage: 'introduction',
        output: 'Previously written introduction.',
        savedAt: 1,
        valid: true,
      },
    ]);
    mockGenerate.mockImplementation(async (system: string) => respond(system));
    const onProgress = vi.fn();

    const result = await generateLessonStaged(params({ onProgress, resume: true }));

    expect(result.resumedStages).toEqual(['introduction']);
    expect(mockGenerate).toHaveBeenCalledTimes(4);
    expect(result.lesson.content.markdown).toContain('Previously written introduction.');
    expect(onProgress.mock.calls.some((call) => call[0].status === 'skipped')).toBe(true);
  });

  it('surfaces the model tier and reason for logging', async () => {
    mockGenerate.mockImplementation(async (system: string) => respond(system));
    const result = await generateLessonStaged(params());
    expect(result.tierReason).toMatch(/3B local model/);
  });
});

describe('S9 integration with courseGenerator', () => {
  it('uses the staged pipeline when settings enable the flag', async () => {
    mockGenerate.mockImplementation(async (system: string) => respond(system));
    const settings: AISettings = { ...weakSettings, useStagedGeneration: true };

    const course = await generateLessonsFromPlan('source', plan, settings, {
      signal: undefined,
    });

    // Staged path makes one call per stage; single-call mode would make ~1.
    expect(mockGenerate.mock.calls.length).toBeGreaterThan(1);
    expect(course.lessons).toHaveLength(1);
  });

  it('prefers an explicit staged:false option over the setting', async () => {
    mockGenerate.mockResolvedValue(validLessonJson);
    const settings: AISettings = {
      ...weakSettings,
      provider: 'openai',
      apiKey: 'sk-test',
      generationMode: 'structured',
      useStagedGeneration: true,
    };

    await generateLessonsFromPlan('source', plan, settings, { staged: false });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).not.toMatch(/ONE section of a larger lesson/);
  });

  it('falls back to single-call generation when staging fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settings: AISettings = {
      ...weakSettings,
      provider: 'openai',
      apiKey: 'sk-test',
      generationMode: 'structured',
    };

    mockGenerate.mockImplementation(async (system: string) => {
      if (system.includes('ONE section of a larger lesson') ||
          system.includes('JSON API for interactive learning widgets')) {
        throw new Error('staged boom');
      }
      return validLessonJson;
    });

    const course = await generateLessonsFromPlan('source', plan, settings, { staged: true });

    expect(course.lessons).toHaveLength(1);
    expect(course.lessons[0].title).toBe('Vector Stores');
    expect(warn.mock.calls.flat().join(' ')).toMatch(/falling back to single-call/);
    warn.mockRestore();
  });

  it('does not swallow aborts in the fallback path', async () => {
    const settings: AISettings = { ...weakSettings, generationMode: 'structured' };
    mockGenerate.mockRejectedValue(
      Object.assign(new Error('user stopped'), { name: 'AbortError' })
    );

    await expect(
      generateLessonsFromPlan('source', plan, settings, { staged: true })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
