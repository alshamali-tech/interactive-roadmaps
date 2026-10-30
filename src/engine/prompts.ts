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
5. Use simple language appropriate for the user's level (check the lesson difficulty).
6. You MUST NOT write code examples unless the user explicitly asks for code. Instead, describe concepts with analogies and ask the user to try implementing it themselves.
7. Structure responses as: 1 short paragraph of explanation → 1 Socratic question. Never exceed 150 words per response.`;

// ─── Section / Objective Helpers ───────────────────────────────────────────

/**
 * Extract H2 section titles from markdown.
 * These serve as implicit learning objectives and power current-section tracking.
 */
export function extractSectionTitles(markdown: string): string[] {
  if (!markdown) return [];
  const titles: string[] = [];
  for (const line of markdown.split('\n')) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) titles.push(match[1].trim());
  }
  return titles;
}

/**
 * Smart truncation: cuts at H2 section boundaries so we never cut mid-section.
 * Keeps as many complete sections as fit within maxChars.
 *
 * Returns the truncated content plus metadata for logging/testing.
 */
export function truncateAtSectionBoundary(
  markdown: string,
  maxChars: number = 2500
): { content: string; sectionsIncluded: number; wasTruncated: boolean } {
  if (!markdown) {
    return { content: '', sectionsIncluded: 0, wasTruncated: false };
  }
  if (markdown.length <= maxChars) {
    return {
      content: markdown,
      sectionsIncluded: (markdown.match(/^##\s+/gm) || []).length,
      wasTruncated: false,
    };
  }

  // Split into sections: each section starts with "## " or is the intro (before first H2)
  // Use a regex that matches the position BEFORE "## " (positive lookahead)
  const sectionPattern = /(?=\n##\s+)/g;
  const sections = markdown.split(sectionPattern).filter((s) => s.length > 0);

  let result = '';
  let included = 0;
  for (const section of sections) {
    if (result.length + section.length > maxChars) break;
    result += section;
    if (/^##\s+/.test(section.trimStart()) || (included === 0 && !result.includes('\n## '))) {
      included++;
    } else {
      included++;
    }
  }

  const wasTruncated = result.length < markdown.length;
  if (wasTruncated) {
    result += '\n\n... [content truncated for context window]';
  }

  return { content: result, sectionsIncluded: included, wasTruncated };
}

/**
 * Derive learning objectives from description + H2 section titles.
 * Gives the AI a clear "by the end of this lesson" framing.
 */
export function buildLearningObjectives(ctx: LessonContext): string[] {
  const objectives: string[] = [];
  if (ctx.description) objectives.push(ctx.description);
  if (ctx.content) {
    const titles = extractSectionTitles(ctx.content);
    // Cap at 6 to avoid bloat
    objectives.push(...titles.slice(0, 6));
  }
  return objectives;
}

// ─── Main Context Builder ──────────────────────────────────────────────────

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

  // Learning objectives derived from description + section titles
  const objectives = buildLearningObjectives(ctx);
  if (objectives.length > 0) {
    parts.push(`\nLearning Objectives:`);
    objectives.forEach((obj) => parts.push(`- ${obj}`));
  }

  // Current section the user is reading — critical for relevance
  if (ctx.currentSection) {
    parts.push(
      `\nUser is currently viewing section: "${ctx.currentSection}"`
    );
    parts.push(
      `Prioritize answering questions about this section specifically, and reference it by name when relevant.`
    );
  }

  if (ctx.content) {
    const { content } = truncateAtSectionBoundary(ctx.content, 2500);
    parts.push(`\nLesson Content:\n${content}`);
  }

  parts.push(
    '\nUse the above lesson context to provide relevant, specific guidance.'
  );
  parts.push(
    'Reference specific concepts, examples, or code from the lesson when giving hints.'
  );

  return parts.join('\n');
}
