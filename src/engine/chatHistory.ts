/**
 * Conversation Persistence Layer
 *
 * Stores chat history per-lesson in localStorage so the user's
 * conversation with the AI Tutor survives page refresh and
 * navigation between lessons.
 *
 * Key scheme: `sea-chat-{lessonId}`
 * Cap: 50 messages per lesson to prevent unbounded growth.
 */

const STORAGE_KEY_PREFIX = 'sea-chat-';
const MAX_STORED_MESSAGES = 50;

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Load conversation history for a lesson.
 * Returns empty array on any failure (corrupt data, unavailable storage).
 */
export function loadConversation(lessonId: string): StoredMessage[] {
  if (!lessonId) return [];
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${lessonId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Defensive shape-check — reject malformed entries
    return parsed.filter(isValidStoredMessage);
  } catch {
    return [];
  }
}

/**
 * Save conversation history. Caps at MAX_STORED_MESSAGES (keeps newest).
 * Silently fails on quota exceeded or unavailable storage.
 */
export function saveConversation(
  lessonId: string,
  messages: StoredMessage[]
): void {
  if (!lessonId) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const capped = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${lessonId}`,
      JSON.stringify(capped)
    );
  } catch {
    // quota exceeded or storage unavailable — silently fail
  }
}

/**
 * Clear conversation history for a lesson.
 */
export function clearConversation(lessonId: string): void {
  if (!lessonId) return;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${lessonId}`);
  } catch {
    // ignore
  }
}

function isValidStoredMessage(m: unknown): m is StoredMessage {
  if (typeof m !== 'object' || m === null) return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    (obj.role === 'user' || obj.role === 'assistant') &&
    typeof obj.content === 'string' &&
    typeof obj.timestamp === 'number'
  );
}
