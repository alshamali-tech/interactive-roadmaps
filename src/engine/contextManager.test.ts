import { describe, it, expect } from 'vitest';
import { estimateTokens, buildContextWindow } from './contextManager';
import type { ChatMessage } from './aiService';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('roughly approximates 1 token per 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('x'.repeat(100))).toBe(25);
  });
});

describe('buildContextWindow', () => {
  const system: ChatMessage = { role: 'system', content: 'SYSTEM' };

  it('always keeps system message first', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const result = buildContextWindow(system, msgs, 8000);
    expect(result[0]).toBe(system);
    expect(result.length).toBe(3);
  });

  it('keeps all messages when under budget', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'answer' },
    ];
    const result = buildContextWindow(system, msgs, 8000);
    expect(result.length).toBe(3);
    expect(result[1].content).toBe('question');
    expect(result[2].content).toBe('answer');
  });

  it('prefers newest messages when over budget', () => {
    // Each message ~1000 chars = ~250 tokens
    // System = 6 chars = 2 tokens. Budget = 550 tokens.
    // Should fit 2 messages (500 tokens + overhead), dropping the oldest.
    const big = (s: string) => ({ role: 'user' as const, content: s.repeat(1000) });
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'oldest' },
      big('A'),
      big('B'),
    ];

    const result = buildContextWindow(system, msgs, 550);
    // System first
    expect(result[0]).toBe(system);
    // The 'oldest' message should have been dropped in favor of A, B
    const contents = result.map((m) => m.content);
    expect(contents).not.toContain('oldest');
    expect(contents.some((c) => c.includes('A'))).toBe(true);
    expect(contents.some((c) => c.includes('B'))).toBe(true);
  });

  it('prepends a marker when messages are dropped', () => {
    // Budget = 700. System = 2 tokens. Remaining = 698.
    // We need the "keep" message to be ~695 tokens, leaving < 20 for the next message's overhead.
    // 675 repeats of a 4-char string = 2700 chars = 675 tokens + 20 overhead = 695 tokens.
    // Remaining budget = 3. Next message overhead = 20. 20 > 3, so it breaks!
    const big = (s: string) => ({ role: 'user' as const, content: s.repeat(675) });
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'will be dropped' },
      big('keep'),
    ];
    const result = buildContextWindow(system, msgs, 700);
    // Should have: system, marker, big message
    expect(result[0]).toBe(system);
    const marker = result.find((m) => m.content.includes('Conversation trimmed'));
    expect(marker).toBeDefined();
    expect(marker!.role).toBe('system');
    expect(marker!.content).toMatch(/1 older message was/);
  });

  it('uses plural form when multiple messages dropped', () => {
    // Same logic: "keep" message takes almost all budget, forcing 2 drops.
    const big = (s: string) => ({ role: 'user' as const, content: s.repeat(675) });
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'drop1' },
      { role: 'user', content: 'drop2' },
      big('keep'),
    ];
    const result = buildContextWindow(system, msgs, 700);
    const marker = result.find((m) => m.content.includes('Conversation trimmed'));
    expect(marker).toBeDefined();
    expect(marker!.content).toMatch(/2 older messages were/);
  });

  it('handles empty conversation', () => {
    const result = buildContextWindow(system, [], 8000);
    expect(result).toEqual([system]);
  });
});
