import { describe, it, expect } from 'vitest';
import {
  promptLibrary,
  getPromptsByContext,
  getLessonPrompts,
} from './promptLibrary';

describe('promptLibrary', () => {
  it('all prompts have unique IDs', () => {
    const ids = promptLibrary.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all prompts have required fields', () => {
    promptLibrary.forEach((p) => {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.template).toBeTruthy();
      expect(p.context).toBeTruthy();
    });
  });

  it('getPromptsByContext returns global + context prompts', () => {
    const result = getPromptsByContext('mutator');

    const globalPrompts = promptLibrary.filter((p) => p.context === 'global');
    globalPrompts.forEach((gp) => {
      expect(result).toContainEqual(gp);
    });

    const mutatorPrompts = promptLibrary.filter(
      (p) => p.context === 'mutator'
    );
    mutatorPrompts.forEach((mp) => {
      expect(result).toContainEqual(mp);
    });

    const sandboxPrompts = promptLibrary.filter(
      (p) => p.context === 'sandbox'
    );
    sandboxPrompts.forEach((sp) => {
      expect(result).not.toContainEqual(sp);
    });
  });

  it('getPromptsByContext with unknown context returns only global prompts', () => {
    const result = getPromptsByContext('unknown');
    const globalPrompts = promptLibrary.filter((p) => p.context === 'global');

    expect(result.length).toBe(globalPrompts.length);
    globalPrompts.forEach((gp) => {
      expect(result).toContainEqual(gp);
    });
  });
});

describe('getLessonPrompts', () => {
  it('returns base global prompts when no lesson info provided', () => {
    const result = getLessonPrompts({});
    const globalCount = promptLibrary.filter(
      (p) => p.context === 'global'
    ).length;
    expect(result.length).toBe(globalCount);
  });

  it('adds lesson-specific prompt when currentSection is provided', () => {
    const result = getLessonPrompts({
      currentSection: 'How Programs Work',
    });
    const sectionPrompt = result.find((p) => p.id === 'explain_section');
    expect(sectionPrompt).toBeDefined();
    expect(sectionPrompt!.template).toContain('How Programs Work');
    expect(sectionPrompt!.label).toContain('How Programs Work');
  });

  it('adds lesson summary prompt when lessonTitle is provided', () => {
    const result = getLessonPrompts({
      lessonTitle: 'Introduction to Programming',
    });
    const summaryPrompt = result.find((p) => p.id === 'lesson_summary');
    expect(summaryPrompt).toBeDefined();
    expect(summaryPrompt!.template).toContain('Introduction to Programming');
  });

  it('adds roadmap prompt when sectionTitles provided but no current section', () => {
    const result = getLessonPrompts({
      sectionTitles: ['Section A', 'Section B', 'Section C'],
    });
    const roadmap = result.find((p) => p.id === 'roadmap');
    expect(roadmap).toBeDefined();
  });

  it('does NOT add roadmap when currentSection is known', () => {
    const result = getLessonPrompts({
      currentSection: 'Section B',
      sectionTitles: ['Section A', 'Section B', 'Section C'],
    });
    const roadmap = result.find((p) => p.id === 'roadmap');
    expect(roadmap).toBeUndefined();
  });

  it('truncates long section titles in labels', () => {
    const longTitle = 'This Is A Very Long Section Title That Should Be Truncated';
    const result = getLessonPrompts({ currentSection: longTitle });
    const sectionPrompt = result.find((p) => p.id === 'explain_section');
    expect(sectionPrompt!.label.length).toBeLessThanOrEqual(35);
    expect(sectionPrompt!.label).toContain('…');
  });

  it('puts dynamic prompts before base prompts', () => {
    const result = getLessonPrompts({
      currentSection: 'Section',
      lessonTitle: 'Lesson',
    });
    // First prompts should be the dynamic ones (explain_section, lesson_summary)
    expect(result[0].id).toBe('explain_section');
    expect(result[1].id).toBe('lesson_summary');
  });
});
