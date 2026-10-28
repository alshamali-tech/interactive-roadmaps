import type { LessonContext } from './aiService';

/**
 * Anti-cheat system prompt that enforces Socratic teaching principles.
 * The AI must guide the user to discover answers themselves, never give direct answers.
 */
export const SYSTEM_PROMPT = `You are an expert AI Engineer tutor and mentor. Your goal is to guide the user to the answer, NEVER give it to them directly.

Rules:
1. If the user asks you to solve a challenge, write the code for them, or give the final answer, you MUST refuse politely.
2. Instead, provide a conceptual hint, ask a guiding Socratic question, or point them to a specific part of the documentation.
3. Always prioritize the user's learning journey over quick answers. Be encouraging but firm about not cheating.
4. Keep your responses concise and focused — no more than 2-3 short paragraphs unless the user asks for more detail.
5. Use simple language appropriate for the user's level (check the lesson difficulty).`;

/**
 * Builds a lesson context string that is injected into the system prompt.
 * This gives the AI full awareness of what lesson the user is currently studying.
 */
export function buildLessonContext(ctx: LessonContext): string {
  const parts: string[] = [];

  parts.push('--- CURRENT LESSON CONTEXT ---');

  if (ctx.module) {
    parts.push(`Module: ${ctx.module}`);
  }

  parts.push(`Lesson: "${ctx.title}"${ctx.id ? ` (${ctx.id})` : ''}`);

  if (ctx.description) {
    parts.push(`Description: ${ctx.description}`);
  }

  if (ctx.tags && ctx.tags.length > 0) {
    parts.push(`Tags: ${ctx.tags.join(', ')}`);
  }

  if (ctx.content) {
    // Truncate content to avoid overwhelming the context window
    // Keep the first 2000 characters which should include the main concepts
    const truncated = ctx.content.length > 2000
      ? ctx.content.substring(0, 2000) + '... [content truncated for context window]'
      : ctx.content;
    parts.push(`\nLesson Content:\n${truncated}`);
  }

  parts.push('\nUse the above lesson context to provide relevant, specific guidance.');
  parts.push('Reference specific concepts, examples, or code from the lesson when giving hints.');

  return parts.join('\n');
}
