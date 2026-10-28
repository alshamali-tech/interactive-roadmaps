import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildLessonContext } from './prompts';

describe('SYSTEM_PROMPT', () => {
  it('is exported as a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains instructions about not giving direct answers', () => {
    expect(SYSTEM_PROMPT).toMatch(/NEVER give|never give|do not give|don't give/i);
  });

  it('contains Socratic tutoring guidance', () => {
    expect(SYSTEM_PROMPT).toMatch(/guide|hint|socratic|question/i);
  });

  it('mentions refusing to solve challenges directly', () => {
    expect(SYSTEM_PROMPT).toMatch(/refuse|MUST refuse/i);
  });
});

describe('buildLessonContext', () => {
  it('includes lesson title in context', () => {
    const ctx = {
      title: 'Variables and Data Types',
      description: 'Learn about variables',
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('Variables and Data Types');
    expect(result).toContain('CURRENT LESSON CONTEXT');
  });

  it('includes module name when provided', () => {
    const ctx = {
      title: 'Test Lesson',
      module: 'Programming Fundamentals',
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('Module: Programming Fundamentals');
  });

  it('includes description when provided', () => {
    const ctx = {
      title: 'Test Lesson',
      description: 'This is a test description',
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('This is a test description');
  });

  it('includes tags when provided', () => {
    const ctx = {
      title: 'Test Lesson',
      tags: ['variables', 'types', 'basics'],
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('variables');
    expect(result).toContain('types');
    expect(result).toContain('basics');
  });

  it('includes lesson content when provided', () => {
    const ctx = {
      title: 'Test Lesson',
      content: 'This is the lesson markdown content',
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('Lesson Content:');
    expect(result).toContain('This is the lesson markdown content');
  });

  it('truncates long content to avoid overwhelming context window', () => {
    const longContent = 'x'.repeat(3000);
    const ctx = {
      title: 'Test Lesson',
      content: longContent,
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('[content truncated for context window]');
    expect(result.length).toBeLessThan(3000);
  });

  it('includes lesson ID when provided', () => {
    const ctx = {
      title: 'Test Lesson',
      id: 'lesson-123',
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('lesson-123');
  });

  it('handles minimal context with only title', () => {
    const ctx = {
      title: 'Minimal Lesson',
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('Minimal Lesson');
    expect(result).toContain('CURRENT LESSON CONTEXT');
  });
});
