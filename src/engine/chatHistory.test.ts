import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadConversation,
  saveConversation,
  clearConversation,
  type StoredMessage,
} from './chatHistory';

describe('chatHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const msg = (overrides: Partial<StoredMessage> = {}): StoredMessage => ({
    id: 'msg-1',
    role: 'user',
    content: 'Hello',
    timestamp: Date.now(),
    ...overrides,
  });

  describe('saveConversation / loadConversation', () => {
    it('round-trips a conversation for a lesson', () => {
      const messages: StoredMessage[] = [
        msg({ id: '1', role: 'user', content: 'Help me' }),
        msg({ id: '2', role: 'assistant', content: 'Sure!' }),
      ];
      saveConversation('lesson-1', messages);
      const loaded = loadConversation('lesson-1');
      expect(loaded).toHaveLength(2);
      expect(loaded[0].content).toBe('Help me');
      expect(loaded[1].content).toBe('Sure!');
    });

    it('returns empty array for unknown lesson', () => {
      expect(loadConversation('nonexistent')).toEqual([]);
    });

    it('caps stored messages at 50', () => {
      const many: StoredMessage[] = Array.from({ length: 100 }, (_, i) =>
        msg({ id: `m-${i}`, content: `msg ${i}` })
      );
      saveConversation('lesson-cap', many);
      const loaded = loadConversation('lesson-cap');
      expect(loaded.length).toBe(50);
      // Keeps the newest 50
      expect(loaded[0].id).toBe('m-50');
      expect(loaded[49].id).toBe('m-99');
    });

    it('isolates conversations per lesson', () => {
      saveConversation('a', [msg({ content: 'A' })]);
      saveConversation('b', [msg({ content: 'B' })]);
      expect(loadConversation('a')[0].content).toBe('A');
      expect(loadConversation('b')[0].content).toBe('B');
    });
  });

  describe('clearConversation', () => {
    it('removes stored conversation', () => {
      saveConversation('lesson-x', [msg()]);
      expect(loadConversation('lesson-x')).toHaveLength(1);
      clearConversation('lesson-x');
      expect(loadConversation('lesson-x')).toEqual([]);
    });

    it('does not throw for unknown lesson', () => {
      expect(() => clearConversation('nope')).not.toThrow();
    });
  });

  describe('robustness', () => {
    it('returns [] when localStorage has corrupt JSON', () => {
      localStorage.setItem('sea-chat-broken', 'not-json{{{');
      expect(loadConversation('broken')).toEqual([]);
    });

    it('filters out malformed entries', () => {
      localStorage.setItem(
        'sea-chat-mixed',
        JSON.stringify([
          msg({ id: 'good', content: 'hello' }),
          { garbage: true },
          null,
          'string-entry',
          msg({ id: 'good2', role: 'assistant', content: 'hi' }),
        ])
      );
      const loaded = loadConversation('mixed');
      expect(loaded).toHaveLength(2);
      expect(loaded.map((m) => m.id)).toEqual(['good', 'good2']);
    });

    it('ignores messages with invalid roles', () => {
      localStorage.setItem(
        'sea-chat-badrole',
        JSON.stringify([
          { id: '1', role: 'system', content: 'x', timestamp: 1 },
          msg({ id: '2', role: 'user', content: 'ok' }),
        ])
      );
      const loaded = loadConversation('badrole');
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('2');
    });

    it('handles missing lessonId gracefully', () => {
      expect(loadConversation('')).toEqual([]);
      expect(() => saveConversation('', [msg()])).not.toThrow();
      expect(() => clearConversation('')).not.toThrow();
    });
  });
});
