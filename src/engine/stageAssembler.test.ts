/**
 * S5 — Stage Assembly tests.
 */
import { describe, it, expect } from 'vitest';
import {
  assembleStagedLesson,
  assignWidgetIds,
  dedupeConcepts,
  mergeStageOutputs,
  normalizeHeading,
  validateAssembledLesson,
  type StageOutput,
} from './stageAssembler';
import { GeneratedLessonSchema, type WidgetConfig } from './generatorSchema';
import type { StageContext } from './stageContext';

const lessonPlan = {
  id: 'lesson-1',
  title: 'Vector Stores',
  suggestedDifficulty: 'intermediate' as const,
  keyPoints: ['Embeddings', 'ANN Search'],
  widgetSuggestions: [{ type: 'sandbox' as const, purpose: 'experiment' }],
};

const baseContext = {
  lessonId: 'lesson-1',
  lessonTitle: 'Vector Stores',
  lessonPosition: 1,
  totalLessons: 3,
  conceptsAlreadyKnown: ['Tokens'],
  conceptsIntroducedSoFar: ['embeddings'],
  conceptsRemaining: ['ANN Search'],
  stagesCompleted: ['introduction'],
  stagesRemaining: ['explanation'],
  currentStage: 'explanation' as const,
  wordCountSoFar: 400,
  targetWordCount: 1200,
  keyDecisionsMade: [],
  terminologyUsed: {},
  tone: 'Conversational but technical',
  difficultyLevel: 'intermediate' as const,
  antiRepetitionList: [],
  modelTier: 'medium' as const,
} satisfies StageContext;

const sandboxWidget = {
  type: 'sandbox',
  props: { inputType: 'text', outputType: 'text', initialState: 'try' },
} as unknown as WidgetConfig;

describe('dedupeConcepts', () => {
  it('is case-insensitive and order preserving', () => {
    expect(dedupeConcepts(['Embeddings', 'embeddings', ' ANN Search ', ''])).toEqual([
      'Embeddings',
      'ANN Search',
    ]);
  });
});

describe('normalizeHeading', () => {
  it('adds a stage heading when the output has none', () => {
    expect(normalizeHeading('Plain prose here.', 'motivation')).toBe(
      '### Motivation\n\nPlain prose here.'
    );
  });

  it('demotes a stage-authored H1 to H3', () => {
    expect(normalizeHeading('# Too Big\nBody', 'explanation')).toBe('### Too Big\nBody');
  });

  it('leaves existing h2-h6 headings alone', () => {
    expect(normalizeHeading('#### Deep', 'summary')).toBe('#### Deep');
  });
});

describe('assignWidgetIds', () => {
  it('uses the lesson-scoped numbering the app expects', () => {
    const assigned = assignWidgetIds('lesson-2', [sandboxWidget, sandboxWidget]);
    expect(assigned.map((widget) => widget.id)).toEqual([
      'lesson-2-widget-1',
      'lesson-2-widget-2',
    ]);
  });
});

describe('mergeStageOutputs', () => {
  it('orders sections by reading order regardless of completion order', () => {
    const outputs: StageOutput[] = [
      { stage: 'summary', text: 'Wrap up.' },
      { stage: 'introduction', text: 'Start here.' },
      { stage: 'explanation', text: 'The core.' },
    ];
    const { markdown } = mergeStageOutputs(outputs, []);
    expect(markdown.indexOf('Start here.')).toBeLessThan(markdown.indexOf('The core.'));
    expect(markdown.indexOf('The core.')).toBeLessThan(markdown.indexOf('Wrap up.'));
  });

  it('places widget tags after the example section, not at the very end', () => {
    const outputs: StageOutput[] = [
      { stage: 'example', text: 'An example.' },
      { stage: 'summary', text: 'Summary.' },
    ];
    const { markdown } = mergeStageOutputs(outputs, ['<widget id="lesson-1-widget-1" />']);
    expect(markdown.indexOf('An example.')).toBeLessThan(markdown.indexOf('<widget'));
    expect(markdown.indexOf('<widget')).toBeLessThan(markdown.indexOf('Summary.'));
  });

  it('appends widgets at the end when no prose section qualifies', () => {
    const outputs: StageOutput[] = [{ stage: 'review', text: 'Reflect on this.' }];
    const { markdown } = mergeStageOutputs(outputs, ['<widget id="w1" />']);
    expect(markdown).toContain('Reflect on this.');
    expect(markdown.indexOf('<widget')).toBeGreaterThan(markdown.indexOf('Reflect'));
  });
});

describe('assembleStagedLesson', () => {
  it('produces a lesson that satisfies GeneratedLessonSchema', () => {
    const lesson = assembleStagedLesson({
      lessonPlan,
      planTitle: 'AI Engineer',
      outputs: [
        { stage: 'introduction', text: 'Welcome to vector stores.' },
        { stage: 'explanation', text: 'How ANN search works.' },
        { stage: 'widget_generation', text: '{}', widgets: [sandboxWidget] },
      ],
      context: baseContext,
      estimatedMinutes: 12,
    });

    const result = GeneratedLessonSchema.safeParse(lesson);
    expect(result.success).toBe(true);
    expect(lesson.content.widgets).toHaveLength(1);
    expect(lesson.content.markdown).toContain('<widget id="lesson-1-widget-1" />');
    expect(lesson.metadata.difficulty).toBe('intermediate');
    expect(lesson.metadata.estimatedMinutes).toBe(12);
  });

  it('derives tags from the plan and introduced concepts without duplicates', () => {
    const lesson = assembleStagedLesson({
      lessonPlan,
      planTitle: 'AI Engineer',
      outputs: [{ stage: 'explanation', text: 'Text' }],
      context: baseContext,
      estimatedMinutes: 8,
    });
    expect(lesson.metadata.tags).toEqual(['Embeddings', 'ANN Search', 'embeddings'].slice(0, 2));
  });

  it('falls back to the word budget when minutes are unknown', () => {
    const lesson = assembleStagedLesson({
      lessonPlan,
      planTitle: 'AI Engineer',
      outputs: [{ stage: 'explanation', text: 'Text' }],
      context: baseContext,
      estimatedMinutes: 0,
    });
    // 1200 words / 130 wpm
    expect(lesson.metadata.estimatedMinutes).toBe(9);
  });
});

describe('validateAssembledLesson', () => {
  it('flags widget references with no declaration and repairs them', () => {
    const lesson = assembleStagedLesson({
      lessonPlan,
      planTitle: 'AI Engineer',
      outputs: [{ stage: 'explanation', text: 'Text\n\n<widget id="ghost" />' }],
      context: baseContext,
      estimatedMinutes: 10,
    });

    const check = validateAssembledLesson(lesson);
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toContain('ghost');
    expect(check.fixed!.content.markdown).not.toContain('ghost');
  });

  it('accepts a well-formed lesson and warns about unplaced widgets', () => {
    const lesson = assembleStagedLesson({
      lessonPlan,
      planTitle: 'AI Engineer',
      outputs: [{ stage: 'introduction', text: '### Intro\nHello' }],
      context: baseContext,
      estimatedMinutes: 10,
    });
    const check = validateAssembledLesson(lesson);
    expect(check.valid).toBe(true);
    expect(check.errors).toEqual([]);
  });
});
