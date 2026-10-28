import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamChatCompletion, type ChatMessage } from './aiService';
import type { AISettings } from './settings';
import { SYSTEM_PROMPT } from './prompts';

describe('streamChatCompletion', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  const baseSettings: AISettings = {
    provider: 'openai',
    apiKey: 'sk-test-key',
    baseUrl: 'http://localhost:11434/v1',
    model: 'gpt-4o-mini',
  };

  const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

  it('injects system prompt at index 0', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await streamChatCompletion(messages, baseSettings);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('Hello');
  });

  it('routes to OpenAI endpoint with correct headers', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await streamChatCompletion(messages, { ...baseSettings, provider: 'openai' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('routes to Groq endpoint with correct headers', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await streamChatCompletion(messages, { ...baseSettings, provider: 'groq' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
        }),
      })
    );
  });

  it('routes to Ollama endpoint using baseUrl', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await streamChatCompletion(messages, { ...baseSettings, provider: 'ollama' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ollama',
        }),
      })
    );
  });

  it('always sets stream to true in payload', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await streamChatCompletion(messages, baseSettings);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.temperature).toBe(0.7);
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('throws error on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Invalid API key'),
    });

    await expect(streamChatCompletion(messages, baseSettings)).rejects.toThrow(
      /AI Provider Error \(401\): Invalid API key/
    );
  });

  it('throws error for unsupported provider', async () => {
    await expect(
      streamChatCompletion(messages, { ...baseSettings, provider: 'none' })
    ).rejects.toThrow(/Unsupported provider/);
  });
});
