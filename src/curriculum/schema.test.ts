import { describe, it, expect } from 'vitest';
import type { Lesson, Module, Track } from './schema';

describe('Data Schema Validation', () => {
  it('valid Lesson object matches TypeScript interface', () => {
    const lesson: Lesson = {
      id: 'lesson-1',
      title: 'Introduction to Variables',
      prerequisites: [],
      contentPath: '/lessons/variables.md',
      metadata: {
        difficulty: 'beginner',
        estimatedMinutes: 15,
        tags: ['variables', 'basics'],
        version: '1.0.0'
      },
      content: {
        markdown: '# Variables\nLearn about variables',
        widgets: []
      }
    };

    expect(lesson.id).toBe('lesson-1');
    expect(lesson.metadata.difficulty).toBe('beginner');
    expect(lesson.content.markdown).toContain('Variables');
  });

  it('Lesson without required metadata fields fails validation', () => {
    // @ts-expect-error - This should fail because metadata.difficulty is required
    const invalidLesson: Lesson = {
      id: 'lesson-1',
      title: 'Test',
      prerequisites: [],
      contentPath: '',
      metadata: {
        estimatedMinutes: 10,
        tags: [],
        version: '1.0.0'
      },
      content: { markdown: '', widgets: [] }
    };

    // This test passes if TypeScript catches the error above
    expect(invalidLesson).toBeDefined();
  });

  it('valid Module contains an array of Lessons', () => {
    const module: Module = {
      id: 'module-1',
      title: 'Basics',
      description: 'Learn the basics',
      lessons: [
        {
          id: 'lesson-1',
          title: 'Lesson 1',
          prerequisites: [],
          contentPath: '',
          metadata: {
            difficulty: 'beginner',
            estimatedMinutes: 10,
            tags: [],
            version: '1.0.0'
          },
          content: { markdown: '', widgets: [] }
        }
      ]
    };

    expect(module.lessons).toHaveLength(1);
    expect(module.lessons[0].id).toBe('lesson-1');
  });

  it('valid Track contains an array of Modules', () => {
    const track: Track = {
      id: 'track-1',
      title: 'Software Engineering',
      description: 'Learn software engineering',
      modules: [
        {
          id: 'module-1',
          title: 'Module 1',
          description: 'First module',
          lessons: []
        }
      ]
    };

    expect(track.modules).toHaveLength(1);
    expect(track.modules[0].id).toBe('module-1');
  });
});
