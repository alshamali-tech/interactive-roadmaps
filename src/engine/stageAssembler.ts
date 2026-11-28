/**
 * S5 — Stage Output Assembly
 *
 * Combines the per-stage results from S1 into one lesson that satisfies the
 * existing `GeneratedLessonSchema`, so downstream code (mergeCourse, MyCourses,
 * the lesson page) needs no changes.
 *
 * Assembly is deliberately mechanical: normalize headings, place widget tags
 * where the learner meets them in reading order, and dedupe the concept list.
 * No content is invented here.
 */
import type { GeneratedLesson, LessonPlan, WidgetConfig } from './generatorSchema';
import type { StageContext, StageType } from './stageContext';
import { STAGE_LABELS } from './stagePrompts';

export interface StageOutput {
  stage: StageType;
  text: string;
  widgets?: WidgetConfig[];
}

export interface AssembleInput {
  lessonPlan: LessonPlan;
  planTitle: string;
  outputs: StageOutput[];
  context: StageContext;
  estimatedMinutes: number;
}

/** Order sections are concatenated in, regardless of completion order. */
const SECTION_ORDER: StageType[] = [
  'introduction',
  'motivation',
  'explanation',
  'example',
  'widget_generation',
  'quiz',
  'summary',
  'review',
];

/** Widgets belong before the knowledge check so learners try them first. */
const WIDGET_INSERT_AFTER: StageType[] = ['example', 'explanation', 'introduction'];

const WORDS_PER_MINUTE = 130;

/** Case-insensitive, order-preserving dedupe for concept lists. */
export function dedupeConcepts(concepts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const concept of concepts) {
    const clean = concept.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** Rewrites widget ids to the `${lessonId}-widget-${n}` scheme the app expects. */
export function assignWidgetIds(lessonId: string, widgets: WidgetConfig[]): WidgetConfig[] {
  return widgets.map((widget, index) => ({
    ...widget,
    id: `${lessonId}-widget-${index + 1}`,
  }));
}

/**
 * Ensures every section starts with an H3 so concatenated stages read as one
 * document instead of a wall of paragraphs. An H1 emitted by a stage is demoted.
 */
export function normalizeHeading(text: string, stage: StageType): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (/^#\s+\S/.test(trimmed)) {
    return trimmed.replace(/^#\s+/, '### ');
  }
  if (/^#{2,6}\s/.test(trimmed)) return trimmed;

  return `### ${STAGE_LABELS[stage]}\n\n${trimmed}`;
}

/** Joins stage outputs in reading order, inserting widget tags after the prose. */
export function mergeStageOutputs(
  outputs: StageOutput[],
  widgetTags: string[]
): { markdown: string; placed: StageType[] } {
  const byStage = new Map<StageType, StageOutput>();
  for (const output of outputs) {
    // Later attempts of the same stage win; empty text never replaces content.
    if (output.text.trim().length === 0 && byStage.has(output.stage)) continue;
    byStage.set(output.stage, output);
  }

  const ordered = SECTION_ORDER.filter((stage) => byStage.has(stage));
  const blocks: string[] = [];
  const insertAfter = new Set(WIDGET_INSERT_AFTER);
  let tagsPlaced = false;

  for (const stage of ordered) {
    if (stage === 'widget_generation') continue; // represented by tags, not prose
    const output = byStage.get(stage)!;
    blocks.push(normalizeHeading(output.text, stage));

    if (!tagsPlaced && widgetTags.length > 0 && insertAfter.has(stage)) {
      blocks.push(widgetTags.join('\n\n'));
      tagsPlaced = true;
    }
  }

  if (!tagsPlaced && widgetTags.length > 0) {
    blocks.push(widgetTags.join('\n\n'));
  }

  return { markdown: blocks.filter(Boolean).join('\n\n'), placed: ordered };
}

/** Builds the final lesson object. */
export function assembleStagedLesson(input: AssembleInput): GeneratedLesson {
  const { lessonPlan, outputs, context, estimatedMinutes } = input;

  const collected = outputs.flatMap((output) => output.widgets ?? []);
  const widgets = assignWidgetIds(lessonPlan.id, collected);
  const widgetTags = widgets.map((widget) => `<widget id="${widget.id}" />`);

  const { markdown } = mergeStageOutputs(outputs, widgetTags);

  const tags = dedupeConcepts([
    ...lessonPlan.keyPoints,
    ...context.conceptsIntroducedSoFar,
  ]).slice(0, 8);

  const minutes = Math.min(
    60,
    Math.max(1, Math.round(estimatedMinutes || context.targetWordCount / WORDS_PER_MINUTE))
  );

  return {
    id: lessonPlan.id,
    title: lessonPlan.title,
    metadata: {
      difficulty: lessonPlan.suggestedDifficulty,
      estimatedMinutes: minutes,
      tags,
      version: '1.0.0',
    },
    prerequisites: [],
    content: { markdown, widgets },
  };
}

export interface AssemblyCheck {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixed?: GeneratedLesson;
}

/**
 * Structural check before the lesson is handed back: non-empty markdown, every
 * widget tag in the markdown resolves to a declared widget (and vice versa), and
 * at least one section heading exists.
 */
export function validateAssembledLesson(lesson: GeneratedLesson): AssemblyCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (lesson.content.markdown.trim().length === 0) {
    errors.push('Assembled lesson has no markdown.');
  }

  if (!/^#{3,6}\s/m.test(lesson.content.markdown)) {
    warnings.push('Assembled lesson has no section headings.');
  }

  const declared = lesson.content.widgets.map((widget) => widget.id);
  const referenced = [...lesson.content.markdown.matchAll(/<widget\s+id="([^"]+)"\s*\/>/g)].map(
    (match) => match[1]
  );

  for (const id of referenced) {
    if (!declared.includes(id)) {
      errors.push(`Markdown references widget "${id}" that is not declared.`);
    }
  }
  for (const id of declared) {
    if (!referenced.includes(id)) {
      warnings.push(`Widget "${id}" is declared but never placed in the markdown.`);
    }
  }

  const orphanFree = errors.length === 0;
  let fixed: GeneratedLesson | undefined;
  if (!orphanFree) {
    // Drop dangling references so the lesson still renders instead of showing raw tags.
    const cleaned = lesson.content.markdown.replace(
      /<widget\s+id="([^"]+)"\s*\/>/g,
      (tag, id: string) => (declared.includes(id) ? tag : '')
    );
    fixed = { ...lesson, content: { ...lesson.content, markdown: cleaned } };
  }

  return { valid: orphanFree, errors, warnings, fixed };
}
