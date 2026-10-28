import { describe, it, expect } from 'vitest';
import { promptLibrary, getPromptsByContext } from './promptLibrary';

describe('promptLibrary', () => {
  it('all prompts have unique IDs', () => {
    const ids = promptLibrary.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all prompts have required fields', () => {
    promptLibrary.forEach(p => {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.template).toBeTruthy();
      expect(p.context).toBeTruthy();
    });
  });

  it('getPromptsByContext returns global + context prompts', () => {
    const result = getPromptsByContext('mutator');

    const globalPrompts = promptLibrary.filter(p => p.context === 'global');
    globalPrompts.forEach(gp => {
      expect(result).toContainEqual(gp);
    });

    const mutatorPrompts = promptLibrary.filter(p => p.context === 'mutator');
    mutatorPrompts.forEach(mp => {
      expect(result).toContainEqual(mp);
    });

    const sandboxPrompts = promptLibrary.filter(p => p.context === 'sandbox');
    sandboxPrompts.forEach(sp => {
      expect(result).not.toContainEqual(sp);
    });
  });

  it('getPromptsByContext with unknown context returns only global prompts', () => {
    const result = getPromptsByContext('unknown');
    const globalPrompts = promptLibrary.filter(p => p.context === 'global');

    expect(result.length).toBe(globalPrompts.length);
    globalPrompts.forEach(gp => {
      expect(result).toContainEqual(gp);
    });
  });
});
