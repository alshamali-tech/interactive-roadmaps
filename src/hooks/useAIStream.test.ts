import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAIStream } from './useAIStream';
import { useSettingsStore } from '../engine/settings';
import * as aiService from '../engine/aiService';

vi.mock('../engine/aiService', () => ({
  streamChatCompletion: vi.fn(),
}));

describe('useAIStream', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      aiSettings: {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'http://localhost:11434/v1',
        model: 'gpt-4o-mini',
      },
      isAIConnected: true,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useAIStream());
    expect(result.current.streamingText).toBe('');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.startStream).toBe('function');
    expect(typeof result.current.abortStream).toBe('function');
  });

  it('streams text incrementally as tokens arrive', async () => {
    // Create a mock readable stream
    const chunks = [
      new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
      new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n'),
      new TextEncoder().encode('data: {"choices":[{"delta":{"content":"!"}}]}\n\n'),
      new TextEncoder().encode('data: [DONE]\n\n'),
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.mocked(aiService.streamChatCompletion).mockResolvedValue({
      body: { getReader: () => mockReader },
    } as Response);

    const { result } = renderHook(() => useAIStream());

    await act(async () => {
      result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    await waitFor(() => {
      expect(result.current.streamingText).toBe('Hello world!');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading to true while streaming', async () => {
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ done: true, value: undefined }), 100);
        });
      }),
    };

    vi.mocked(aiService.streamChatCompletion).mockResolvedValue({
      body: { getReader: () => mockReader },
    } as Response);

    const { result } = renderHook(() => useAIStream());

    let streamPromise: Promise<void>;
    act(() => {
      streamPromise = result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    // During streaming
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await streamPromise;
    });

    // After streaming completes
    expect(result.current.isLoading).toBe(false);
  });

  it('handles network errors gracefully', async () => {
    vi.mocked(aiService.streamChatCompletion).mockRejectedValue(
      new TypeError('Failed to fetch')
    );

    const { result } = renderHook(() => useAIStream());

    await act(async () => {
      await result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toContain('Cannot connect to AI');
    expect(result.current.streamingText).toBe('');
  });

  it('handles CORS errors with friendly message', async () => {
    vi.mocked(aiService.streamChatCompletion).mockRejectedValue(
      new Error('CORS error')
    );

    const { result } = renderHook(() => useAIStream());

    await act(async () => {
      await result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    expect(result.current.error).toContain('Cannot connect to AI');
  });

  it('handles abort errors silently', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    vi.mocked(aiService.streamChatCompletion).mockRejectedValue(abortError);

    const { result } = renderHook(() => useAIStream());

    await act(async () => {
      await result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles generic errors with error message', async () => {
    vi.mocked(aiService.streamChatCompletion).mockRejectedValue(
      new Error('Invalid API key')
    );

    const { result } = renderHook(() => useAIStream());

    await act(async () => {
      await result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    expect(result.current.error).toBe('Invalid API key');
  });

  it('can abort stream mid-generation', async () => {
    const chunks = [
      new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
    ];

    let chunkIndex = 0;
    let abortCalled = false;

    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
        }
        // Simulate slow response that can be aborted
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve({ done: true, value: undefined });
          }, 1000);

          // Check for abort periodically
          const checkAbort = setInterval(() => {
            if (abortCalled) {
              clearTimeout(timeout);
              clearInterval(checkAbort);
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            }
          }, 50);
        });
      }),
    };

    vi.mocked(aiService.streamChatCompletion).mockImplementation(
      (_messages, _settings, signal) => {
        if (signal) {
          signal.addEventListener('abort', () => {
            abortCalled = true;
          });
        }
        return Promise.resolve({
          body: { getReader: () => mockReader },
        } as Response);
      }
    );

    const { result } = renderHook(() => useAIStream());

    let streamPromise: Promise<void>;
    act(() => {
      streamPromise = result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    // Wait a bit then abort
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      result.current.abortStream();
    });

    await act(async () => {
      await streamPromise;
    });

    expect(result.current.streamingText).toBe('Hello');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('resets state when starting a new stream', async () => {
    // First stream with error
    vi.mocked(aiService.streamChatCompletion).mockRejectedValueOnce(
      new Error('First error')
    );

    const { result } = renderHook(() => useAIStream());

    await act(async () => {
      await result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    expect(result.current.error).toBe('First error');

    // Second stream succeeds
    const mockReader = {
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    };

    vi.mocked(aiService.streamChatCompletion).mockResolvedValueOnce({
      body: { getReader: () => mockReader },
    } as Response);

    await act(async () => {
      await result.current.startStream([{ role: 'user', content: 'Hi again' }]);
    });

    expect(result.current.error).toBeNull();
  });

  it('handles no reader available error', async () => {
    vi.mocked(aiService.streamChatCompletion).mockResolvedValue({
      body: null,
    } as Response);

    const { result } = renderHook(() => useAIStream());

    await act(async () => {
      await result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    expect(result.current.error).toBe('No reader available');
  });

  it('ignores malformed JSON in stream chunks', async () => {
    const chunks = [
      new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Good"}}]}\n\n'),
      new TextEncoder().encode('data: {malformed json}\n\n'),
      new TextEncoder().encode('data: {"choices":[{"delta":{"content":" data"}}]}\n\n'),
      new TextEncoder().encode('data: [DONE]\n\n'),
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.mocked(aiService.streamChatCompletion).mockResolvedValue({
      body: { getReader: () => mockReader },
    } as Response);

    const { result } = renderHook(() => useAIStream());

    await act(async () => {
      await result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    expect(result.current.streamingText).toBe('Good data');
    expect(result.current.error).toBeNull();
  });

  it('handles buffered incomplete lines', async () => {
    const chunks = [
      new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Part1"}'),
      new TextEncoder().encode('}]}\n\ndata: {"choices":[{"delta":{"content":"Part2"}}]}\n\n'),
      new TextEncoder().encode('data: [DONE]\n\n'),
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < chunks.length) {
          return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.mocked(aiService.streamChatCompletion).mockResolvedValue({
      body: { getReader: () => mockReader },
    } as Response);

    const { result } = renderHook(() => useAIStream());

    await act(async () => {
      await result.current.startStream([{ role: 'user', content: 'Hi' }]);
    });

    expect(result.current.streamingText).toBe('Part1Part2');
  });
});
