/**
 * Progress Store — Zustand + localStorage persistence
 *
 * Tracks which lessons the user has completed and provides
 * a helper to determine whether a lesson is locked, available, or done.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { tracks } from '@/curriculum/graph';

export type LessonStatus = 'locked' | 'available' | 'completed';

interface ProgressState {
  /** IDs of lessons the user has marked as complete */
  completedLessons: string[];

  /** Mark a lesson as completed (no-op if already completed) */
  markComplete: (lessonId: string) => void;

  /** Remove a lesson from completed (useful for testing/reset) */
  markIncomplete: (lessonId: string) => void;

  /** Reset all progress */
  resetProgress: () => void;

  /**
   * Returns the status of a given lesson:
   * - 'completed' if already in completedLessons
   * - 'available' if all prerequisites are completed
   * - 'locked' if any prerequisite is incomplete
   */
  getLessonStatus: (lessonId: string) => LessonStatus;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      completedLessons: [],

      markComplete: (lessonId: string) =>
        set((state) => ({
          completedLessons: state.completedLessons.includes(lessonId)
            ? state.completedLessons
            : [...state.completedLessons, lessonId],
        })),

      markIncomplete: (lessonId: string) =>
        set((state) => ({
          completedLessons: state.completedLessons.filter((id) => id !== lessonId),
        })),

      resetProgress: () => set({ completedLessons: [] }),

      getLessonStatus: (lessonId: string): LessonStatus => {
        const { completedLessons } = get();

        // Already done?
        if (completedLessons.includes(lessonId)) return 'completed';

        // Find the lesson across all tracks
        for (const track of tracks) {
          for (const mod of track.modules) {
            for (const lesson of mod.lessons) {
              if (lesson.id === lessonId) {
                // No prerequisites → always available
                if (lesson.prerequisites.length === 0) return 'available';

                // All prerequisites must be completed
                const allPrereqsCompleted = lesson.prerequisites.every((prereq) =>
                  completedLessons.includes(prereq)
                );
                return allPrereqsCompleted ? 'available' : 'locked';
              }
            }
          }
        }

        // Lesson not found — treat as locked
        return 'locked';
      },
    }),
    {
      name: 'software-engineer-academy-progress',
    }
  )
);
