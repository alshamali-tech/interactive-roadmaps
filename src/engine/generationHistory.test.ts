/**
 * S8 — Generation history journal tests.
 *
 * jsdom has no IndexedDB, so the Dexie table is replaced with an in-memory fake.
 * The important behaviour under test is that a missing store never throws.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearLessonHistory,
  getCompletedStages,
  getInterruptedLessons,
  getStageOutput,
  pruneHistory,
  saveStageOutput,
  stageRecordId,
  type StageOutputRecord,
} from './generationHistory';

interface FakeStore {
  rows: Map<string, StageOutputRecord>;
  failNext: boolean;
}

const store: FakeStore = { rows: new Map(), failNext: false };
;(globalThis as Record<string, unknown>).__journalStore = store;

vi.mock('./localCourses', () => {
  const fake: FakeStore = (globalThis as Record<string, unknown>).__journalStore as FakeStore;

  const matching = (key: 'lessonId' | 'savedAt', value: unknown) =>
    [...fake.rows.values()].filter((row) => row[key] === value);

  const table = {
    put: vi.fn(async (record: StageOutputRecord) => {
      if (fake.failNext) throw new Error('IndexedDB unavailable');
      fake.rows.set(record.id, record);
      return record.id;
    }),
    get: vi.fn(async (id: string) => fake.rows.get(id)),
    where: (key: 'lessonId' | 'savedAt') => ({
      equals: (value: unknown) => ({
        toArray: async () => matching(key, value),
        delete: async () => {
          for (const row of matching(key, value)) fake.rows.delete(row.id);
        },
      }),
      between: (lower: unknown, upper: unknown) => ({
        toArray: async () =>
          [...fake.rows.values()].filter(
            (row) => Number(row[key]) >= Number(lower) && Number(row[key]) <= Number(upper)
          ),
      }),
      toArray: async () => [...fake.rows.values()],
    }),
  };

  return { db: { stageOutputs: table } };
});

beforeEach(() => {
  store.rows.clear();
  store.failNext = false;
});

describe('stageRecordId', () => {
  it('is stable per lesson and stage so re-saving overwrites', () => {
    expect(stageRecordId('lesson-1', 'quiz')).toBe('lesson-1:quiz');
  });
});

describe('saveStageOutput / reads', () => {
  it('round-trips a stage and returns completed stages in save order', async () => {
    await saveStageOutput({
      lessonId: 'lesson-1',
      stage: 'summary',
      output: 'Later stage',
      savedAt: 200,
      valid: true,
    });
    await saveStageOutput({
      lessonId: 'lesson-1',
      stage: 'introduction',
      output: 'First stage',
      savedAt: 100,
      valid: true,
    });

    const completed = await getCompletedStages('lesson-1');
    expect(completed.map((row) => row.stage)).toEqual(['introduction', 'summary']);

    const single = await getStageOutput('lesson-1', 'introduction');
    expect(single?.output).toBe('First stage');
  });

  it('is idempotent for the same lesson and stage', async () => {
    await saveStageOutput({ lessonId: 'l', stage: 'quiz', output: 'v1', savedAt: 1, valid: true });
    await saveStageOutput({ lessonId: 'l', stage: 'quiz', output: 'v2', savedAt: 2, valid: true });

    expect(store.rows.size).toBe(1);
    expect((await getStageOutput('l', 'quiz'))?.output).toBe('v2');
  });

  it('returns null for a stage that was never saved', async () => {
    expect(await getStageOutput('missing', 'quiz')).toBeNull();
  });
});

describe('clearLessonHistory', () => {
  it('removes only that lesson rows', async () => {
    await saveStageOutput({ lessonId: 'a', stage: 'quiz', output: 'x', savedAt: 1, valid: true });
    await saveStageOutput({ lessonId: 'b', stage: 'quiz', output: 'y', savedAt: 1, valid: true });

    await clearLessonHistory('a');

    expect(await getCompletedStages('a')).toEqual([]);
    expect((await getCompletedStages('b'))[0].lessonId).toBe('b');
  });
});

describe('pruneHistory', () => {
  it('drops journals older than the cutoff', async () => {
    const old = Date.now() - 48 * 60 * 60 * 1000;
    await saveStageOutput({ lessonId: 'stale', stage: 'quiz', output: 'x', savedAt: old, valid: true });
    await saveStageOutput({
      lessonId: 'fresh',
      stage: 'quiz',
      output: 'y',
      savedAt: Date.now(),
      valid: true,
    });

    expect(await pruneHistory(24 * 60 * 60 * 1000)).toBe(1);
    expect(await getCompletedStages('stale')).toEqual([]);
    expect((await getCompletedStages('fresh')).length).toBe(1);
  });
});

describe('getInterruptedLessons', () => {
  it('groups unfinished journals by lesson', async () => {
    await saveStageOutput({ lessonId: 'a', stage: 'quiz', output: 'x', savedAt: 1, valid: true });
    await saveStageOutput({
      lessonId: 'a',
      stage: 'summary',
      output: 'y',
      savedAt: 2,
      valid: true,
    });
    await saveStageOutput({ lessonId: 'b', stage: 'quiz', output: 'z', savedAt: 3, valid: true });

    const grouped = await getInterruptedLessons();
    expect(grouped.get('a')?.length).toBe(2);
    expect(grouped.get('b')?.length).toBe(1);
  });
});

describe('degrades silently without a usable store', () => {
  it('never throws when IndexedDB rejects', async () => {
    store.failNext = true;

    await expect(
      saveStageOutput({ lessonId: 'l', stage: 'quiz', output: 'x', savedAt: 1, valid: true })
    ).resolves.toBe(false);
    await expect(getCompletedStages('l')).resolves.toEqual([]);
    await expect(getStageOutput('l', 'quiz')).resolves.toBeNull();
    await expect(clearLessonHistory('l')).resolves.toBeUndefined();
    await expect(pruneHistory()).resolves.toBe(0);
  });
});
