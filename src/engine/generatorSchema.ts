import { z } from 'zod';

// ───────────────────────────────────────────────────────────────
// Widget schema (shared across all stages)
// ───────────────────────────────────────────────────────────────

export const WidgetConfigSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('sandbox'),
    props: z.object({
      inputType: z.enum(['text', 'code']),
      outputType: z.enum(['text', 'html']),
      initialState: z.string(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('mutator'),
    props: z.object({
      language: z.enum(['python', 'javascript', 'typescript', 'sql']),
      brokenCode: z.string(),
      hint: z.string(),
      testCases: z.array(z.string()).default([]),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('trade_off'),
    props: z.object({
      scenario: z.string(),
      options: z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        metrics: z.object({
          cost: z.number().min(1).max(10),
          performance: z.number().min(1).max(10),
          complexity: z.number().min(1).max(10),
        }),
      })).min(2).max(4),
    }),
  }),
]);

export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;

// ───────────────────────────────────────────────────────────────
// Stage 1: Plan schema (lightweight blueprint)
// ───────────────────────────────────────────────────────────────

export const LessonPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  keyPoints: z.array(z.string()).min(1).max(5),
  widgetSuggestions: z.array(z.object({
    type: z.enum(['sandbox', 'mutator', 'trade_off']),
    purpose: z.string(),
  })).default([]),
});

export const CoursePlanSchema = z.object({
  title: z.string(),
  description: z.string(),
  lessons: z.array(LessonPlanSchema).min(1).max(10),
});

export type CoursePlan = z.infer<typeof CoursePlanSchema>;
export type LessonPlan = z.infer<typeof LessonPlanSchema>;

// ───────────────────────────────────────────────────────────────
// Stage 2: Lesson schema (one lesson at a time)
// ───────────────────────────────────────────────────────────────

export const GeneratedLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  metadata: z.object({
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    estimatedMinutes: z.number().min(1).max(60),
    tags: z.array(z.string()),
    version: z.string().default('1.0.0'),
  }),
  prerequisites: z.array(z.string()).default([]),
  content: z.object({
    markdown: z.string(),
    widgets: z.array(WidgetConfigSchema).default([]),
  }),
});

export type GeneratedLesson = z.infer<typeof GeneratedLessonSchema>;

// ───────────────────────────────────────────────────────────────
// Stage 3: Course schema (final merged structure)
// ───────────────────────────────────────────────────────────────

export const GeneratedCourseSchema = z.object({
  title: z.string(),
  description: z.string(),
  lessons: z.array(GeneratedLessonSchema).min(1).max(10),
});

export type GeneratedCourse = z.infer<typeof GeneratedCourseSchema>;

// ───────────────────────────────────────────────────────────────
// Robust JSON extractor
// Handles: code fences, prose before/after, trailing commas,
// truncated output, unbalanced brackets
// ───────────────────────────────────────────────────────────────

export function extractJson(text: string): unknown {
  let cleaned = text.trim();

  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, '');

  // Find the first opening brace
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) {
    throw new Error('No JSON object found in response.');
  }

  // Extract from the first '{' and find its matching '}' by tracking depth.
  // This strips any trailing prose after the JSON object.
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastCloseBrace = -1;

  for (let i = firstBrace; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        lastCloseBrace = i;
        break;
      }
    }
  }

  if (lastCloseBrace !== -1) {
    // We found a balanced JSON object — extract just that portion
    cleaned = cleaned.slice(firstBrace, lastCloseBrace + 1);
  } else {
    // Unbalanced (truncated) — fall back to slicing from '{' to end
    cleaned = cleaned.slice(firstBrace);
  }

  // Fix trailing commas before } or ] (common LLM mistake)
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  // Auto-close unbalanced brackets and braces (handles truncation)
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/\]/g) || []).length;

  if (openBrackets > closeBrackets) {
    cleaned = cleaned + ']'.repeat(openBrackets - closeBrackets);
  }
  if (openBraces > closeBraces) {
    cleaned = cleaned + '}'.repeat(openBraces - closeBraces);
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('JSON parse failed. Cleaned text:', cleaned.slice(0, 500));
    throw new Error(
      `Failed to parse JSON: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

// ───────────────────────────────────────────────────────────────
// Typed parse helpers (one per stage)
// ───────────────────────────────────────────────────────────────

export function parsePlanResponse(text: string): CoursePlan {
  const parsed = extractJson(text);
  const result = CoursePlanSchema.safeParse(parsed);
  if (!result.success) {
    const fieldErrors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    console.error('Plan validation errors:\n', fieldErrors);
    throw new Error(`Invalid plan structure.\n\n${fieldErrors}`);
  }
  return result.data;
}

export function parseLessonResponse(text: string): GeneratedLesson {
  const parsed = extractJson(text);
  const result = GeneratedLessonSchema.safeParse(parsed);
  if (!result.success) {
    const fieldErrors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    console.error('Lesson validation errors:\n', fieldErrors);
    throw new Error(`Invalid lesson structure.\n\n${fieldErrors}`);
  }
  return result.data;
}

// ───────────────────────────────────────────────────────────────
// Prompts (one per stage)
// ───────────────────────────────────────────────────────────────

export const PLAN_SYSTEM_PROMPT = `You are a JSON API. You do NOT write prose, summaries, or explanations. You ONLY output valid JSON.

ABSOLUTE RULES — VIOLATION MEANS FAILURE:
1. Your ENTIRE response must be a single JSON object. Nothing else.
2. Do NOT write introductory sentences like "Here is the plan" or "Based on the content..."
3. Do NOT write summaries of the source text.
4. Do NOT use markdown code blocks (no \`\`\`json).
5. Do NOT add any text before or after the JSON.
6. The first character of your response MUST be "{"
7. The last character of your response MUST be "}"

If you write ANY text that is not part of the JSON object, the entire response is invalid and useless.`;

export const buildPlanUserPrompt = (sourceContent: string, numLessons: number): string => `
Analyze the source text below and create a plan for EXACTLY ${numLessons} focused lessons.

Source text:
"""
${sourceContent.slice(0, 12000)}
"""

Return this EXACT JSON shape:
{
  "title": "Course Title",
  "description": "One sentence describing what the course teaches",
  "lessons": [
    {
      "id": "lesson-1",
      "title": "Focused Lesson Title",
      "keyPoints": ["Key point 1", "Key point 2"],
      "widgetSuggestions": [
        { "type": "sandbox", "purpose": "What the user can try interactively" }
      ]
    }
  ]
}

Rules:
- Generate EXACTLY ${numLessons} lessons (ids: lesson-1, lesson-2, ...)
- Each lesson covers ONE focused concept from the source
- Suggest 1 widget per lesson that makes the concept interactive
- Allowed widget types: "sandbox", "mutator", "trade_off"
- Key points: 2-3 short phrases summarizing what's taught

REMINDER: Your response must start with "{" and end with "}". NO prose, NO summaries, NO explanations outside the JSON.`;

export const LESSON_SYSTEM_PROMPT = `You are a JSON API. You do NOT write prose, summaries, or explanations. You ONLY output valid JSON.

ABSOLUTE RULES — VIOLATION MEANS FAILURE:
1. Your ENTIRE response must be a single JSON object. Nothing else.
2. Do NOT write introductory or concluding text.
3. Do NOT use markdown code blocks (no \`\`\`json).
4. Do NOT add any text before or after the JSON.
5. The first character of your response MUST be "{"
6. The last character of your response MUST be "}"

If you write ANY text that is not part of the JSON object, the entire response is invalid.`;

export const buildLessonUserPrompt = (
  sourceContent: string,
  plan: CoursePlan,
  targetLesson: LessonPlan,
  previousLessons: GeneratedLesson[]
): string => {
  const previousContext = previousLessons.length > 0
    ? `\n\nPREVIOUS LESSONS (for coherence, do NOT repeat this content):\n${previousLessons.map(l => `- ${l.id}: ${l.title}`).join('\n')}`
    : '';

  return `
COURSE PLAN:
${JSON.stringify(plan, null, 2)}

TARGET LESSON TO GENERATE: ${targetLesson.id} — "${targetLesson.title}"
Key points to cover: ${targetLesson.keyPoints.join(', ')}
Widget suggestions: ${JSON.stringify(targetLesson.widgetSuggestions)}
${previousContext}

SOURCE TEXT:
"""
${sourceContent.slice(0, 10000)}
"""

Generate ONLY the lesson "${targetLesson.id}" with full markdown and widgets.

Return this EXACT JSON shape:
{
  "id": "${targetLesson.id}",
  "title": "${targetLesson.title}",
  "metadata": {
    "difficulty": "beginner",
    "estimatedMinutes": 8,
    "tags": ["relevant", "tags"],
    "version": "1.0.0"
  },
  "prerequisites": [],
  "content": {
    "markdown": "# ${targetLesson.title}\\n\\nIntro paragraph.\\n\\n{{widget:${targetLesson.id}-sandbox-1}}\\n\\nMore explanation...",
    "widgets": [
      {
        "id": "${targetLesson.id}-sandbox-1",
        "type": "sandbox",
        "props": {
          "inputType": "text",
          "outputType": "text",
          "initialState": "Try it here..."
        }
      }
    ]
  }
}

Rules:
- Markdown: keep under 250 words, engaging and focused on the lesson topic
- Use {{widget:widget-id}} syntax in the markdown to embed widgets inline
- Widget IDs MUST be prefixed with the lesson id (e.g., "${targetLesson.id}-sandbox-1")
- Allowed widget types: "sandbox", "mutator", "trade_off"
- Sandbox props: inputType ("text"|"code"), outputType ("text"|"html"), initialState (string)
- Mutator props: language, brokenCode, hint, testCases (array)
- Trade_off props: scenario, options array (each: id, name, description, pros[], cons[], metrics{cost,performance,complexity})
`;
}
