/**
 * S3 — Stage Context Manager tests.
 *
 * Each `describe` maps to one of the task's acceptance criteria:
 * accumulation, per-lesson/per-course concept tracking, repetition detection,
 * word budget, localStorage persistence, serialization, terminology and the
 * anti-repetition list.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  StageContextManager,
  countWords,
  stripMarkdown,
  extractCandidateConcepts,
  extractTerminology,
  extractCodeLanguages,
  DEFAULT_STAGES,
  type CourseContext,
} from './stageContext';
import type { LessonPlan } from './generatorSchema';

const lessonPlan: LessonPlan = {
  id: 'rag-basics',
  title: 'Retrieval-Augmented Generation',
  suggestedDifficulty: 'beginner',
  keyPoints: ['Embeddings', 'Vector Store', 'Chunking Strategy'],
  widgetSuggestions: [],
};

const courseContext: CourseContext = {
  courseTitle: 'AI Engineer',
  lessonPosition: 2,
  totalLessons: 6,
  previousLessons: [
    { id: 'tokens', title: 'Tokens', keyPoints: ['Context Window', 'Tokenization'] },
  ],
  estimatedMinutes: 10,
};

function make(overrides: Partial<CourseContext> = {}, options = { persist: false }) {
  return new StageContextManager(lessonPlan, { ...courseContext, ...overrides }, options);
}

beforeEach(() => {
  localStorage.clear();
});

describe('construction', () => {
  it('seeds known concepts from previous lessons and remaining from the plan', () => {
    const manager = make();
    const context = manager.getContext();

    expect(context.conceptsAlreadyKnown).toEqual(['Context Window', 'Tokenization']);
    expect(context.conceptsRemaining).toEqual(['Embeddings', 'Vector Store', 'Chunking Strategy']);
    expect(context.conceptsIntroducedSoFar).toEqual([]);
    expect(context.currentStage).toBe('introduction');
    expect(context.stagesRemaining).toEqual(DEFAULT_STAGES);
    expect(context.difficultyLevel).toBe('beginner');
  });

  it('derives the word budget from estimated minutes, not a missing lessonLength field', () => {
    expect(make({ estimatedMinutes: 10 }).getContext().targetWordCount).toBe(1300);
    expect(make({ estimatedMinutes: 60 }).getContext().targetWordCount).toBe(2600); // clamped
    expect(make({ estimatedMinutes: 1 }).getContext().targetWordCount).toBe(300); // clamped up
    // Unknown duration still yields a usable budget rather than 0.
    expect(make({ estimatedMinutes: undefined }).getContext().targetWordCount).toBe(1200);
  });
});

describe('accumulation across stages', () => {
  it('advances the stage plan and consumes budget as stages complete', () => {
    const manager = make();
    manager.updateAfterStage('introduction', 'One two three four five six.');
    manager.updateAfterStage('motivation', 'Seven eight nine ten.');

    const context = manager.getContext();
    expect(context.stagesCompleted).toEqual(['introduction', 'motivation']);
    expect(context.stagesRemaining[0]).toBe('explanation');
    expect(context.currentStage).toBe('explanation');
    expect(context.wordCountSoFar).toBe(10);
  });

  it('does not double-count words when a completed stage is re-recorded', () => {
    const manager = make();
    manager.updateAfterStage('introduction', 'One two three.');
    const after = manager.getContext().wordCountSoFar;
    manager.updateAfterStage('introduction', 'One two three.');

    expect(manager.getContext().wordCountSoFar).toBe(after);
    expect(manager.getContext().stagesCompleted.filter((s) => s === 'introduction')).toHaveLength(1);
  });

  it('setStages replaces the plan for tier-adaptive pipelines (S1/S6)', () => {
    const manager = make();
    manager.setStages(['introduction', 'quiz', 'summary']);
    expect(manager.getContext().stagesRemaining).toEqual(['introduction', 'quiz', 'summary']);
    expect(manager.getContext().currentStage).toBe('introduction');
  });
});

describe('concept tracking per lesson and course', () => {
  it('getKnownConcepts combines course history with this lesson', () => {
    const manager = make();
    manager.updateAfterStage('introduction', 'We describe Embeddings and how a Vector Store works.');

    const known = manager.getKnownConcepts();
    expect(known).toContain('Context Window'); // from the previous lesson
    expect(known).toContain('Embeddings'); // introduced here
    expect(known).toContain('Vector Store');
    expect(manager.getContext().conceptsRemaining).toEqual(['Chunking Strategy']);
  });

  it('records new terminology without overwriting an established expansion', () => {
    const manager = make();
    manager.updateAfterStage('explanation', 'RAG (Retrieval-Augmented Generation) needs Chunking.');
    manager.updateAfterStage('summary', 'RAG (Retrieval Augmented Generation) again.');

    expect(manager.getContext().terminologyUsed.RAG).toBe('Retrieval-Augmented Generation');
  });

  it('records the language used in code fences as an implicit decision', () => {
    const manager = make();
    manager.updateAfterStage('example', '```python\nprint(1)\n```');
    expect(manager.getContext().keyDecisionsMade).toContain('Examples use python');
  });

  it('caps the introduced-concept list so it cannot grow unbounded', () => {
    const manager = make();
    const names = Array.from({ length: 120 }, (_, i) =>
      `Zeta${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`
    );
    manager.updateAfterStage('explanation', names.join(' and '));
    expect(manager.getContext().conceptsIntroducedSoFar.length).toBeLessThanOrEqual(60);
  });
});

describe('repetition detection', () => {
  it('flags a full re-definition of an already known concept as an error', () => {
    const manager = make();
    const issues = manager.checkRepetition(
      'A Context Window is a way to limit how much text the model sees.'
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].concept).toBe('Context Window');
    expect(issues[0].severity).toBe('error');
  });

  it('flags a brief re-explanation as a warning', () => {
    const manager = make();
    const issues = manager.checkRepetition('Tokenization is a process that splits text apart.');
    expect(issues.map((issue) => issue.severity)).toEqual(['warning']);
  });

  it('does not flag a concept merely being used', () => {
    const manager = make();
    expect(
      manager.checkRepetition('Send your prompt and watch the Context Window fill up.')
    ).toEqual([]);
  });

  it('excludes the concept the current stage is legitimately about', () => {
    const manager = make();
    const text = 'A Context Window is a way to bound how much text the model sees.';
    expect(manager.checkRepetition(text).length).toBeGreaterThan(0);
    expect(manager.checkRepetition(text, ['Context Window'])).toEqual([]);
  });
});

describe('word budget', () => {
  it('shrinks as stages consume it and never goes negative', () => {
    const manager = make({}, { persist: false });
    manager.updateAfterStage('introduction', 'a '.repeat(400));

    expect(manager.getWordBudget()).toBe(1300 - 400);
    expect(manager.isWordBudgetExceeded()).toBe(false);

    manager.updateAfterStage('explanation', 'b '.repeat(1200));
    expect(manager.getWordBudget()).toBe(0);
    expect(manager.isWordBudgetExceeded()).toBe(true);
  });
});

describe('persistence and serialization', () => {
  it('writes to localStorage after each stage and reloads identical state', () => {
    const manager = new StageContextManager(lessonPlan, courseContext);
    manager.updateAfterStage('introduction', 'About Embeddings and Vector Store today.');

    expect(localStorage.getItem(StageContextManager.storageKey('rag-basics'))).toBeTruthy();

    const restored = StageContextManager.load('rag-basics');
    expect(restored).not.toBeNull();
    expect(restored!.getContext()).toEqual(manager.getContext());
    expect(restored!.getKnownConcepts()).toEqual(manager.getKnownConcepts());
  });

  it('round-trips through serialize/deserialize', () => {
    const manager = make();
    manager.updateAfterStage('quiz', 'Quick check about Chunking Strategy.');
    const restored = StageContextManager.deserialize(manager.serialize());
    expect(restored.getContext()).toEqual(manager.getContext());
  });

  it('throws on payloads it cannot recognise and loads null instead of crashing', () => {
    expect(() => StageContextManager.deserialize('{}')).toThrow(/unrecognized payload/);
    expect(() => StageContextManager.deserialize('{"version":99}')).toThrow(/unrecognized payload/);
    expect(() => StageContextManager.deserialize('not json')).toThrow();

    expect(StageContextManager.load('never-saved')).toBeNull();
    localStorage.setItem(StageContextManager.storageKey('broken'), 'garbage{');
    expect(StageContextManager.load('broken')).toBeNull();
  });

  it('survives storage failures instead of aborting generation', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded');
    };
    try {
      expect(() => new StageContextManager(lessonPlan, courseContext)).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('prunes to the ten most recent saved contexts', () => {
    for (let i = 0; i < 12; i++) {
      localStorage.setItem(
        StageContextManager.storageKey(`old-${i}`),
        JSON.stringify({ version: 1, savedAt: 1000 + i, context: { lessonId: `old-${i}` } })
      );
    }
    new StageContextManager(lessonPlan, courseContext);

    const kept = Object.keys(localStorage).filter((key) =>
      key.startsWith('stage-context:')
    );
    expect(kept.length).toBeLessThanOrEqual(10);
    expect(kept).toContain(StageContextManager.storageKey('rag-basics'));
    expect(kept).toContain(StageContextManager.storageKey('old-11'));
    expect(kept).not.toContain(StageContextManager.storageKey('old-0'));
  });

  it('reset forgets tracked progress and removes saved state', () => {
    const manager = new StageContextManager(lessonPlan, courseContext);
    manager.updateAfterStage('introduction', 'About Embeddings.');
    expect(StageContextManager.load('rag-basics')).not.toBeNull();

    manager.reset();

    expect(manager.getContext().wordCountSoFar).toBe(0);
    expect(manager.getContext().conceptsIntroducedSoFar).toEqual([]);
    expect(StageContextManager.load('rag-basics')).toBeNull();
  });
});

describe('anti-repetition list and prompt rendering', () => {
  it('grows the list and ignores duplicates and blanks', () => {
    const manager = make();
    manager.addAntiRepetitionItem('in today’s fast-paced world');
    manager.addAntiRepetitionItem('In Today’s Fast-Paced World');
    manager.addAntiRepetitionItem('   ');

    expect(manager.getContext().antiRepetitionList).toEqual(['in today’s fast-paced world']);
  });

  it('renders a prompt block that carries budget, terminology and bans', () => {
    const manager = make();
    manager.updateAfterStage('introduction', 'RAG (Retrieval-Augmented Generation) about Embeddings.');
    manager.addAntiRepetitionItem('delve');

    const prompt = manager.getStagePromptContext();
    expect(prompt.wordBudget).toBeLessThan(prompt.targetWordCount);
    expect(prompt.terminology).toEqual(['RAG = Retrieval-Augmented Generation']);
    expect(prompt.text).toContain('LESSON: Retrieval-Augmented Generation (lesson 2 of 6)');
    expect(prompt.text).toContain('do NOT define or re-explain these');
    expect(prompt.text).toContain('Context Window');
    expect(prompt.text).toContain('WORD BUDGET REMAINING:');
    expect(prompt.text).toContain('DO NOT REPEAT THESE PHRASES: delve');
  });
});

describe('markdown-aware helpers', () => {
  it('excludes code from the word count', () => {
    const withCode = 'Prose words here.\n\n```python\n' + 'x = 1\n'.repeat(50) + '```\n';
    expect(countWords(withCode)).toBe(3);
  });

  it('keeps link text but drops markup, fences and headings', () => {
    const text = '## Title\nSee [the docs](https://example.com) for `tokens` and more.\n';
    expect(stripMarkdown(text)).toBe('Title See the docs for and more.');
  });

  it('extracts candidate concepts while filtering stopword-only noise', () => {
    const found = extractCandidateConcepts(
      'A Vector Store keeps Chunking Strategy details. It is a good idea.'
    );
    expect(found).toContain('Vector Store');
    expect(found.some((phrase) => /\bthe\b/i.test(phrase))).toBe(false);
  });

  it('extracts terminology pairs in both orders and fence languages', () => {
    expect(extractTerminology('RAG (Retrieval-Augmented Generation) works')).toContainEqual([
      'RAG',
      'Retrieval-Augmented Generation',
    ]);
    expect(extractTerminology('Retrieval Augmented Generation (RAG) works')).toContainEqual([
      'RAG',
      'Retrieval Augmented Generation',
    ]);
    expect(extractCodeLanguages('```js\ncode\n``` and ```sql\nselect 1\n```')).toEqual([
      'js',
      'sql',
    ]);
  });
});
