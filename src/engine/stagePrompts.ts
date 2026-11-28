/**
 * S2 — Per-Stage Prompt Engineering
 *
 * Builds the message list for each generation stage. Every prompt does exactly
 * one job, receives the accumulated StageContext (S3) so it builds on what was
 * already written instead of re-explaining it, and is scaled by the model tier
 * (S6): weak models get no few-shot noise, strong models get one worked example.
 *
 * Output contracts per stage (enforced by stageValidators.ts / S4):
 *   introduction | motivation | explanation | example | summary | review
 *       -> markdown prose
 *   quiz
 *       -> markdown questions, each followed by an "Answer:" line
 *   widget_generation
 *       -> JSON only: { "widgets": [ { type, props } ] }
 *
 * Widget type names here are the HYPHENATED registry keys
 * (`context-diagram`, `trade-off`, `socratic-chat`). The task spec wrote them
 * with underscores; that spelling matches no schema literal or registry entry
 * and would produce widgets that silently never render.
 */
import type { ChatMessage } from './aiService';
import type { StagePromptContext, StageType } from './stageContext';
import type { TierConfig } from './modelCapability';

export const STAGE_LABELS: Record<StageType, string> = {
  introduction: 'Introduction',
  motivation: 'Motivation',
  explanation: 'Explanation',
  example: 'Worked Example',
  widget_generation: 'Interactive Widgets',
  quiz: 'Knowledge Check',
  summary: 'Summary',
  review: 'Reflect & Apply',
};

/** Baseline prose targets; sum approximates a medium lesson at 1,200 words. */
const BASE_WORD_TARGETS: Record<StageType, number> = {
  introduction: 150,
  motivation: 120,
  explanation: 400,
  example: 200,
  widget_generation: 0,
  quiz: 100,
  summary: 120,
  review: 100,
};

const BASE_TOTAL_WORDS = 1190;
const MIN_STAGE_WORDS = 40;

/** Word guidance scaled to the lesson's actual budget (S3 targetWordCount). */
export function stageWordTarget(stage: StageType, targetWordCount: number): number {
  const base = BASE_WORD_TARGETS[stage];
  if (base === 0) return 0;
  const scaled = Math.round((base * targetWordCount) / BASE_TOTAL_WORDS);
  return Math.max(MIN_STAGE_WORDS, scaled);
}

const TONE_RULES = `TONE AND STYLE:
- Write in second person ("you"), conversational but precise.
- Prefer short sentences. One idea per paragraph.
- Use a concrete, real-world analogy before abstract definitions.
- Name things exactly as the established terminology does — do not invent synonyms.
- Never open with "In today's fast-paced world", "Welcome to", "Let's dive in", or a definition of the lesson title itself.`;

const REPETITION_RULES = `COHERENCE — this lesson is part of a sequence:
- Concepts listed under CONCEPTS ALREADY EXPLAINED were taught earlier. You may REFERENCE them in one clause, but MUST NOT define, re-derive, or re-analogize them.
- Never restate an analogy already used. DO NOT REPEAT THESE PHRASES lists banned wording.
- Cover only what CONCEPTS STILL TO COVER asks for.`;

const MARKDOWN_RULES = `FORMATTING:
- Output raw markdown only. No H1 heading, no preamble, no closing sign-off, no code fences around the whole response.
- Start with a H3 ("### ") appropriate to this section.
- Use tables or bullet lists instead of long prose where structure helps.`;

export interface StagePromptParams {
  stage: StageType;
  context: StagePromptContext;
  config: TierConfig;
  /** Lesson subject, typically the plan title or source topic. */
  topic: string;
  /** Source material the lesson is derived from (may be empty). */
  sourceContent?: string;
  /** Widget kinds planned for this lesson, already filtered by tier. */
  widgetPlan?: string[];
  /** Code language for examples when the lesson or tier decided one. */
  language?: string;
}

const STAGE_TASKS: Record<StageType, string> = {
  introduction: `Write the INTRODUCTION section.
- State in 1-2 sentences what this topic is and what the reader will be able to do after this lesson.
- Do not define concepts that were already covered earlier.`,
  motivation: `Write the WHY IT MATTERS section.
- Explain the real problem this solves and what goes wrong without it.
- Ground it in a concrete failure a practitioner actually hits (latency, cost, incorrect output, outage).
- 2-3 short paragraphs, no bullet spam.`,
  explanation: `Write the main EXPLANATION section — the core of the lesson.
- Teach the concepts listed under CONCEPTS STILL TO COVER, one subsection per concept.
- For each: what it is, how it works mechanically, and where the boundary/limitation is.
- Describe flows as ordered steps so a later stage can diagram them.
- This section carries most of the lesson's word budget; be thorough, not padded.`,
  example: `Write ONE WORKED EXAMPLE section.
- Pick a realistic scenario and walk it end to end, showing inputs, intermediate results and the outcome.
- If a code language is specified, use it; keep listings short and focused on the concept, not on setup.
- Explain the result in one or two sentences after the code, not before.`,
  widget_generation: `Produce the lesson's INTERACTIVE WIDGETS as JSON.
- Choose widget types only from ALLOWED WIDGET TYPES; pick the smallest set that adds practice value (usually 1-2).
- Each widget must be self-contained and valid without any surrounding prose.`,
  quiz: `Write a KNOWLEDGE CHECK section.
- 2-3 questions that test understanding, not recall of wording.
- Format exactly:
  ### Knowledge Check
  **Q1. <question>**
  Answer: <answer, 1-2 sentences>
- Questions must be answerable from this lesson alone.`,
  summary: `Write the SUMMARY section.
- Recap what the reader can now do, as 3-5 tight bullets.
- Reference the concepts by their established names. No new information, no new analogies.`,
  review: `Write the REFLECT & APPLY section.
- Two prompts the reader can act on: one to check their own understanding, one small task or design question that applies the topic to their own work.
- Mention what to learn next, based on CONCEPTS STILL TO COVER across the course.`,
};

const FEW_SHOT: Partial<Record<StageType, string>> = {
  introduction: `EXAMPLE (topic: database indexes):
### What an Index Does
An index is a sorted side structure that lets the database skip most rows instead of reading them all. By the end of this lesson you will be able to look at a query and predict whether an index helps it.`,
  motivation: `EXAMPLE (topic: idempotency keys):
Without an idempotency key, a retried payment request is a second charge. The client's timeout looks identical to a lost response, so the retry is unavoidable — and unsafe.`,
  explanation: `EXAMPLE (structure only):
### The Write Path
The WAL is appended first...

### The Merge Step
Because writes land in the log, background compaction...`,
  example: `EXAMPLE (structure only):
### Reading a Cold Cache
1. The client requests key \`user:42\`.
2. The cache misses, so the request goes to the database.
3. The row is returned in 4 ms and written back with a 60 s TTL.

The second read is served from memory in 0.2 ms.`,
  quiz: `EXAMPLE (structure only):
### Knowledge Check
**Q1. Why does a cache miss add latency to only the first request?**
Answer: Later requests are served from memory, so the database round trip happens once per key per TTL window.`,
};

function contextBlock(context: StagePromptContext): string {
  return context.text;
}

function languageLine(language?: string): string {
  return language ? `\nCODE LANGUAGE: use \`${language}\` for all code samples.` : '';
}

function sourceBlock(sourceContent?: string): string {
  const trimmed = (sourceContent ?? '').trim();
  if (!trimmed) return 'SOURCE MATERIAL: (none — teach from the concepts listed above)';
  return `SOURCE MATERIAL (ground every claim in this; do not invent specifics):\n"""\n${trimmed.slice(0, 6000)}\n"""`;
}

/**
 * Builds the messages for one stage. Always returns system + user; callers pass
 * the result straight to a non-streaming completion.
 */
export function buildStagePrompt(params: StagePromptParams): ChatMessage[] {
  const { stage, context, config, topic, widgetPlan, language } = params;
  const words = stageWordTarget(stage, context.targetWordCount);

  const systemParts = [
    stage === 'widget_generation'
      ? 'You are a JSON API for interactive learning widgets. You output one JSON object and nothing else.'
      : 'You are an expert technical educator writing ONE section of a larger lesson.',
    '',
    STAGE_TASKS[stage],
    '',
    TONE_RULES,
    '',
    REPETITION_RULES,
  ];

  if (stage !== 'widget_generation') {
    systemParts.push('', MARKDOWN_RULES);
    systemParts.push(
      words > 0 ? `\nLENGTH: write approximately ${words} words for this section.` : ''
    );
  } else {
    systemParts.push(
      '',
      `OUTPUT RULES: first character "{", last character "}", no prose, no code fences.`,
      `Shape: {"widgets":[{"type":"<one of: ${
        (widgetPlan ?? config.allowedWidgets).join(' | ') || 'sandbox'
      }>","props":{...}}]}`
    );
  }

  if (config.fewShotExamples && FEW_SHOT[stage]) {
    systemParts.push('', FEW_SHOT[stage] as string);
  }

  const userParts = [
    `LESSON TOPIC: ${topic}`,
    '',
    contextBlock(context),
    '',
    sourceBlock(params.sourceContent),
  ];

  if (stage === 'widget_generation') {
    userParts.push(
      '',
      `ALLOWED WIDGET TYPES: ${(widgetPlan ?? config.allowedWidgets).join(', ') || '(none for this model tier — return {"widgets":[]})'}`,
      `WIDGETS ALREADY IN THIS LESSON: ${context.keyDecisionsMade.join('; ') || '(none)'}`
    );
  }

  userParts.push(languageLine(language).trimStart());

  return [
    { role: 'system', content: systemParts.filter(Boolean).join('\n') },
    { role: 'user', content: userParts.filter((part) => part !== '').join('\n') },
  ];
}

/**
 * Stricter variant used after a validation failure. Quotes the exact errors and
 * demands the smallest repair that satisfies them, so the model does not rewrite
 * the section and regress something that already passed.
 */
export function buildStageRetryPrompt(
  params: StagePromptParams,
  validationErrors: string[]
): ChatMessage[] {
  const { stage, context, config } = params;
  const base = buildStagePrompt(params);
  const words = stageWordTarget(stage, context.targetWordCount);

  const extra = [
    '',
    'YOUR PREVIOUS OUTPUT WAS REJECTED BY THE VALIDATOR.',
    'Fix these EXACT problems:',
    ...validationErrors.map((error, index) => `${index + 1}. ${error}`),
    '',
    'RULES FOR THE RETRY:',
    '- Keep the same concepts, structure and terminology as the rejected attempt.',
    '- Make the smallest change that satisfies every item above; do not rewrite from scratch.',
    '- Do not repeat any of these mistakes.',
    '- Do not explain what you fixed and do not apologize.',
  ];

  if (stage !== 'widget_generation') {
    extra.push(
      `- Stay within ${words} words; if a validator complained about length, cut filler first, never substance.`
    );
  } else {
    extra.push(
      '- Output only type and props for each widget. Omit any props you are not certain about.',
      `- Every widget "type" must be one of: ${config.allowedWidgets.join(', ')}.`
    );
  }

  return base.map((message, index) =>
    index === 0 ? { ...message, content: message.content + extra.join('\n') } : message
  );
}
