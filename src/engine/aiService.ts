import { SYSTEM_PROMPT, buildLessonContext } from './prompts';
import { buildContextWindow } from './contextManager';
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
  /**
   * The H2 section title the user is currently viewing (tracked via
   * IntersectionObserver on the lesson page). Makes AI responses
   * much more relevant to what the user is reading right now.
   */
  currentSection?: string;
}

// ───────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────

function getEndpointAndHeaders(
  settings: AISettings
): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  switch (settings.provider) {
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { ...headers, Authorization: `Bearer ${settings.apiKey}` },
      };
    case 'groq':
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: { ...headers, Authorization: `Bearer ${settings.apiKey}` },
      };
    case 'ollama': {
      const normalizedBaseUrl = settings.baseUrl.replace(/\/+$/, '');
      if (settings.apiKey) {
        headers['Authorization'] = `Bearer ${settings.apiKey}`;
      }
      return { url: `${normalizedBaseUrl}/chat/completions`, headers };
    }
    case 'none':
    default:
      throw new Error(
        'No AI provider configured. Please go to Settings to connect an AI provider.'
      );
  }
}

function wrapNetworkError(error: unknown, provider: string): unknown {
  if (
    error instanceof TypeError &&
    error.message.includes('Failed to fetch')
  ) {
    return new Error(
      `Network error connecting to ${provider}. ` +
        `If using Ollama, make sure it's running with CORS enabled: ` +
        `$env:OLLAMA_ORIGINS="*"; ollama serve`
    );
  }
  return error;
}

// ───────────────────────────────────────────────────────────────
// Streaming chat completion (for lesson chat UI)
// ───────────────────────────────────────────────────────────────

export async function streamChatCompletion(
  messages: ChatMessage[],
  settings: AISettings,
  signal?: AbortSignal,
  lessonContext?: LessonContext
): Promise<Response> {
  let fullSystemPrompt = SYSTEM_PROMPT;
  if (lessonContext) {
    fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${buildLessonContext(lessonContext)}`;
  }

  const systemMessage: ChatMessage = {
    role: 'system',
    content: fullSystemPrompt,
  };

  const payloadMessages = buildContextWindow(systemMessage, messages);
  const { url, headers } = getEndpointAndHeaders(settings);

  const body = JSON.stringify({
    model: settings.model,
    messages: payloadMessages,
    stream: true,
    temperature: 0.7,
  });

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
  } catch (error) {
    throw wrapNetworkError(error, settings.provider);
  }
}

// ───────────────────────────────────────────────────────────────
// Non-streaming chat completion (for lesson chat UI — full response)
// ───────────────────────────────────────────────────────────────

export async function generateChatCompletion(
  messages: ChatMessage[],
  settings: AISettings,
  lessonContext?: LessonContext
): Promise<string> {
  let fullSystemPrompt = SYSTEM_PROMPT;
  if (lessonContext) {
    fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${buildLessonContext(lessonContext)}`;
  }

  const systemMessage: ChatMessage = {
    role: 'system',
    content: fullSystemPrompt,
  };

  const payloadMessages = buildContextWindow(systemMessage, messages);
  const { url, headers } = getEndpointAndHeaders(settings);

  const body = JSON.stringify({
    model: settings.model,
    messages: payloadMessages,
    stream: false,
    temperature: 0.7,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Provider Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    throw wrapNetworkError(error, settings.provider);
  }
}

// ───────────────────────────────────────────────────────────────
// Raw completion (for course generation)
// Sends a custom system prompt + user prompt WITHOUT injecting
// the anti-cheat SYSTEM_PROMPT. Used by the course generator
// where we need full control over the system prompt.
// ───────────────────────────────────────────────────────────────

export async function generateRawCompletion(
  systemPrompt: string,
  userPrompt: string,
  settings: AISettings,
  options: { temperature?: number; signal?: AbortSignal; maxTokens?: number } = {}
): Promise<string> {
  const { temperature = 0.3, signal, maxTokens } = options;

  const { url, headers } = getEndpointAndHeaders(settings);

  const body: Record<string, unknown> = {
    model: settings.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    temperature,
  };

  if (maxTokens) body.max_tokens = maxTokens;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Provider Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('AI response did not contain text content.');
    }
    return content;
  } catch (error) {
    throw wrapNetworkError(error, settings.provider);
  }
}
