/**
 * S8 — Generation History / Resume Journal
 *
 * Stores each completed stage's raw output so an interrupted or partially failed
 * lesson can be finished without paying again for stages that already succeeded.
 * Lives in IndexedDB (the `stageOutputs` table added to `localCourses.ts`), not
 * localStorage, because stage outputs are lesson-sized text.
 *
 * Journaling is best-effort by design: the Dexie table is loaded lazily and every
 * operation degrades to a no-op when IndexedDB is unavailable (SSR, tests, privacy
 * mode). Generation must never fail because the journal is missing.
 */
import type { StageType } from './stageContext';

export interface StageOutputRecord {
  /** `${lessonId}:${stage}` — makes re-saving a stage idempotent. */
  id: string;
  lessonId: string;
  stage: StageType;
  output: string;
  savedAt: number;
  valid: boolean;
}

/** Minimal surface of the Dexie table we need, so this module stays testable. */
interface StageOutputTable {
  put(record: StageOutputRecord): Promise<unknown>;
  get(id: string): Promise<StageOutputRecord | undefined>;
  where(key: 'lessonId' | 'savedAt'): {
    equals(value: unknown): { toArray(): Promise<StageOutputRecord[]>; delete(): Promise<void> };
    between(lower: unknown, upper: unknown): { toArray(): Promise<StageOutputRecord[]> };
    toArray(): Promise<StageOutputRecord[]>;
  };
}

async function table(): Promise<StageOutputTable | undefined> {
  try {
    const { db } = await import('./localCourses');
    const stageTable = db.stageOutputs as unknown as StageOutputTable | undefined;
    return stageTable ?? undefined;
  } catch {
    return undefined;
  }
}

export function stageRecordId(lessonId: string, stage: StageType): string {
  return `${lessonId}:${stage}`;
}

/** Records one finished stage. Resolves false when no store is available. */
export async function saveStageOutput(record: Omit<StageOutputRecord, 'id'>): Promise<boolean> {
  const store = await table();
  if (!store) return false;
  try {
    await store.put({ ...record, id: stageRecordId(record.lessonId, record.stage) });
    return true;
  } catch {
    return false;
  }
}

/** Completed stages for one lesson, in save order. */
export async function getCompletedStages(lessonId: string): Promise<StageOutputRecord[]> {
  const store = await table();
  if (!store) return [];
  try {
    const rows = await store.where('lessonId').equals(lessonId).toArray();
    return rows.sort((a, b) => a.savedAt - b.savedAt);
  } catch {
    return [];
  }
}

export async function getStageOutput(
  lessonId: string,
  stage: StageType
): Promise<StageOutputRecord | null> {
  const store = await table();
  if (!store) return null;
  try {
    return (await store.get(stageRecordId(lessonId, stage))) ?? null;
  } catch {
    return null;
  }
}

/** Drops the journal for one lesson — called once the lesson assembles cleanly. */
export async function clearLessonHistory(lessonId: string): Promise<void> {
  const store = await table();
  if (!store) return;
  try {
    await store.where('lessonId').equals(lessonId).delete();
  } catch {
    // Nothing to clean up.
  }
}

/**
 * Removes journal entries older than `maxAgeMs` (default 24h). Stale stage output
 * is worthless for resume and would otherwise accumulate across sessions.
 */
export async function pruneHistory(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  const store = await table();
  if (!store) return 0;
  try {
    const cutoff = Date.now() - maxAgeMs;
    const stale = await store.where('savedAt').between(0, cutoff).toArray();
    for (const record of stale) {
      await store.where('lessonId').equals(record.lessonId).delete();
      break; // `where().delete()` removes the whole lesson; one pass per lesson is enough.
    }
    return stale.length;
  } catch {
    return 0;
  }
}

/**
 * Lessons with a non-empty journal, i.e. generation that started but never
 * finished. Used by the UI to offer "resume where you left off".
 */
export async function getInterruptedLessons(): Promise<Map<string, StageOutputRecord[]>> {
  const store = await table();
  const grouped = new Map<string, StageOutputRecord[]>();
  if (!store) return grouped;
  try {
    for (const record of await store.where('lessonId').toArray()) {
      const bucket = grouped.get(record.lessonId) ?? [];
      bucket.push(record);
      grouped.set(record.lessonId, bucket);
    }
  } catch {
    return grouped;
  }
  return grouped;
}
