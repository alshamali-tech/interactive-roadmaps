import { z } from 'zod';

const WidgetConfigSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('sandbox'),
    props: z.object({
      inputType: z.enum(['text', 'code']),
      outputType: z.enum(['text', 'html']),
      initialState: z.string().optional(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('mutator'),
    props: z.object({
      language: z.enum(['python', 'javascript', 'typescript', 'sql']),
      brokenCode: z.string(),
      hint: z.string(),
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

export const GeneratedCourseSchema = z.object({
  title: z.string(),
  description: z.string(),
  lessons: z.array(GeneratedLessonSchema).min(1).max(10),
});

export type GeneratedCourse = z.infer<typeof GeneratedCourseSchema>;

export const GENERATOR_SYSTEM_PROMPT = `You are an expert curriculum designer. I will give you raw text.
Your task is to convert this text into a structured, interactive mini-course.
You MUST output ONLY valid, raw JSON matching the provided schema.
CRITICAL RULES:
1. Do NOT wrap the JSON in markdown code blocks (no \`\`\`json).
2. Do NOT include any conversational text, greetings, or explanations outside the JSON.
3. Ensure all widget IDs are unique (e.g., 'sandbox-1', 'mutator-1').
4. In the markdown content, inject the widgets using this exact syntax: {{widget:widget-id-here}}
5. Keep the markdown concise and engaging.`;

export function parseAIResponse(text: string): GeneratedCourse {
  // LLMs often wrap JSON in ```json ... ``` despite instructions not to.
  // We aggressively strip these out.
  let cleanedText = text.trim();
  
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.slice(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.slice(3);
  }
  
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.slice(0, -3);
  }

  cleanedText = cleanedText.trim();

  const result = GeneratedCourseSchema.safeParse(JSON.parse(cleanedText));
  
  if (!result.success) {
    console.error('Zod Validation Errors:', result.error.flatten());
    throw new Error('AI generated invalid JSON structure. Please try regenerating.');
  }

  return result.data;
}
