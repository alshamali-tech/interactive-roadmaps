import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from './prompts';

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
