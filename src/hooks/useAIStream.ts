import { useState, useRef, useCallback } from 'react';
import { streamChatCompletion, type ChatMessage, type LessonContext } from '../engine/aiService';
import { useSettingsStore } from '../engine/settings';

export interface UseAIStreamReturn {
  streamingText: string;
  isLoading: boolean;
  error: string | null;
  startStream: (messages: ChatMessage[], lessonContext?: LessonContext) => Promise<void>;
  abortStream: () => void;
}

/**
 * SSE Streaming Hook
 *
 * Parses Server-Sent Events from the AI provider and updates React state
 * token-by-token as they arrive.
 *
 * Features:
 * - Incremental streaming text updates
 * - Abort controller for cancellation
 * - Graceful error handling (network, CORS, abort)
 * - Integration with Zustand settings store
 */
export function useAIStream(): UseAIStreamReturn {
  const [streamingText, setStreamingText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startStream = useCallback(async (messages: ChatMessage[], lessonContext?: LessonContext) => {
    // Abort any existing stream
    abortStream();

    // Reset state
    setIsLoading(true);
    setError(null);
    setStreamingText('');

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      // Get current settings from store
      const settings = useSettingsStore.getState().aiSettings;

      // Call the AI service
      const response = await streamChatCompletion(
        messages,
        settings,
        abortControllerRef.current.signal,
        lessonContext
      );

      // Get the response body reader
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error('No reader available');
      }

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        // Process complete lines
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content || '';
              if (token) {
                setStreamingText(prev => prev + token);
              }
            } catch (e) {
              // Ignore JSON parse errors on partial chunks
            }
          }
        }
      }
    } catch (err: unknown) {
      // Handle abort errors silently
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled, no error to show
        return;
      }

      // Handle network errors with friendly message
      if (err instanceof Error) {
        const message = err.message;
        if (
          message.includes('Failed to fetch') ||
          message.includes('Network error') ||
          message.includes('CORS')
        ) {
          setError(
            'Cannot connect to AI. Check your settings or ensure Ollama is running with CORS enabled (OLLAMA_ORIGINS=* ollama serve).'
          );
        } else {
          setError(message);
        }
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  }, [abortStream]);

  return {
    streamingText,
    isLoading,
    error,
    startStream,
    abortStream,
  };
}
