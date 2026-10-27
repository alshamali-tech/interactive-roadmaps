import { describe, it, expect, beforeEach } from 'vitest';
import { useProgressStore } from './progress';

describe('Progress Store', () => {
  beforeEach(() => {
    useProgressStore.setState({ completedLessons: [] });
  });

  it('initial state has no completed lessons', () => {
    const { completedLessons } = useProgressStore.getState();
    expect(completedLessons).toEqual([]);
  });

  it('markComplete adds a lesson ID', () => {
    const { markComplete } = useProgressStore.getState();
    markComplete('lesson-1');
    const { completedLessons } = useProgressStore.getState();
    expect(completedLessons).toContain('lesson-1');
  });

  it('markComplete does not duplicate lesson IDs', () => {
    const { markComplete } = useProgressStore.getState();
    markComplete('lesson-1');
    markComplete('lesson-1');
    const { completedLessons } = useProgressStore.getState();
    expect(completedLessons).toHaveLength(1);
  });

  it('getLessonStatus returns available for lessons with no prerequisites', () => {
    const { getLessonStatus } = useProgressStore.getState();
    const lessons = [
      { id: 'lesson-1', title: 'Test', prerequisites: [], contentPath: '', metadata: {} as any, content: {} as any }
    ];
    expect(getLessonStatus('lesson-1', lessons)).toBe('available');
  });

  it('getLessonStatus returns locked when prerequisites are not met', () => {
    const { getLessonStatus } = useProgressStore.getState();
    const lessons = [
      { id: 'lesson-1', title: 'Test 1', prerequisites: [], contentPath: '', metadata: {} as any, content: {} as any },
      { id: 'lesson-2', title: 'Test 2', prerequisites: ['lesson-1'], contentPath: '', metadata: {} as any, content: {} as any }
    ];
    expect(getLessonStatus('lesson-2', lessons)).toBe('locked');
  });

  it('getLessonStatus returns available when all prerequisites are met', () => {
    const { markComplete, getLessonStatus } = useProgressStore.getState();
    const lessons = [
      { id: 'lesson-1', title: 'Test 1', prerequisites: [], contentPath: '', metadata: {} as any, content: {} as any },
      { id: 'lesson-2', title: 'Test 2', prerequisites: ['lesson-1'], contentPath: '', metadata: {} as any, content: {} as any }
    ];
    markComplete('lesson-1');
    expect(getLessonStatus('lesson-2', lessons)).toBe('available');
  });

  it('getLessonStatus returns completed for completed lessons', () => {
    const { markComplete, getLessonStatus } = useProgressStore.getState();
    const lessons = [
      { id: 'lesson-1', title: 'Test', prerequisites: [], contentPath: '', metadata: {} as any, content: {} as any }
    ];
    markComplete('lesson-1');
    expect(getLessonStatus('lesson-1', lessons)).toBe('completed');
  });
});
