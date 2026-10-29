import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT,
  buildLessonContext,
  extractSectionTitles,
  truncateAtSectionBoundary,
  buildLearningObjectives,
} from './prompts';

describe('SYSTEM_PROMPT', () => {
  it('is exported as a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains instructions about not giving direct answers', () => {
    expect(SYSTEM_PROMPT).toMatch(
      /NEVER give|never give|do not give|don't give/i
    );
  });

  it('contains Socratic tutoring guidance', () => {
    expect(SYSTEM_PROMPT).toMatch(/guide|hint|socratic|question/i);
  });

  it('mentions refusing to solve challenges directly', () => {
    expect(SYSTEM_PROMPT).toMatch(/refuse|MUST refuse/i);
  });
});

describe('extractSectionTitles', () => {
  it('returns H2 titles in order', () => {
    const md = `# Intro\nSome text.\n\n## Why Learn?\n\nContent.\n\n## How It Works\n\nMore.\n\n### Subsection`;
    expect(extractSectionTitles(md)).toEqual(['Why Learn?', 'How It Works']);
  });

  it('returns empty array when no H2s', () => {
    expect(extractSectionTitles('# Just a title\n\nParagraph.')).toEqual([]);
  });

  it('handles empty/undefined input', () => {
    expect(extractSectionTitles('')).toEqual([]);
  });
});

describe('truncateAtSectionBoundary', () => {
  it('returns content unchanged when under budget', () => {
    const md = '# Title\n\nShort content.';
    const { content, wasTruncated } = truncateAtSectionBoundary(md, 1000);
    expect(content).toBe(md);
    expect(wasTruncated).toBe(false);
  });

  it('cuts at section boundary, not mid-section', () => {
    const section1 = '\n\n## First Section\n\n' + 'a'.repeat(1200);
    const section2 = '\n\n## Second Section\n\n' + 'b'.repeat(1200);
    const md = '# Title' + section1 + section2;

    // Budget fits section1 but not section1+section2
    const { content, wasTruncated } = truncateAtSectionBoundary(md, 1500);
    expect(wasTruncated).toBe(true);
    expect(content).toContain('First Section');
    expect(content).not.toContain('Second Section');
    expect(content).toContain('[content truncated for context window]');
  });

  it('handles content with no H2s by treating as single section', () => {
    const md = 'x'.repeat(3000);
    const { content, wasTruncated } = truncateAtSectionBoundary(md, 2500);
    expect(wasTruncated).toBe(true);
    expect(content.length).toBeLessThan(3000);
    expect(content).toContain('[content truncated for context window]');
  });
});

describe('buildLearningObjectives', () => {
  it('uses description as first objective', () => {
    const result = buildLearningObjectives({
      title: 'T',
      description: 'Learn about X',
    });
    expect(result[0]).toBe('Learn about X');
  });

  it('includes H2 titles up to 6', () => {
    const sections = Array.from({ length: 8 }, (_, i) => `## Section ${i}`).join(
      '\n\n'
    );
    const result = buildLearningObjectives({ title: 'T', content: sections });
    // 6 sections + description? description is undefined so 6 total
    expect(result.length).toBeLessThanOrEqual(7);
    expect(result.some((o) => o.includes('Section 0'))).toBe(true);
    expect(result.some((o) => o.includes('Section 7'))).toBe(false);
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

  it('includes current section when provided', () => {
    const ctx = {
      title: 'Test Lesson',
      currentSection: 'How Programs Work',
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('How Programs Work');
    expect(result).toMatch(/currently viewing section/i);
  });

  it('includes learning objectives', () => {
    const ctx = {
      title: 'Test Lesson',
      description: 'Understand variables',
      content: '# Title\n\n## What Are Variables?\n\n## Scope',
    };

    const result = buildLessonContext(ctx);
    expect(result).toContain('Learning Objectives:');
    expect(result).toContain('Understand variables');
    expect(result).toContain('What Are Variables?');
    expect(result).toContain('Scope');
  });
});
