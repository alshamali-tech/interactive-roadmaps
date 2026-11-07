/**
 * Lesson Parser — Two-pass generation support
 *
 * Parses markdown with :::widget markers into structured lesson data.
 * This is the second pass in "focused" generation mode:
 *   Pass 1: LLM writes natural markdown with widget markers
 *   Pass 2: This parser extracts widgets and builds valid lesson JSON
 *
 * Widget marker format:
 *   :::widget <type>
 *   key: value
 *   key: value
 *   key: value
 *   key: value
 *   :::
 *
 * Supported types: sandbox, mutator, trade-off (also accepts trade_off),
 *                  context-diagram (also accepts context_diagram)
 * Invalid widgets are silently skipped rather than failing the whole lesson.
 */

import { WidgetConfigSchema, DiagramSchema, type WidgetConfig, type Diagram } from './generatorSchema';

// Matches :::widget <type> ... ::: blocks (non-greedy)
// \n? before closing ::: allows matching empty-body widgets like :::widget sandbox\n:::
const WIDGET_BLOCK_RE = /:::widget\s+(sandbox|mutator|trade-off|trade_off|context-diagram|context_diagram)[ \t]*\n([\s\S]*?)\n?:::/gi;

/**
 * Parse key: value pairs from a widget block body.
 * Handles:
 * - Simple string values: `key: value`
 * - Multiline values (continuation lines that don't start with `key:`)
 * - Repeated keys become arrays (for testCase, pro, con)
 */
function parseWidgetBody(body: string): Record<string, string | string[]> {
  const props: Record<string, string | string[]> = {};
  const lines = body.split('\n');

  let currentKey = '';
  const currentLines: string[] = [];

  function flush() {
    if (!currentKey) return;
    const val = currentLines.join('\n').trim();
    if (props[currentKey] !== undefined) {
      // Key repeated — convert to array
      const existing = props[currentKey];
      if (Array.isArray(existing)) {
        existing.push(val);
      } else {
        props[currentKey] = [existing as string, val];
      }
    } else {
      props[currentKey] = val;
    }
    currentLines.length = 0;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try to match a new key: value pair
    const kv = trimmed.match(/^([a-zA-Z_]\w*):\s*(.*)$/);
    if (kv) {
      flush();
      currentKey = kv[1];
      if (kv[2]) currentLines.push(kv[2]);
      continue;
    }

    // Continuation line
    if (currentKey) {
      currentLines.push(trimmed);
    }
  }
  flush();

  return props;
}

function asString(val: string | string[] | undefined, fallback = ''): string {
  if (Array.isArray(val)) return val.join('\n');
  return val ?? fallback;
}

function asStringArray(val: string | string[] | undefined): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') return [val];
  return [];
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'string' ? parseFloat(val) : Number(val);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Try to parse a string as JSON. Returns null if parsing fails.
 */
function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeSandbox(props: Record<string, string | string[]>): WidgetConfig | null {
  const widget: WidgetConfig = {
    id: '',
    type: 'sandbox',
    props: {
      inputType: asString(props.inputType) === 'code' ? 'code' : 'text',
      outputType: asString(props.outputType) === 'html' ? 'html' : 'text',
      initialState: asString(props.initialState, 'Try it...'),
      processFunction: asString(props.processFunction) || undefined,
      label: asString(props.label) || undefined,
      placeholder: asString(props.placeholder) || undefined,
    },
  };

  const validation = WidgetConfigSchema.safeParse(widget);
  return validation.success ? validation.data : null;
}

function normalizeMutator(props: Record<string, string | string[]>): WidgetConfig | null {
  // Accept both testCase and testCases as the repeated key
  let testCases = asStringArray(props.testCase);
  if (testCases.length === 0) testCases = asStringArray(props.testCases);

  const validLanguages = ['python', 'javascript', 'typescript', 'sql'] as const;
  const lang = asString(props.language, 'javascript').toLowerCase();
  const language = validLanguages.includes(lang as typeof validLanguages[number])
    ? (lang as typeof validLanguages[number])
    : 'javascript';

  const widget: WidgetConfig = {
    id: '',
    type: 'mutator',
    props: {
      language,
      brokenCode: asString(props.brokenCode),
      hint: asString(props.hint),
      testCases,
      title: asString(props.title) || undefined,
    },
  };

  const validation = WidgetConfigSchema.safeParse(widget);
  return validation.success ? validation.data : null;
}

function normalizeTradeOff(props: Record<string, string | string[]>): WidgetConfig | null {
  // Flat naming convention: optionA_name, optionA_pro, optionA_con, optionA_cost, etc.
  const options = [];

  for (const prefix of ['optionA', 'optionB', 'optionC', 'optionD']) {
    const name = asString(props[`${prefix}_name`]);
    if (!name) continue;

    const pros = asStringArray(props[`${prefix}_pro`]);
    if (pros.length === 0) {
      // Also accept comma-separated in a single value
      const prosStr = asString(props[`${prefix}_pros`]);
      if (prosStr) pros.push(...prosStr.split(',').map(s => s.trim()).filter(Boolean));
    }

    const cons = asStringArray(props[`${prefix}_con`]);
    if (cons.length === 0) {
      const consStr = asString(props[`${prefix}_cons`]);
      if (consStr) cons.push(...consStr.split(',').map(s => s.trim()).filter(Boolean));
    }

    options.push({
      id: prefix.toLowerCase().replace('option', 'opt-'),
      name,
      description: asString(props[`${prefix}_description`]),
      pros,
      cons,
      metrics: {
        cost: clampNumber(props[`${prefix}_cost`], 1, 10, 5),
        performance: clampNumber(props[`${prefix}_performance`], 1, 10, 5),
        complexity: clampNumber(props[`${prefix}_complexity`], 1, 10, 5),
        scalability: clampNumber(props[`${prefix}_scalability`], 1, 10, 5),
      },
    });
  }

  // Need at least 2 options
  while (options.length < 2) {
    options.push({
      id: `opt-${options.length}`,
      name: `Option ${options.length + 1}`,
      description: '',
      pros: [],
      cons: [],
      metrics: { cost: 5, performance: 5, complexity: 5, scalability: 5 },
    });
  }

  const widget: WidgetConfig = {
    id: '',
    type: 'trade-off',
    props: {
      scenario: asString(props.scenario, 'Choose the best approach'),
      options: options.slice(0, 4),
      explanation: asString(props.explanation) || undefined,
    },
  };

  const validation = WidgetConfigSchema.safeParse(widget);
  return validation.success ? validation.data : null;
}

/**
 * Parse and validate a context-diagram widget body.
 * Supports two formats:
 * 1. JSON body: The entire body is a JSON object matching DiagramSchema
 * 2. Key-value: `diagram: <json-string>` where the value is parsed as JSON
 *
 * Returns null if validation fails, logging a warning with the error details.
 */
function normalizeContextDiagram(body: string, props: Record<string, string | string[]>): WidgetConfig | null {
  let diagramData: unknown = null;

  // Try to parse the entire body as JSON first
  const trimmedBody = body.trim();
  if (trimmedBody.startsWith('{')) {
    diagramData = tryParseJson(trimmedBody);
  }

  // Fall back to the 'diagram' key-value pair
  if (diagramData === null) {
    const diagramStr = asString(props.diagram);
    if (diagramStr) {
      diagramData = tryParseJson(diagramStr);
    }
  }

  if (diagramData === null) {
    console.warn('[lessonParser] context-diagram: Could not parse diagram data as JSON');
    return null;
  }

  // Validate against DiagramSchema
  const result = DiagramSchema.safeParse(diagramData);
  if (!result.success) {
    const errors = result.error.issues
      .map(i => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.warn(
      `[lessonParser] context-diagram: Diagram could not be rendered due to structural issues.\n${errors}`
    );
    return null;
  }

  const diagram: Diagram = result.data;

  const widget: WidgetConfig = {
    id: '',
    type: 'context-diagram',
    props: {
      diagram,
    },
  };

  const validation = WidgetConfigSchema.safeParse(widget);
  return validation.success ? validation.data : null;
}

function normalizeWidget(type: string, body: string, props: Record<string, string | string[]>): WidgetConfig | null {
  // Empty body = no props at all = clearly a mistake, skip it
  if (Object.keys(props).length === 0 && !body.trim().startsWith('{')) return null;

  const normalizedType = type.toLowerCase().replace('trade_off', 'trade-off').replace('context_diagram', 'context-diagram');

  switch (normalizedType) {
    case 'sandbox':
      return normalizeSandbox(props);
    case 'mutator':
      return normalizeMutator(props);
    case 'trade-off':
      return normalizeTradeOff(props);
    case 'context-diagram':
      return normalizeContextDiagram(body, props);
    default:
      return null;
  }
}

/**
 * Parse a focused-mode lesson response (markdown with :::widget markers)
 * into structured content with extracted widgets.
 *
 * @param raw - The raw markdown output from the LLM
 * @param lessonId - Lesson ID used to prefix widget IDs (e.g., "lesson-1")
 * @returns Parsed markdown (with widget markers replaced by <widget> tags) and widget array
 */
export function parseFocusedLesson(
  raw: string,
  lessonId: string
): { markdown: string; widgets: WidgetConfig[] } {
  const widgets: WidgetConfig[] = [];
  let widgetCounter = 0;

  // Strip any markdown code fences the model might wrap around its output
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, '');

  const markdown = cleaned.replace(WIDGET_BLOCK_RE, (_match, type: string, body: string) => {
    widgetCounter++;
    const props = parseWidgetBody(body);
    const widget = normalizeWidget(type, body, props);

    if (!widget) {
      // Invalid widget — remove the marker entirely, leave surrounding text
      return '';
    }

    widget.id = `${lessonId}-widget-${widgetCounter}`;
    widgets.push(widget);

    return `\n<widget id="${widget.id}" />\n`;
  });

  return {
    markdown: markdown.trim(),
    widgets,
  };
}
