import type { ChatMessage } from './aiService';

/**
 * Rough token estimate: 1 token ≈ 4 characters (English).
 *
 * This is NOT a precise tokenizer (tiktoken, cl100k_base, etc.) —
 * it's a cheap budget guard to prevent exceeding the context window
 * of small local models like llama3.2 (4K-8K tokens).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Builds a message array that fits within a token budget.
 *
 * Strategy (sliding window with marker):
 * - Always include the system prompt first (most important, contains lesson context)
 * - Fill from the NEWEST messages backwards (most relevant to current question)
 * - If older messages are dropped, prepend a marker message so the AI knows
 *   there was earlier context that was trimmed
 *
 * @param systemMessage  The system prompt (with lesson context)
 * @param messages       The user/assistant conversation messages
 * @param maxTokens      Total token budget (default 8000 — safe for llama3.2)
 */
export function buildContextWindow(
  systemMessage: ChatMessage,
  messages: ChatMessage[],
  maxTokens: number = 8000
): ChatMessage[] {
  const systemTokens = estimateTokens(systemMessage.content);
  let budget = Math.max(0, maxTokens - systemTokens);

  const kept: ChatMessage[] = [];

  // Walk from newest to oldest, keeping messages that fit.
  // Reserve ~20 tokens per message for role/overhead.
  const PER_MSG_OVERHEAD = 20;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content) + PER_MSG_OVERHEAD;
    if (msgTokens > budget) break;
    kept.unshift(msg);
    budget -= msgTokens;
  }

  const droppedCount = messages.length - kept.length;
  if (droppedCount > 0) {
    kept.unshift({
      role: 'system',
      content: `[Conversation trimmed: ${droppedCount} older message${
        droppedCount > 1 ? 's were' : ' was'
      } removed to fit the context window. Continue based on what remains below, and ask the user to restate important context if needed.]`,
    });
  }

  return [systemMessage, ...kept];
}
