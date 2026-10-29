import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamChatCompletion, type ChatMessage } from './aiService';
import type { AISettings } from './settings';

const baseSettings: AISettings = {
  provider: 'openai',
  apiKey: 'sk-test-key',
  baseUrl: 'http://localhost:11434/v1',
  model: 'gpt-4o-mini',
};

describe('streamChatCompletion', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: vi.fn() }) },
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects system prompt at index 0', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    await streamChatCompletion(messages, baseSettings);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toMatch(/expert AI Engineer tutor/i);
  });

  it('routes to OpenAI endpoint with correct headers', async () => {
    await streamChatCompletion([{ role: 'user', content: 'hi' }], baseSettings);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.openai.com/v1/chat/completions');
    const headers = callArgs[1].headers;
    expect(headers['Authorization']).toBe('Bearer sk-test-key');
  });

  it('routes to Groq endpoint with correct headers', async () => {
    const groqSettings: AISettings = {
      ...baseSettings,
      provider: 'groq',
      apiKey: 'gsk_test',
      model: 'llama-3.1-8b-instant',
    };
    await streamChatCompletion([{ role: 'user', content: 'hi' }], groqSettings);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe(
      'https://api.groq.com/openai/v1/chat/completions'
    );
    expect(callArgs[1].headers['Authorization']).toBe('Bearer gsk_test');
  });

  it('routes to Ollama endpoint using baseUrl', async () => {
    const ollamaSettings: AISettings = {
      ...baseSettings,
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3',
    };
    await streamChatCompletion(
      [{ role: 'user', content: 'hi' }],
      ollamaSettings
    );

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('http://localhost:11434/v1/chat/completions');
    const headers = callArgs[1].headers;
    // Ollama should NOT receive an auth header when no apiKey is set
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('normalizes Ollama baseUrl trailing slashes', async () => {
    const ollamaSettings: AISettings = {
      ...baseSettings,
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1/',
      model: 'llama3',
    };
    await streamChatCompletion(
      [{ role: 'user', content: 'hi' }],
      ollamaSettings
    );

    const callArgs = mockFetch.mock.calls[0];
    // Should NOT produce ".../v1//chat/completions"
    expect(callArgs[0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('includes auth header for Ollama when apiKey is explicitly set', async () => {
    const ollamaSettings: AISettings = {
      ...baseSettings,
      provider: 'ollama',
      apiKey: 'ollama-secret',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3',
    };
    await streamChatCompletion(
      [{ role: 'user', content: 'hi' }],
      ollamaSettings
    );

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers['Authorization']).toBe('Bearer ollama-secret');
  });

  it('provides helpful error message on Ollama network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    );

    const ollamaSettings: AISettings = {
      ...baseSettings,
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3',
    };

    await expect(
      streamChatCompletion([{ role: 'user', content: 'hi' }], ollamaSettings)
    ).rejects.toThrow(/OLLAMA_ORIGINS/);
  });

  it('always sets stream to true in payload', async () => {
    await streamChatCompletion([{ role: 'user', content: 'hi' }], baseSettings);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.stream).toBe(true);
  });

  it('throws error on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })
    );

    await expect(
      streamChatCompletion([{ role: 'user', content: 'hi' }], baseSettings)
    ).rejects.toThrow(/401/);
  });

  it('throws error for unsupported provider', async () => {
    const badSettings: AISettings = {
      ...baseSettings,
      provider: 'none',
    };
    await expect(
      streamChatCompletion([{ role: 'user', content: 'hi' }], badSettings)
    ).rejects.toThrow(/No AI provider configured/);
  });

  it('includes lesson context in the system prompt', async () => {
    await streamChatCompletion(
      [{ role: 'user', content: 'hi' }],
      baseSettings,
      undefined,
      {
        title: 'Variables',
        module: 'Fundamentals',
        currentSection: 'Scope',
      }
    );

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    const systemContent: string = body.messages[0].content;
    expect(systemContent).toContain('Variables');
    expect(systemContent).toContain('Fundamentals');
    expect(systemContent).toContain('Scope');
  });

  it('applies token window (trims oldest messages when over budget)', async () => {
    // Build 5 large messages (~800 tokens each)
    const big = (s: string): ChatMessage => ({
      role: 'user',
      content: s.repeat(3200),
    });
    const messages: ChatMessage[] = [
      big('oldest-1'),
      big('oldest-2'),
      big('middle'),
      big('newer'),
      big('newest'),
    ];

    await streamChatCompletion(messages, baseSettings);
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    // The newest message MUST be included
    const includedContents = body.messages.map((m: ChatMessage) => m.content);
    expect(includedContents.some((c: string) => c.includes('newest'))).toBe(
      true
    );
    // At least one of the oldest should have been dropped
    const droppedAtLeastOne =
      !includedContents.some((c: string) => c.includes('oldest-1')) ||
      !includedContents.some((c: string) => c.includes('oldest-2'));
    expect(droppedAtLeastOne).toBe(true);
  });
});
