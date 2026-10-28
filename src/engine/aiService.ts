import { SYSTEM_PROMPT, buildLessonContext } from './prompts';
import type { AISettings } from './settings';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LessonContext {
  title: string;
  description?: string;
  content?: string;
  module?: string;
  tags?: string[];
  id?: string;
}

/**
 * Unified AI Service Adapter
 *
 * Routes chat completions to the configured AI provider (OpenAI, Groq, or Ollama)
 * using the standard OpenAI-compatible payload format.
 *
 * Always injects the anti-cheat SYSTEM_PROMPT at index 0 and enables streaming.
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  settings: AISettings,
  signal?: AbortSignal,
  lessonContext?: LessonContext
): Promise<Response> {
  if (settings.provider === 'none') {
    throw new Error('No AI provider configured. Please go to Settings to connect an AI provider.');
  }

  // Build the full system prompt with lesson context
  let fullSystemPrompt = SYSTEM_PROMPT;
  if (lessonContext) {
    const contextInfo = buildLessonContext(lessonContext);
    fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${contextInfo}`;
  }

  // Inject system prompt at index 0
  const payloadMessages: ChatMessage[] = [
    { role: 'system', content: fullSystemPrompt },
    ...messages,
  ];

  // Determine endpoint and headers based on provider
  let url: string;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  switch (settings.provider) {
    case 'openai':
      url = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
      break;
    case 'groq':
      url = 'https://api.groq.com/openai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
      break;
    case 'ollama':
      // Normalize base URL: remove trailing slash to avoid double slashes
      const normalizedBaseUrl = settings.baseUrl.replace(/\/+$/, '');
      url = `${normalizedBaseUrl}/chat/completions`;
      // Ollama doesn't need auth, but we can optionally send a dummy header
      // Some Ollama setups might need this, so we allow it if apiKey is set
      if (settings.apiKey) {
        headers['Authorization'] = `Bearer ${settings.apiKey}`;
      }
      break;
    default:
      throw new Error(`Unsupported AI provider: ${settings.provider}`);
  }

  // Construct the payload
  const body = JSON.stringify({
    model: settings.model,
    messages: payloadMessages,
    stream: true, // ALWAYS stream
    temperature: 0.7,
  });

  // Execute the fetch
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Provider Error (${response.status}): ${errorText}`);
    }

    return response;
  } catch (error: unknown) {
    // Network errors (CORS, offline, Ollama not running) give unhelpful "Failed to fetch" messages
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error(
        `Network error connecting to ${settings.provider}. ` +
        `If using Ollama, make sure it's running with CORS enabled: ` +
        `$env:OLLAMA_ORIGINS="*"; ollama serve`
      );
    }
    throw error;
  }
}
