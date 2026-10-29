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
    // lesson-1 is in the actual curriculum graph with no prerequisites
    expect(getLessonStatus('lesson-1')).toBe('available');
  });

  it('getLessonStatus returns locked when prerequisites are not met', () => {
    const { getLessonStatus } = useProgressStore.getState();
    // lesson-2 depends on lesson-1 in the curriculum graph
    expect(getLessonStatus('lesson-2')).toBe('locked');
  });

  it('getLessonStatus returns available when all prerequisites are met', () => {
    const { markComplete, getLessonStatus } = useProgressStore.getState();
    markComplete('lesson-1');
    expect(getLessonStatus('lesson-2')).toBe('available');
  });

  it('getLessonStatus returns completed for completed lessons', () => {
    const { markComplete, getLessonStatus } = useProgressStore.getState();
    markComplete('lesson-1');
    expect(getLessonStatus('lesson-1')).toBe('completed');
  });
});
