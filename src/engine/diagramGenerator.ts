/**
 * Context-Aware Diagram Generator
 *
 * Three-stage pipeline for generating context-aware diagrams from topics/text:
 *   Stage 1 — Text Generation: Pedagogical explanation of a topic
 *   Stage 2 — Diagram Extraction: Structured diagram definition (JSON)
 *   Stage 3 — Merge & Validate: Combine text + diagram into widget config
 *
 * This replaces the free-form NodeGraph widget with an AI-generated
 * Context-Aware Diagram that integrates naturally with lesson content.
 *
 * Architecture:
 *   - Each stage has its own dedicated system prompt optimized for that task.
 *   - Retry logic: if Stage 2 fails validation, retries up to 2 times with
 *     a stricter prompt before falling back to text-only output.
 *   - Configuration option to skip Stage 1 if text is already provided.
 *   - Graceful degradation: returns text-only if diagram generation fails.
 */

import { z } from 'zod';
import { generateRawCompletion } from './aiService';
import { extractJson } from './generatorSchema';
import type { AISettings } from './settings';

// ───────────────────────────────────────────────────────────────
// Zod Schemas (Stage 2 output contract)
// ───────────────────────────────────────────────────────────────

/** Allowed node types for the diagram */
export const DiagramNodeTypeSchema = z.enum([
  'start',
  'end',
  'process',
  'decision',
]);
export type DiagramNodeType = z.infer<typeof DiagramNodeTypeSchema>;

/** A single node in the diagram */
export const DiagramNodeSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ID must be kebab-case (e.g., "check-input")')
    .describe('Unique node identifier in kebab-case'),
  label: z
    .string()
    .min(1)
    .max(40)
    .describe('Short display label (2-5 words)'),
  type: DiagramNodeTypeSchema.describe(
    'Visual node type: start, end, process, or decision'
  ),
});
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;

/** A single edge connecting two nodes */
export const DiagramEdgeSchema = z.object({
  from: z.string().min(1).describe('Source node ID (must exist in nodes array)'),
  to: z.string().min(1).describe('Target node ID (must exist in nodes array)'),
  label: z
    .string()
    .max(30)
    .optional()
    .describe('Short label on the edge (1-3 words, e.g., "Yes", "No", "Valid")'),
});
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;

/** The complete structured diagram definition (Stage 2 output) */
export const DiagramDefinitionSchema = z
  .object({
    diagramType: z
      .enum(['flowchart', 'sequence', 'class', 'er', 'custom'])
      .default('flowchart')
      .describe('Type of diagram (default: flowchart)'),
    title: z
      .string()
      .max(60)
      .optional()
      .describe('Short title for the diagram'),
    caption: z
      .string()
      .max(120)
      .optional()
      .describe('One sentence describing what this diagram shows'),
    nodes: z
      .array(DiagramNodeSchema)
      .min(2)
      .max(20)
      .describe('Array of nodes (2-20 nodes)'),
    edges: z
      .array(DiagramEdgeSchema)
      .min(1)
      .max(30)
      .describe('Array of edges connecting nodes'),
  })
  .refine(
    (data) => {
      // All edge 'from' and 'to' must reference existing node IDs
      const nodeIds = new Set(data.nodes.map((n) => n.id));
      return data.edges.every((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
    },
    { message: 'All edges must reference existing node IDs in the nodes array.' }
  )
  .refine(
    (data) => {
      // Must have at least one start and one end node
      return data.nodes.some((n) => n.type === 'start');
    },
    { message: 'Diagram must have at least one "start" node.' }
  )
  .refine(
    (data) => {
      return data.nodes.some((n) => n.type === 'end');
    },
    { message: 'Diagram must have at least one "end" node.' }
  )
  .refine(
    (data) => {
      // Decision nodes must have at least 2 outgoing edges
      return data.nodes.every((node) => {
        if (node.type !== 'decision') return true;
        const outEdges = data.edges.filter((e) => e.from === node.id);
        return outEdges.length >= 2;
      });
    },
    { message: 'Decision nodes must have at least 2 outgoing edges.' }
  )
  .refine(
    (data) => {
      // No orphan nodes — every node must have at least one connection
      return data.nodes.every((node) => {
        return data.edges.some((e) => e.from === node.id || e.to === node.id);
      });
    },
    { message: 'No orphan nodes allowed — every node must have at least one edge.' }
  )
  .refine(
    (data) => {
      // Node labels must be unique (prevents merge conflicts in renderer)
      const labels = data.nodes.map((n) => n.label);
      return new Set(labels).size === labels.length;
    },
    { message: 'Node labels must be unique to prevent merge conflicts in rendering.' }
  );

export type DiagramDefinition = z.infer<typeof DiagramDefinitionSchema>;

// ───────────────────────────────────────────────────────────────
// Result Types
// ───────────────────────────────────────────────────────────────

/** The widget config that the renderer expects (matches DiagramProps in curriculum/schema.ts) */
export interface DiagramWidgetConfig {
  id: string;
  type: 'diagram';
  props: {
    diagramType: 'flowchart' | 'sequence' | 'class' | 'er' | 'custom';
    source: string;
    caption?: string;
  };
}

/** Full result returned by the orchestrator */
export interface DiagramGenerationResult {
  /** The markdown text explanation (always present) */
  text: string;
  /** The structured diagram definition (null if extraction failed) */
  diagram: DiagramDefinition | null;
  /** Complete widget config ready for rendering (null if merge failed) */
  widgetConfig: DiagramWidgetConfig | null;
  /** True if fell back to text-only because diagram generation failed */
  textOnlyFallback: boolean;
  /** Error message if any stage failed */
  error?: string;
}

/** Options for the diagram generation pipeline */
export interface DiagramGenerationOptions {
  /** Topic or concept to generate a diagram for (used in Stage 1) */
  topic?: string;
  /** Existing text explanation — skip Stage 1 if provided */
  existingText?: string;
  /** Unique ID for the diagram widget (default: "diagram-1") */
  widgetId?: string;
  /** AbortSignal to cancel generation */
  signal?: AbortSignal;
  /** Max retries for Stage 2 (default: 2) */
  maxRetries?: number;
}

// ───────────────────────────────────────────────────────────────
// System Prompts (one per stage)
// ───────────────────────────────────────────────────────────────

/**
 * Stage 1 System Prompt: Optimized for pedagogical text generation
 * with awareness of diagram-friendly structure.
 */
export const DIAGRAM_TEXT_SYSTEM_PROMPT = `You are an expert technical educator and visual thinker. Your job is to write clear, pedagogically sound explanations of concepts, processes, and architectures — with an eye toward how they can be visualized as diagrams.

When explaining a topic, always consider:
- What are the key components or steps? (these become NODES)
- How do they relate to each other? (these become EDGES)
- What are the entry points and terminal points? (start/end nodes)
- Where are there decision points or branches? (decision nodes)
- What data, signals, or control flows between components? (edge labels)

WRITING GUIDELINES:
1. Start with WHAT this concept is in the simplest possible terms (1-2 sentences)
2. Explain WHY it matters — what real-world problem does it solve? (2-3 sentences)
3. Explain HOW it works step by step, describing each component and its role
4. Describe relationships and flows between components EXPLICITLY
5. Use analogies where helpful to make abstract concepts concrete
6. Use concrete examples, not vague descriptions
7. Keep the total response between 200-400 words

Output ONLY markdown text. No JSON, no code blocks wrapping your entire output.
Do NOT include an H1 heading — just start with your introductory paragraph.`;

/**
 * Stage 2 System Prompt: Standard variant — optimized for structural accuracy.
 * The AI must output ONLY valid JSON matching the DiagramDefinition schema.
 */
export const DIAGRAM_EXTRACTION_SYSTEM_PROMPT = `You are a JSON API. You do NOT write prose, summaries, or explanations. You ONLY output valid JSON.

Your job: Extract a precise, structured diagram definition from the provided text explanation.
Focus purely on STRUCTURAL ACCURACY — identify components and their relationships.

ABSOLUTE RULES — VIOLATION MEANS FAILURE:
1. Your ENTIRE response must be a single JSON object. Nothing else.
2. Do NOT write introductory or concluding text.
3. Do NOT use markdown code blocks (no \`\`\`json).
4. The first character of your response MUST be "{"
5. The last character of your response MUST be "}"
6. ALL edges must reference existing node IDs.
7. EXACTLY ONE "start" node and AT LEAST ONE "end" node required.
8. Decision nodes MUST have at least 2 outgoing edges.

NODE TYPES:
- "start": Entry point of the flow (rounded terminal). Use for the initial input/trigger.
- "end": Terminal point (rounded terminal). Use for the final output/result.
- "process": A step, operation, or component (rectangle). Use for most steps.
- "decision": A branching point (diamond). Use where there's a conditional, question, or choice.

EDGE RULES:
- Every edge must connect two nodes that exist in the nodes array.
- Edge labels should be short (1-3 words) describing what triggers the transition.
- Decision nodes should have outgoing edges with labels like "Yes"/"No" or "Valid"/"Invalid".

NODE ID RULES:
- IDs must be kebab-case: lowercase letters/numbers separated by hyphens (e.g., "check-input", "send-response")
- IDs must be unique
- Keep them descriptive but short

NODE LABEL RULES:
- Labels must be 2-5 words, descriptive, and UNIQUE across all nodes
- No duplicate labels — each node must have a distinct label

Return this EXACT JSON shape:
{
  "diagramType": "flowchart",
  "title": "Short title for the diagram",
  "caption": "One sentence describing what this diagram shows",
  "nodes": [
    { "id": "user-request", "label": "User Request", "type": "start" },
    { "id": "validate", "label": "Validate Input", "type": "process" },
    { "id": "is-valid", "label": "Valid?", "type": "decision" },
    { "id": "process", "label": "Process Data", "type": "process" },
    { "id": "error", "label": "Return Error", "type": "end" },
    { "id": "response", "label": "Send Response", "type": "end" }
  ],
  "edges": [
    { "from": "user-request", "to": "validate" },
    { "from": "validate", "to": "is-valid" },
    { "from": "is-valid", "to": "process", "label": "Yes" },
    { "from": "is-valid", "to": "error", "label": "No" },
    { "from": "process", "to": "response" }
  ]
}

REMINDER: Your response must start with "{" and end with "}". NO prose outside JSON.`;

/**
 * Stage 2 Strict System Prompt: Used on retry when the standard prompt fails.
 * Even more constraints, fewer allowed nodes, more explicit rules.
 */
export const DIAGRAM_EXTRACTION_STRICT_PROMPT = `You are a JSON API. You ONLY output valid JSON. No prose, no markdown code fences, no explanations.

Your job: Extract a SIMPLE diagram from the provided text. Be EXTREMELY strict about structure.

ABSOLUTE RULES — ZERO TOLERANCE:
1. ENTIRE response is one JSON object. Nothing else. Not even a single word outside JSON.
2. First character: "{"
3. Last character: "}"
4. NO \`\`\`json code blocks wrapping your output.
5. ALL edges MUST reference existing node IDs — no dangling references.
6. EXACTLY ONE "start" node (the entry point).
7. EXACTLY ONE "end" node (the final result).
8. Decision nodes MUST have exactly 2 outgoing edges with labels "Yes" and "No".
9. Node IDs must be kebab-case (e.g., "check-input", "send-response").
10. Node labels must be 2-5 words, descriptive, and UNIQUE.
11. No more than 8 nodes total — keep it simple.
12. No more than 10 edges total.

Return this EXACT JSON shape:
{
  "diagramType": "flowchart",
  "title": "Diagram Title",
  "caption": "Brief one-sentence description",
  "nodes": [
    { "id": "start-node", "label": "Start", "type": "start" },
    { "id": "step-one", "label": "First Step", "type": "process" },
    { "id": "end-node", "label": "End Result", "type": "end" }
  ],
  "edges": [
    { "from": "start-node", "to": "step-one" },
    { "from": "step-one", "to": "end-node" }
  ]
}

REMINDER: Start with "{", end with "}". NOTHING ELSE. If you write even one word outside the JSON, the response is rejected.`;

// ───────────────────────────────────────────────────────────────
// Stage 1: Text Generation
// ───────────────────────────────────────────────────────────────

/**
 * **Stage 1 — Text Generation**
 *
 * Takes a topic/concept and generates a natural language explanation.
 * Focuses purely on pedagogical quality while being diagram-aware.
 *
 * The output is plain markdown text explaining:
 * - WHAT the concept is
 * - WHY it matters
 * - HOW it works (with explicit component/flow descriptions)
 *
 * @param topic - The concept or topic to explain
 * @param settings - AI provider settings
 * @param signal - Optional abort signal for cancellation
 * @returns Markdown text explaining the concept (200-400 words)
 * @throws Error if the AI call fails
 *
 * @example
 * ```ts
 * const text = await generateDiagramText('HTTP Request Lifecycle', settings);
 * // → "Every time you type a URL into your browser..."
 * ```
 */
export async function generateDiagramText(
  topic: string,
  settings: AISettings,
  signal?: AbortSignal
): Promise<string> {
  const userPrompt = `Explain the following topic in a way that highlights its components, relationships, and flows. Write as if you're teaching a junior engineer, focusing on what can be visualized as a flowchart diagram.

Topic: ${topic}

Remember:
- Start with WHAT it is (simple terms, assume zero knowledge)
- Then WHY it matters (real-world relevance)
- Then HOW it works step by step, naming each component and its role
- Describe how components connect and what flows between them
- 200-400 words total
- Output ONLY markdown (no JSON, no wrapping code fences, no H1 heading)`;

  const text = await generateRawCompletion(
    DIAGRAM_TEXT_SYSTEM_PROMPT,
    userPrompt,
    settings,
    { temperature: 0.5, signal }
  );

  return text.trim();
}

// ───────────────────────────────────────────────────────────────
// Stage 2: Diagram Extraction
// ───────────────────────────────────────────────────────────────

/**
 * **Stage 2 — Diagram Extraction**
 *
 * Takes a text explanation (or any provided text) and extracts a structured
 * diagram definition. Focuses purely on structural accuracy.
 *
 * The output is a JSON object matching the DiagramDefinitionSchema, containing:
 * - Array of nodes (id, label, type)
 * - Array of edges (from, to, optional label)
 * - Diagram type and metadata
 *
 * @param text - The markdown text to extract a diagram from
 * @param settings - AI provider settings
 * @param signal - Optional abort signal for cancellation
 * @param useStrictPrompt - Use the stricter prompt variant (for retries)
 * @returns Validated DiagramDefinition
 * @throws Error if extraction or validation fails
 *
 * @example
 * ```ts
 * const definition = await extractDiagram(text, settings);
 * // → { diagramType: "flowchart", nodes: [...], edges: [...] }
 * ```
 */
export async function extractDiagram(
  text: string,
  settings: AISettings,
  signal?: AbortSignal,
  useStrictPrompt: boolean = false
): Promise<DiagramDefinition> {
  const systemPrompt = useStrictPrompt
    ? DIAGRAM_EXTRACTION_STRICT_PROMPT
    : DIAGRAM_EXTRACTION_SYSTEM_PROMPT;

  // Truncate text to prevent token overflow
  const truncatedText = text.slice(0, 3000);

  const userPrompt = useStrictPrompt
    ? `Extract a SIMPLE diagram (max 8 nodes) from this text:

"""
${truncatedText}
"""

Return ONLY the JSON object. No prose, no code fences, nothing else.`
    : `Extract a structured diagram from the following text explanation.

TEXT:
"""
${truncatedText}
"""

Identify all key components (nodes) and their relationships (edges).
Return ONLY the JSON object — nothing else.`;

  const response = await generateRawCompletion(
    systemPrompt,
    userPrompt,
    settings,
    { temperature: 0.1, signal }
  );

  // Parse JSON from response (handles code fences, trailing prose, etc.)
  const parsed = extractJson(response);

  // Validate against Zod schema (includes semantic refinements)
  const result = DiagramDefinitionSchema.safeParse(parsed);

  if (!result.success) {
    const fieldErrors = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Diagram extraction validation failed:\n${fieldErrors}`);
  }

  return result.data;
}

// ───────────────────────────────────────────────────────────────
// Stage 3: Merge and Validate
// ───────────────────────────────────────────────────────────────

/**
 * Converts a structured DiagramDefinition into the Mermaid-like source
 * syntax that DiagramWidget expects for rendering.
 *
 * Syntax mapping:
 *   - start node → "Start"
 *   - end node → "End"
 *   - decision node → "{Label}"
 *   - process node → "Label"
 *   - edge → "Source --> Target" or "Source -->|Label| Target"
 *
 * @param definition - The structured diagram definition
 * @returns Mermaid-like source string for DiagramWidget
 */
export function diagramDefinitionToSource(
  definition: DiagramDefinition
): string {
  const lines: string[] = [];

  // Build a lookup from node ID to node data
  const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]));

  for (const edge of definition.edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);

    // Skip edges that reference missing nodes (shouldn't happen after validation)
    if (!fromNode || !toNode) continue;

    const fromSyntax = nodeToSyntax(fromNode);
    const toSyntax = nodeToSyntax(toNode);
    const arrow = edge.label ? `-->|${edge.label}|` : '-->';

    lines.push(`${fromSyntax} ${arrow} ${toSyntax}`);
  }

  return lines.join('\n');
}

/**
 * Converts a single DiagramNode to the DiagramWidget text syntax.
 *
 * @see DiagramWidget.parseDiagram for the parsing rules
 */
function nodeToSyntax(node: DiagramNode): string {
  if (node.type === 'start') return 'Start';
  if (node.type === 'end') return 'End';
  if (node.type === 'decision') return `{${node.label}}`;
  return node.label;
}

/**
 * **Stage 3 — Merge and Validate**
 *
 * Combines the text explanation with the diagram JSON definition,
 * converts the structured definition to the renderer's source syntax,
 * and returns a complete widget configuration ready for rendering.
 *
 * This is a pure function — no AI calls, no side effects.
 *
 * @param text - The markdown explanation text (preserved for context)
 * @param definition - The structured diagram definition
 * @param widgetId - Unique ID for the widget (default: "diagram-1")
 * @returns Complete DiagramWidgetConfig, or null if merge fails
 *
 * @example
 * ```ts
 * const config = mergeDiagram(text, definition, 'lesson-1-diagram');
 * // → { id: "lesson-1-diagram", type: "diagram", props: { ... } }
 * ```
 */
export function mergeDiagram(
  _text: string,
  definition: DiagramDefinition,
  widgetId: string = 'diagram-1'
): DiagramWidgetConfig | null {
  try {
    // Convert structured definition to source syntax for the renderer
    const source = diagramDefinitionToSource(definition);

    if (!source.trim()) {
      console.warn('[diagramGenerator] Merge produced empty source.');
      return null;
    }

    // Build the widget config matching DiagramProps in curriculum/schema.ts
    const config: DiagramWidgetConfig = {
      id: widgetId,
      type: 'diagram',
      props: {
        diagramType: definition.diagramType,
        source,
        caption: definition.caption || definition.title || undefined,
      },
    };

    return config;
  } catch (error) {
    console.error('[diagramGenerator] Merge failed:', error);
    return null;
  }
}

// ───────────────────────────────────────────────────────────────
// Orchestrator (full pipeline with retry + fallback)
// ───────────────────────────────────────────────────────────────

/**
 * **Full Pipeline Orchestrator**
 *
 * Runs the complete three-stage pipeline for generating context-aware diagrams:
 *   1. Generate text (or use existing text if provided)
 *   2. Extract diagram with retry logic
 *   3. Merge and validate into widget config
 *
 * **Retry behavior for Stage 2:**
 *   - Attempt 1: Standard extraction prompt (balanced approach)
 *   - Attempt 2: Strict extraction prompt (more constraints, simpler diagram)
 *   - If both fail: Returns text-only fallback
 *
 * **Fallback behavior:**
 *   - If Stage 1 fails: Returns error with empty text
 *   - If Stage 2 fails after all retries: Returns text-only result
 *   - If Stage 3 fails: Returns diagram + text but no widget config
 *
 * @param settings - AI provider settings
 * @param options - Generation options (topic, existingText, widgetId, etc.)
 * @returns Complete generation result with fallback handling
 *
 * @example
 * ```ts
 * // Generate from scratch
 * const result = await generateDiagram(settings, { topic: 'HTTP Request Lifecycle' });
 * if (result.widgetConfig) {
 *   // Render the diagram
 * }
 *
 * // Use existing text (skip Stage 1)
 * const result = await generateDiagram(settings, {
 *   existingText: lessonContent,
 *   widgetId: 'lesson-1-diagram'
 * });
 * ```
 */
export async function generateDiagram(
  settings: AISettings,
  options: DiagramGenerationOptions = {}
): Promise<DiagramGenerationResult> {
  const {
    topic,
    existingText,
    widgetId = 'diagram-1',
    signal,
    maxRetries = 2,
  } = options;

  // ── Validate input ──
  if (!topic && !existingText) {
    return {
      text: '',
      diagram: null,
      widgetConfig: null,
      textOnlyFallback: true,
      error: 'Either "topic" or "existingText" must be provided.',
    };
  }

  // ── Stage 1: Text Generation (or skip if existingText provided) ──
  let text: string;

  if (existingText) {
    text = existingText;
  } else {
    try {
      text = await generateDiagramText(topic!, settings, signal);
    } catch (error) {
      return {
        text: `# ${topic}\n\n⚠️ Failed to generate text explanation. Please check your AI connection and try again.`,
        diagram: null,
        widgetConfig: null,
        textOnlyFallback: true,
        error: `Stage 1 (Text Generation) failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // ── Stage 2: Diagram Extraction (with retries) ──
  let diagram: DiagramDefinition | null = null;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Use stricter prompt on retry attempts
      const useStrict = attempt > 0;
      diagram = await extractDiagram(text, settings, signal, useStrict);
      break; // Success!
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      console.warn(
        `[diagramGenerator] Stage 2 attempt ${attempt + 1}/${maxRetries + 1} failed:`,
        lastError
      );
      if (attempt < maxRetries) {
        // Brief pause before retry (gives the model a fresh shot)
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  if (!diagram) {
    // All retries exhausted — graceful fallback to text-only
    return {
      text,
      diagram: null,
      widgetConfig: null,
      textOnlyFallback: true,
      error: `Stage 2 (Diagram Extraction) failed after ${maxRetries + 1} attempts: ${lastError}`,
    };
  }

  // ── Stage 3: Merge and Validate ──
  const widgetConfig = mergeDiagram(text, diagram, widgetId);

  if (!widgetConfig) {
    return {
      text,
      diagram,
      widgetConfig: null,
      textOnlyFallback: true,
      error: 'Stage 3 (Merge & Validate) failed — could not produce valid widget config.',
    };
  }

  return {
    text,
    diagram,
    widgetConfig,
    textOnlyFallback: false,
  };
}
