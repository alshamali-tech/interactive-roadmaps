import { describe, it, expect } from 'vitest';
import { countTokens } from './tokenCounter';

describe('countTokens', () => {
  it('returns 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(countTokens('   ')).toBe(0);
  });

  it('counts single word as 1 token', () => {
    expect(countTokens('hello')).toBe(1);
  });

  it('counts multiple short words', () => {
    expect(countTokens('the cat sat')).toBe(3);
  });

  it('splits long words into ~4 character chunks', () => {
    // "extraordinary" = 13 chars → ceil(13/4) = 4 tokens
    expect(countTokens('extraordinary')).toBe(4);
  });

  it('splits on common punctuation', () => {
    // "hello, world!" → "hello" + "," + "world" + "!" = 4 tokens
    expect(countTokens('hello, world!')).toBe(4);
  });

  it('handles code-like input', () => {
    // "function add(a, b)" should tokenize into multiple parts
    const tokens = countTokens('function add(a, b)');
    expect(tokens).toBeGreaterThan(3);
  });

  it('handles JSON-like input', () => {
    const tokens = countTokens('{"name": "test", "value": 42}');
    expect(tokens).toBeGreaterThan(5);
  });

  it('handles multiline input', () => {
    const tokens = countTokens('line one\nline two\nline three');
    expect(tokens).toBe(6);
  });
});
