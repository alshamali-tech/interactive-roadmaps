import type { AISettings } from './settings';
import { SYSTEM_PROMPT } from './prompts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function streamChatCompletion(
  messages: ChatMessage[],
  settings: AISettings,
  signal?: AbortSignal
): Promise<Response> {
  const payloadMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  let url: string;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (settings.provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers['Authorization'] = `Bearer ${settings.apiKey}`;
  } else if (settings.provider === 'groq') {
    url = 'https://api.groq.com/openai/v1/chat/completions';
    headers['Authorization'] = `Bearer ${settings.apiKey}`;
  } else if (settings.provider === 'ollama') {
    url = `${settings.baseUrl}/chat/completions`;
    headers['Authorization'] = 'Bearer ollama';
  } else {
    throw new Error(`Unsupported provider: ${settings.provider}`);
  }

  const body = JSON.stringify({
    model: settings.model,
    messages: payloadMessages,
    stream: true,
    temperature: 0.7,
  });

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
}
