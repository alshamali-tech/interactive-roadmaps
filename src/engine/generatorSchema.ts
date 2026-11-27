import { z } from 'zod';
import { truncateSmart } from './prompts';

// ───────────────────────────────────────────────────────────────
// Diagram Schema (W1.2 - Context-Aware Diagram final validation)
// Defined BEFORE WidgetConfigSchema so it can be referenced inline
// ───────────────────────────────────────────────────────────────

/** Allowed node types for diagrams */
export const DiagramNodeTypeSchema = z.enum([
  'input',
  'process',
  'decision',
  'output',
  'storage',
  'service',
]);
export type DiagramNodeType = z.infer<typeof DiagramNodeTypeSchema>;

/** Hex color string — #RGB or #RRGGBB (e.g. "#3b82f6"). */
export const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color — use #RGB or #RRGGBB.');

/** A single node in a diagram */
export const DiagramNodeSchema = z.object({
  id: z.string().min(1).describe('Unique node identifier'),
  label: z
    .string()
    .min(1)
    .max(20)
    .describe('Short display label (max 20 characters)'),
  type: DiagramNodeTypeSchema.describe('Visual node type'),
  description: z
    .string()
    .max(200)
    .optional()
    .describe('Optional description for tooltip/click detail'),
  color: HexColorSchema.optional().describe('Optional custom hex color for styling'),
  icon: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[A-Za-z][A-Za-z0-9-]*$/,
      'Invalid icon name — use a Lucide icon name (e.g. "database", "arrow-right").'
    )
    .optional()
    .describe('Optional Lucide icon name'),
});
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;

/** Optional custom edge styling (all fields optional). */
export const DiagramEdgeStyleSchema = z.object({
  stroke: HexColorSchema.optional().describe('Edge line color'),
  strokeWidth: z.number().min(0.5).max(10).optional().describe('Edge line width in px'),
  dashed: z.boolean().optional().describe('Render the edge as dashed'),
  opacity: z.number().min(0).max(1).optional().describe('Edge opacity (0-1)'),
});
export type DiagramEdgeStyle = z.infer<typeof DiagramEdgeStyleSchema>;

/** A single edge connecting two nodes */
export const DiagramEdgeSchema = z.object({
  from: z.string().min(1).describe('Source node ID (must exist in nodes array)'),
  to: z.string().min(1).describe('Target node ID (must exist in nodes array)'),
  label: z
    .string()
    .max(15)
    .optional()
    .describe('Short label on the edge (max 15 characters)'),
  animated: z
    .boolean()
    .optional()
    .describe('Animate the edge. Optional — when omitted it is treated as false (not animated).'),
  style: DiagramEdgeStyleSchema.optional().describe('Optional custom edge styling'),
});
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;

/** Allowed diagram types */
export const DiagramTypeSchema = z.enum([
  'flow',
  'relationship',
  'architecture',
  'sequence',
]);
export type DiagramType = z.infer<typeof DiagramTypeSchema>;

/**
 * DFS cycle detection for directed graphs — O(V+E).
 * Returns the cycle path (e.g. ['a', 'b', 'a']) or null when acyclic.
 * Assumes unique node IDs and edges referencing existing nodes
 * (the schema validates those first).
 */
function findCycle(nodes: DiagramNode[], edges: DiagramEdge[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];

  function dfs(nodeId: string): string[] | null {
    visited.add(nodeId);
    onStack.add(nodeId);
    stack.push(nodeId);

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (onStack.has(neighbor)) {
        // Cycle found — slice the current path from the first occurrence.
        return [...stack.slice(stack.indexOf(neighbor)), neighbor];
      }
      if (!visited.has(neighbor)) {
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      }
    }

    stack.pop();
    onStack.delete(nodeId);
    return null;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      const cycle = dfs(node.id);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Counts connected components treating edges as UNDIRECTED — O(V+E).
 * A structurally valid diagram must have exactly 1 component.
 * Assumes unique node IDs and edges referencing existing nodes.
 */
function countConnectedComponents(nodes: DiagramNode[], edges: DiagramEdge[]): number {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  const visited = new Set<string>();
  let components = 0;

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    components++;
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  return components;
}

/**
 * The complete diagram structure with semantic validation (W1.2).
 *
 * A single superRefine emits ONE issue PER violation (per duplicate ID,
 * per dangling edge endpoint, per orphan node, ...), so safeParse collects
 * ALL validation errors — not just the first one.
 *
 * Check order matters: edge references are validated BEFORE cycle detection
 * and connectivity analysis (those need a well-defined graph).
 */
export const DiagramSchema = z
  .object({
    type: DiagramTypeSchema.describe('Type of diagram'),
    title: z
      .string()
      .min(1)
      .max(50)
      .describe('Diagram title (max 50 characters)'),
    nodes: z
      .array(DiagramNodeSchema)
      .min(2)
      .max(8)
      .describe('Array of nodes (2-8 nodes)'),
    edges: z
      .array(DiagramEdgeSchema)
      .min(1)
      .max(10)
      .describe('Array of edges (1-10 edges)'),
  })
  .superRefine((data, ctx) => {
    const nodeIds = data.nodes.map((n) => n.id);
    const idSet = new Set(nodeIds);

    // ── Rule 4: Unique node IDs (report each duplicated ID once) ──
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const id of nodeIds) {
      if (seen.has(id) && !reported.has(id)) {
        reported.add(id);
        ctx.addIssue({ code: 'custom', path: ['nodes'], message: `Duplicate node ID: ${id}` });
      }
      seen.add(id);
    }
    const idsUnique = idSet.size === nodeIds.length;

    // ── Rule 1: Edge reference validation (runs BEFORE cycle detection) ──
    let danglingCount = 0;
    data.edges.forEach((edge, i) => {
      if (!idSet.has(edge.from)) {
        danglingCount++;
        ctx.addIssue({
          code: 'custom',
          path: ['edges', i, 'from'],
          message: `Edge references non-existent node: ${edge.from}`,
        });
      }
      if (!idSet.has(edge.to)) {
        danglingCount++;
        ctx.addIssue({
          code: 'custom',
          path: ['edges', i, 'to'],
          message: `Edge references non-existent node: ${edge.to}`,
        });
      }
    });
    const edgesValid = danglingCount === 0;
    const validEdges = edgesValid
      ? data.edges
      : data.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));

    // ── Rule 2: No orphan nodes (only edges with valid endpoints count) ──
    const connected = new Set<string>();
    for (const edge of validEdges) {
      connected.add(edge.from);
      connected.add(edge.to);
    }
    for (const id of idSet) {
      if (!connected.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: `Orphan node detected: ${id} has no connections`,
        });
      }
    }

    // Graph-shape rules need a well-defined graph (unique IDs + valid edges).
    if (idsUnique && edgesValid) {
      // ── Rule 3: Flow acyclicity (DFS, O(V+E)) ──
      if (data.type === 'flow') {
        const cycle = findCycle(data.nodes, data.edges);
        if (cycle) {
          ctx.addIssue({
            code: 'custom',
            path: ['edges'],
            message: `Flow diagrams must be acyclic. Cycle detected involving nodes: ${cycle.join(' → ')}`,
          });
        }
      }

      // ── Rule 5: Connected graph (undirected reachability) ──
      const subgraphs = countConnectedComponents(data.nodes, data.edges);
      if (subgraphs > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: `Disconnected graph detected. Subgraphs: ${subgraphs}`,
        });
      }
    }

    // ── Pedagogical rules (the extraction prompts teach these — keep in sync) ──
    if (data.type === 'flow') {
      if (!data.nodes.some((n) => n.type === 'input')) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: 'Flow diagrams must have at least one start node (type: "input").',
        });
      }
      if (!data.nodes.some((n) => n.type === 'output')) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: 'Flow diagrams must have at least one end node (type: "output").',
        });
      }
    }
    for (const node of data.nodes) {
      if (node.type !== 'decision') continue;
      const outgoing = validEdges.filter((e) => e.from === node.id).length;
      if (outgoing < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: `Decision node "${node.id}" must have at least 2 outgoing edges.`,
        });
      }
    }
  });

export type Diagram = z.infer<typeof DiagramSchema>;

/**
 * Result of {@link validateDiagram}.
 * On failure, `errors` contains ALL validation errors (one string per issue),
 * each prefixed with its field path when available (e.g. "edges.1.to: ...").
 */
export type DiagramValidationResult =
  | { valid: true; diagram: Diagram }
  | { valid: false; errors: string[] };

/**
 * Validates a diagram against the DiagramSchema (strict — never auto-fixes).
 *
 * Collects ALL validation errors, not just the first one: field-level errors,
 * duplicate IDs, dangling edge references, orphan nodes, cycles in flows,
 * disconnected subgraphs and the pedagogical rules are all reported together.
 *
 * @param data - The diagram data to validate (unknown — safe for AI output)
 * @returns `{ valid: true, diagram }` on success, `{ valid: false, errors }` on failure
 */
export function validateDiagram(data: unknown): DiagramValidationResult {
  const result = DiagramSchema.safeParse(data);
  if (result.success) {
    return { valid: true, diagram: result.data };
  }
  const errors = result.error.issues.map((issue) => {
    // Custom refinement messages name their offender directly ("Orphan node
    // detected: x has no connections"), so a bare field path would be redundant
    // noise. A path that reaches into an array element ("edges.1.to") instead
    // says *which* of several similar elements is at fault — information the
    // message itself lacks — so keep the prefix for those, and for all core Zod
    // field errors (Required, Invalid input, Too big...), which are generic.
    if (issue.code === 'custom' && issue.path.length <= 1) return issue.message;
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { valid: false, errors };
}

/** Formats validation errors into a single human/LLM-readable block (retry feedback). */
export function formatDiagramErrors(errors: string[]): string {
  return `Diagram validation failed:\n${errors.map((e) => `  • ${e}`).join('\n')}`;
}

/** Options for {@link fixCommonDiagramErrors}. */
export interface FixDiagramOptions {
  /**
   * Strict mode: validate the input exactly as given — never auto-fix.
   * Throws with all validation errors if the diagram is invalid.
   */
  strict?: boolean;
}

/**
 * Automatically fixes common structural diagram errors (weak-model rescue):
 *
 *   1. Removes duplicate node IDs (keeps the FIRST occurrence).
 *   2. Removes edges referencing non-existent nodes (and exact duplicate
 *      from→to pairs, which helps stay under the 10-edge limit).
 *   3. Connects orphan nodes to their nearest already-connected neighbor
 *      (nearest = closest in array order — deterministic, no coordinates).
 *      Input-type orphans point INTO the graph; all others receive an edge.
 *      Each orphan gains exactly one edge, so no cycle can be introduced.
 *      With no usable edges at all, nodes are chained in array order.
 *   4. Defaults a missing/empty title to "Untitled Diagram".
 *
 * The fixed candidate is then strictly validated — anything this function
 * cannot repair (cycles in flows, missing input/output nodes, bad decision
 * branches, field violations, >8 nodes, ...) throws with ALL remaining errors.
 *
 * Pure and deterministic: never mutates the input; same input → same output.
 *
 * @param diagram - The (possibly broken) diagram to repair
 * @param options - `{ strict: true }` disables all auto-fixing (validate only)
 * @returns A fully validated Diagram
 * @throws Error if the diagram is unfixable (message lists every remaining error)
 */
export function fixCommonDiagramErrors(
  diagram: Partial<Diagram>,
  options: FixDiagramOptions = {}
): Diagram {
  if (!diagram || typeof diagram !== 'object') {
    throw new Error('fixCommonDiagramErrors: input must be a diagram object.');
  }

  // Strict mode — no fixes at all; validate exactly what was given.
  if (options.strict) {
    const check = validateDiagram(diagram);
    if (!check.valid) throw new Error(formatDiagramErrors(check.errors));
    return check.diagram;
  }

  // ── Unfixable prerequisites ──
  const typeResult = DiagramTypeSchema.safeParse(diagram.type);
  if (!typeResult.success) {
    throw new Error(
      'Cannot auto-fix: missing or invalid diagram "type" (expected flow | relationship | architecture | sequence).'
    );
  }
  if (!Array.isArray(diagram.nodes) || diagram.nodes.length < 2) {
    throw new Error(
      `Cannot auto-fix: a diagram needs at least 2 nodes (got ${Array.isArray(diagram.nodes) ? diagram.nodes.length : 0}).`
    );
  }
  if (diagram.nodes.length > 8) {
    throw new Error(
      `Cannot auto-fix: more than 8 nodes (${diagram.nodes.length}) — remove nodes explicitly.`
    );
  }
  for (const node of diagram.nodes) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !node.id) {
      throw new Error('Cannot auto-fix: every node must be an object with a non-empty string "id".');
    }
  }

  // ── Fix 1: duplicate node IDs — keep the first occurrence ──
  const seenIds = new Set<string>();
  const nodes: DiagramNode[] = [];
  for (const node of diagram.nodes) {
    if (seenIds.has(node.id)) continue;
    seenIds.add(node.id);
    nodes.push(node);
  }

  // ── Fix 2: drop dangling edges + exact duplicate from→to pairs ──
  const rawEdges = Array.isArray(diagram.edges) ? diagram.edges : [];
  const seenPairs = new Set<string>();
  const edges: DiagramEdge[] = [];
  for (const edge of rawEdges) {
    if (!edge || typeof edge !== 'object') continue;
    if (typeof edge.from !== 'string' || typeof edge.to !== 'string') continue;
    if (!seenIds.has(edge.from) || !seenIds.has(edge.to)) continue;
    const pair = `${edge.from}\u0000${edge.to}`;
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    edges.push(edge);
  }

  // ── Fix 3: connect orphan nodes to their nearest neighbor ──
  const touched = new Set<string>();
  for (const edge of edges) {
    touched.add(edge.from);
    touched.add(edge.to);
  }

  const addEdge = (from: string, to: string): void => {
    if (edges.length >= 10) {
      throw new Error('Cannot auto-fix: connecting orphan nodes would exceed the 10-edge limit.');
    }
    edges.push({ from, to });
    touched.add(from);
    touched.add(to);
  };

  if (edges.length === 0) {
    // No usable edges at all — chain nodes in array order (≤7 edges, acyclic).
    for (let i = 0; i < nodes.length - 1; i++) {
      addEdge(nodes[i].id, nodes[i + 1].id);
    }
  } else {
    for (let i = 0; i < nodes.length; i++) {
      const orphan = nodes[i];
      if (touched.has(orphan.id)) continue;
      // Nearest = closest already-connected node in array order (search
      // outward from the orphan's position; ties prefer the earlier node).
      let neighbor: DiagramNode | null = null;
      for (let distance = 1; distance < nodes.length && !neighbor; distance++) {
        const before = nodes[i - distance];
        const after = nodes[i + distance];
        if (before && touched.has(before.id)) neighbor = before;
        else if (after && touched.has(after.id)) neighbor = after;
      }
      if (!neighbor) {
        throw new Error(
          `Cannot auto-fix: no connected neighbor available for orphan node "${orphan.id}".`
        );
      }
      // Input nodes are sources — point them at the graph; others receive.
      if (orphan.type === 'input') addEdge(orphan.id, neighbor.id);
      else addEdge(neighbor.id, orphan.id);
    }
  }

  const candidate: Diagram = {
    type: typeResult.data,
    title:
      typeof diagram.title === 'string' && diagram.title.trim()
        ? diagram.title
        : 'Untitled Diagram',
    nodes,
    edges,
  };

  // Final strict validation — throws with ALL remaining errors if unfixable.
  const check = validateDiagram(candidate);
  if (!check.valid) {
    throw new Error(formatDiagramErrors(check.errors));
  }
  return check.diagram;
}

// ───────────────────────────────────────────────────────────────
// Widget schema (shared across all stages)
// ───────────────────────────────────────────────────────────────

export const WidgetConfigSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('sandbox'),
    props: z.object({
      inputType: z.enum(['text', 'code']),
      outputType: z.enum(['text', 'html', 'json']),
      initialState: z.string(),
      processFunction: z.string().optional(),
      label: z.string().optional(),
      placeholder: z.string().optional(),
      tokenLimit: z.number().positive().optional(),
      widgetId: z.string().optional(),
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
      title: z.string().optional(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('trade-off'),
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
          scalability: z.number().min(1).max(10).default(5),
        }),
      })).min(2).max(4),
      explanation: z.string().optional(),
      requireJustification: z.boolean().optional(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('context-diagram'),
    props: z.object({
      diagram: DiagramSchema,
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('socratic-chat'),
    props: z.object({
      /** Chat mode: 'tutor' (default), 'interview', or 'challenge' */
      mode: z.enum(['tutor', 'interview', 'challenge']).default('tutor').describe('Chat mode: tutor (default), interview, or challenge'),
      /** Topic for interview mode (required when mode='interview') */
      topic: z.string().optional().describe('Topic for interview mode (required when mode="interview")'),
      /** Difficulty level for interview/challenge modes */
      difficulty: z.enum(['junior', 'mid', 'senior']).optional().default('mid').describe('Difficulty level for interview/challenge modes'),
      /** Time limit in minutes for interview/challenge modes */
      timeLimit: z.number().positive().optional().describe('Time limit in minutes for interview/challenge modes'),
      /** Maximum questions for interview mode (default: 5) */
      maxQuestions: z.number().positive().max(10).optional().default(5).describe('Maximum questions for interview mode (default: 5, max: 10)'),
      /** Array of challenge questions for challenge mode */
      challengeQuestions: z.array(z.object({
        question: z.string().describe('The challenge question text'),
        modelAnswer: z.string().describe('The expected correct answer'),
      })).optional().describe('Array of challenge questions for challenge mode'),
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
  suggestedDifficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  keyPoints: z.array(z.string()).min(1).max(5),
  widgetSuggestions: z.array(z.object({
    type: z.enum(['sandbox', 'mutator', 'trade-off', 'context-diagram', 'socratic-chat']),
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
// Prompts — Plan stage (shared by both generation modes)
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

export const buildPlanUserPrompt = (sourceContent: string, numLessons: number): string => {
  const { content: truncatedContent, strategy } = truncateSmart(sourceContent, 12000);

  return `
Analyze the source text below and create a plan for EXACTLY ${numLessons} focused lessons.

Source text${strategy !== 'full' ? ' (smart-truncated)' : ''}:
"""
${truncatedContent}
"""

Return this EXACT JSON shape:
{
  "title": "Course Title",
  "description": "One sentence describing what the course teaches",
  "lessons": [
    {
      "id": "lesson-1",
      "title": "Focused Lesson Title",
      "suggestedDifficulty": "beginner",
      "keyPoints": ["Key point 1", "Key point 2"],
      "widgetSuggestions": [
        { "type": "sandbox", "purpose": "What the user can try interactively" }
      ]
    }
  ]
}

Pedagogical rules:
- Generate EXACTLY ${numLessons} lessons (ids: lesson-1, lesson-2, ...)
- Each lesson covers ONE focused concept from the source
- Lessons MUST build progressively: start from absolute fundamentals (beginner), then build up to intermediate and advanced
- The FIRST lesson should always start from the most foundational concept — assume the reader knows NOTHING about the topic
- suggestedDifficulty: "beginner" for foundational concepts, "intermediate" for applied/practical topics, "advanced" for expert-level depth
- Key points: 2-3 short phrases summarizing what's taught

Widget suggestion guidelines:
- "sandbox": Best for concepts that benefit from experimentation — let users type code or text and see results. Use for: algorithms, data transformations, API patterns, syntax exercises.
- "mutator": Best for debugging practice and code comprehension — provide broken code that users must fix. Use for: common mistakes, anti-patterns, "spot the bug" exercises.
- "trade-off": Best for architectural or design decisions — present competing approaches with measurable trade-offs. Use for: choosing between technologies, patterns, or strategies.
- "context-diagram": Best for visualizing processes, flows, architectures, or relationships. Use for: system diagrams, flowcharts, sequences, component relationships.
- "socratic-chat": An AI-powered chat widget with three modes:
  - "tutor" (default): General help during lessons — guides the learner with Socratic questioning.
  - "interview": Mock technical interviews — place at the end of a module to test comprehensive knowledge. Specify topic, difficulty (junior/mid/senior), and optional timeLimit.
  - "challenge": Quick knowledge checks — place between lessons for rapid fire questions. Provide challengeQuestions array with question + modelAnswer pairs.
- Suggest 1 widget per lesson that best reinforces the lesson's core concept.
- The "purpose" field should describe a specific, actionable activity the learner can do.

REMINDER: Your response must start with "{" and end with "}". NO prose, NO summaries, NO explanations outside the JSON.`;
};

// ───────────────────────────────────────────────────────────────
// Prompts — Lesson stage: "structured" mode (JSON output)
// Used when generationMode = 'structured'. Best with strong models.
// ───────────────────────────────────────────────────────────────

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
  const { content: truncatedContent, strategy } = truncateSmart(sourceContent, 10000);

  const difficulty = targetLesson.suggestedDifficulty ?? 'beginner';

  // Build richer previous lesson context
  const isFirstLesson = previousLessons.length === 0;
  const previousContext = previousLessons.length > 0
    ? `\n\nPREVIOUS LESSONS ALREADY GENERATED (for coherence — do NOT repeat, but BUILD UPON these):\n${previousLessons.map((l) => {
        const planLesson = plan.lessons.find(pl => pl.id === l.id);
        const widgetTypes = l.content.widgets.map(w => w.type);
        const lDifficulty = l.metadata.difficulty;
        const keyPoints = planLesson?.keyPoints ?? [];
        return [
          `- ${l.id}: "${l.title}" (${lDifficulty}, ~${l.metadata.estimatedMinutes} min)`,
          keyPoints.length > 0 ? `  Concepts covered: ${keyPoints.join(', ')}` : '',
          widgetTypes.length > 0 ? `  Interactive elements used: ${[...new Set(widgetTypes)].join(', ')}` : '',
        ].filter(Boolean).join('\n');
      }).join('\n\n')}`
    : '';

  const audienceDescriptions: Record<string, string> = {
    beginner: `TARGET AUDIENCE: A complete beginner who has NEVER heard of this topic before.
- They do NOT know any technical terms related to this subject
- They need every concept explained from scratch using simple, everyday language
- Use analogies from daily life (cooking, driving, shopping, etc.) to make abstract concepts concrete
- NEVER assume they already know anything about this subject
- Define EVERY technical term the first time you use it (e.g., "A server — which is just a computer that runs 24/7 to handle requests — ...")`,
    intermediate: `TARGET AUDIENCE: Someone who knows the basics and wants deeper understanding.
- They understand fundamental terms (you don't need to define those again)
- They want to know HOW things work under the hood and WHY certain approaches are better
- Focus on practical application, common patterns, and best practices
- Still define any new or advanced terms the first time you use them`,
    advanced: `TARGET AUDIENCE: Someone already proficient who wants expert-level depth.
- Technical language is fine — they know the fundamentals
- Focus on nuance, trade-offs, edge cases, and real-world production considerations
- Discuss when NOT to use something, performance implications, and scaling concerns`,
  };

  const coherenceRule = isFirstLesson
    ? `COHERENCE: This is the FIRST lesson. Do NOT reference any previous lessons or say "Building on what you learned about...". Start fresh. The reader has zero context — teach them from the ground up.`
    : `COHERENCE: Reference previous lessons naturally where relevant (e.g., "Remember how we discussed X in the last lesson?"). Build on those concepts, don't repeat them. Increase complexity progressively.`;

  return `
COURSE PLAN:
${JSON.stringify(plan, null, 2)}

TARGET LESSON TO GENERATE: ${targetLesson.id} — "${targetLesson.title}"
Suggested difficulty: ${difficulty}
Key points to cover: ${targetLesson.keyPoints.join(', ')}
Widget suggestions: ${JSON.stringify(targetLesson.widgetSuggestions)}
${previousContext}

SOURCE TEXT${strategy !== 'full' ? ' (smart-truncated)' : ''}:
"""
${truncatedContent}
"""

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDUCATIONAL WRITING GUIDELINES (CRITICAL — READ CAREFULLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${audienceDescriptions[difficulty]}

THE "WHAT → WHY → HOW" RULE:
Every concept you explain MUST follow this pattern:
1. WHAT is it? — Define it in simple, concrete terms (one sentence a 10-year-old could understand)
2. WHY does it exist? — What real-world problem does it solve? What would happen without it?
3. HOW does it work? — The mechanics, step by step, with a concrete example

FIRST PARAGRAPH RULE (extremely important):
Your opening paragraph MUST do TWO things:
1. Tell the reader WHAT this topic is in the simplest possible terms
2. Tell them WHY they should care (connect it to something they already experience daily)
Do NOT start with vague phrases like "Let's dive into..." or "In this lesson we'll cover..."
Start with a concrete, grounded statement.

ZERO JARGON RULE:
- Never use a technical term without explaining it first
- After using a term, immediately define it in parentheses or a clause
- Example: "You need a database (a program that stores and organizes information, like a super-powered filing cabinet) to..."

${coherenceRule}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOOD vs BAD CONTENT EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ BAD (thin, assumes knowledge, vague):
"Building on what you learned about server-side logic, let's dive into backend development. Backend development focuses on server-side logic. In this lesson we'll cover handling user authentication and requests. Databases are a crucial component of any backend application."
Problems: assumes reader knows "server-side logic", "authentication", "requests". Says databases are "crucial" without explaining WHY or WHAT they are. No analogies, no depth.

✅ GOOD (teaches from scratch, uses analogies, explains WHY):
"Every time you open Instagram and see your personalized feed, a backend server made that happen. Backend development is all the work that happens behind the scenes — on powerful computers called servers that run 24/7 — to store your data, check your password, and figure out which posts to show you. Think of it like a restaurant: you see the menu and place your order (that's the frontend — what you interact with on your phone), but the kitchen is where the actual cooking happens. The kitchen is the backend. You never see it, but nothing works without it."
Why this is good: defines "backend" from scratch, uses a restaurant analogy everyone understands, explains WHY it matters, defines "server" inline, zero assumed knowledge.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate ONLY the lesson "${targetLesson.id}" with full markdown and widgets.

Return this EXACT JSON shape:
{
  "id": "${targetLesson.id}",
  "title": "${targetLesson.title}",
  "metadata": {
    "difficulty": "${difficulty}",
    "estimatedMinutes": 10,
    "tags": ["relevant", "tags"],
    "version": "1.0.0"
  },
  "prerequisites": [],
  "content": {
    "markdown": "[2-3 sentences: WHAT is this topic in simple terms + WHY should the reader care. Use an analogy. Make it concrete and engaging — NOT generic.]\\n\\n## What Is [Concept]?\\n\\n[Define the core concept in the simplest possible terms. Use an everyday analogy. Write 4-6 sentences that someone with ZERO prior knowledge could understand.]\\n\\n## Why Does [Concept] Matter?\\n\\n[Explain the real-world problem this solves. What would happen without it? Give a concrete scenario the reader can relate to. Write 4-6 sentences.]\\n\\n## How Does [Concept] Work?\\n\\n[Walk through the mechanics step by step. Use a concrete example or code snippet. Explain each line/piece. Write 6-8 sentences.]\\n\\n{{widget:${targetLesson.id}-widget-1}}\\n\\n## Putting It Together\\n\\n[Connect the concept to a bigger picture. Show how it fits into the overall system. Mention common tools or technologies used in practice. Write 4-6 sentences.]\\n\\n## Key Takeaways\\n\\n- [Most important insight from this lesson]\\n- [Second key point]\\n- [Third key point]",
    "widgets": [
      {
        "id": "${targetLesson.id}-widget-1",
        "type": "sandbox",
        "props": {
          "inputType": "text",
          "outputType": "text",
          "initialState": "Type something to experiment with...",
          "processFunction": "function process(input) {\\n  // Transform the input to demonstrate the concept\\n  return input.toUpperCase();\\n}"
        }
      }
    ]
  }
}

CONTENT DEPTH REQUIREMENTS:
- Write 800-1200 words of REAL educational content. Substance over brevity.
- Every section (## heading) must have 4-8 sentences of substantive explanation.
- Include code examples where relevant (use markdown code blocks: \\n\`\`\`language\\ncode here\\n\`\`\`\\n).
- Every abstract concept MUST be paired with a concrete example or analogy.
- Do NOT write placeholder text like "Intro paragraph" or "More explanation" — write ACTUAL educational content.
- The H1 (# ${targetLesson.title}) should NOT be included — it is added automatically. Start your markdown with the introductory paragraph directly.

STRUCTURE RULES:
- Use {{widget:widget-id}} syntax in the markdown to embed widgets inline
- Widget IDs MUST be prefixed with the lesson id (e.g., "${targetLesson.id}-widget-1")
- Allowed widget types: "sandbox", "mutator", "trade-off", "context-diagram", "socratic-chat"
- Sandbox props: inputType ("text"|"code"), outputType ("text"|"html"), initialState (string), processFunction (optional JS string with a process(input) function)
- Mutator props: language, brokenCode, hint, testCases (array of strings)
- Trade-off props: scenario, options array (each: id, name, description, pros[], cons[], metrics{cost,performance,complexity,scalability})
- Context-diagram props: diagram object (type, title, nodes[], edges[] — see DiagramSchema)
- Socratic-chat props: mode ("tutor"|"interview"|"challenge"), topic (string, required for interview), difficulty ("junior"|"mid"|"senior"), timeLimit (minutes, optional), maxQuestions (number, for interview), challengeQuestions (array of {question, modelAnswer} for challenge mode)
`;
};

// ───────────────────────────────────────────────────────────────
// Prompts — Lesson stage: "focused" mode (markdown + widget markers)
// Used when generationMode = 'focused'. Works with ANY model.
// The AI writes natural markdown; code parses the widget markers.
// ───────────────────────────────────────────────────────────────

export const FOCUSED_SYSTEM_PROMPT = `You are an expert educational content writer. You write clear, engaging lessons that teach concepts from scratch.

You output ONLY markdown text. No JSON, no code blocks wrapping your entire output.

Place interactive learning widgets directly in your content using :::widget markers (see examples below).

Do NOT write placeholder text like "Intro paragraph" or "More explanation" — write ACTUAL educational content with real explanations, analogies, and examples.`;

export const buildFocusedUserPrompt = (
  sourceContent: string,
  plan: CoursePlan,
  targetLesson: LessonPlan,
  previousLessons: GeneratedLesson[]
): string => {
  const { content: truncatedContent, strategy } = truncateSmart(sourceContent, 10000);

  const difficulty = targetLesson.suggestedDifficulty ?? 'beginner';
  const isFirstLesson = previousLessons.length === 0;

  const previousContext = previousLessons.length > 0
    ? `\n\nPREVIOUS LESSONS (for coherence — do NOT repeat, but BUILD UPON these):\n${previousLessons.map((l) => {
        const planLesson = plan.lessons.find(pl => pl.id === l.id);
        const widgetTypes = l.content.widgets.map(w => w.type);
        const keyPoints = planLesson?.keyPoints ?? [];
        return [
          `- "${l.title}" (${l.metadata.difficulty})`,
          keyPoints.length > 0 ? `  Covered: ${keyPoints.join(', ')}` : '',
          widgetTypes.length > 0 ? `  Widgets used: ${[...new Set(widgetTypes)].join(', ')}` : '',
        ].filter(Boolean).join('\n');
      }).join('\n')}`
    : '';

  const audienceDescriptions: Record<string, string> = {
    beginner: `Your reader has NEVER heard of this topic. Explain every concept from scratch using simple, everyday language. Use analogies (cooking, driving, shopping). Define EVERY technical term the first time you use it.`,
    intermediate: `Your reader knows the basics. Focus on HOW things work and WHY certain approaches are better. Still define advanced terms.`,
    advanced: `Your reader is already proficient. Focus on nuance, trade-offs, edge cases, and production considerations.`,
  };

  const coherenceRule = isFirstLesson
    ? `IMPORTANT: This is the FIRST lesson. Do NOT say "Building on what you learned..." or reference previous material. Start fresh — the reader has zero context.`
    : `Reference previous lessons naturally where relevant. Build on those concepts, don't repeat them.`;

  return `Write a lesson: "${targetLesson.title}"
Difficulty: ${difficulty}
Key points to cover: ${targetLesson.keyPoints.join(', ')}
${coherenceRule}${previousContext}

Source material${strategy !== 'full' ? ' (smart-truncated)' : ''}:
"""
${truncatedContent}
"""

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WRITING GUIDELINES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${audienceDescriptions[difficulty]}

Every concept MUST follow: WHAT is it → WHY it matters → HOW it works

Your opening paragraph MUST:
1. Tell the reader WHAT this topic is in the simplest possible terms
2. Tell them WHY they should care (connect to something they experience daily)
Do NOT start with "Let's dive into..." or "In this lesson..."

Never use a technical term without explaining it first.

Write 800-1200 words of REAL content. Every ## section needs 4-8 sentences.
Do NOT include an H1 (# title) — the title is added separately. Start with your opening paragraph.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WIDGET MARKER FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Place interactive widgets in your content using this syntax:

:::widget sandbox
label: [short label shown on the widget]
inputType: text
outputType: text
initialState: [what the user sees initially]
processFunction: [a JavaScript expression using "input" that transforms the input]
:::

:::widget mutator
title: [title like "Find the Bug"]
language: javascript
brokenCode: [the broken code snippet]
hint: [a hint without giving away the answer]
testCase: [a valid test input]
testCase: [an invalid test input]
:::

:::widget trade-off
scenario: [the decision the learner must make]
optionA_name: [name of first option]
optionA_description: [brief description]
optionA_pro: [one advantage]
optionA_pro: [another advantage]
optionA_con: [one disadvantage]
optionA_con: [another disadvantage]
optionB_name: [name of second option]
optionB_description: [brief description]
optionB_pro: [one advantage]
optionB_pro: [another advantage]
optionB_con: [one disadvantage]
optionB_con: [another disadvantage]
explanation: [why one might be better than the other]
:::

:::widget context-diagram
diagram: [a valid JSON object with type, title, nodes[], edges[] — see example below]
:::

:::widget socratic-chat
mode: tutor
:::

:::widget socratic-chat
mode: interview
topic: [the interview subject, e.g., "JavaScript Fundamentals"]
difficulty: mid
timeLimit: 30
maxQuestions: 5
:::

:::widget socratic-chat
mode: challenge
difficulty: mid
challengeQuestion: What is the output of typeof null?
challengeAnswer: "object"
challengeQuestion: What does the spread operator (...) do?
challengeAnswer: It expands an iterable into individual elements.
:::

Widget types and when to use them:
- sandbox: For concepts that benefit from experimentation (algorithms, data transforms, syntax)
- mutator: For debugging practice (broken code the user must fix)
- trade-off: For comparing approaches (choosing technologies, patterns, strategies)
- context-diagram: For visualizing processes, flows, architectures, or relationships. Use when a concept is best understood visually — e.g., request flows, component architectures, data pipelines, decision trees.
- socratic-chat: AI-powered chat with three modes. Use "tutor" for general lesson help. Use "interview" at the end of a module to test comprehensive knowledge. Use "challenge" for quick knowledge checks between lessons.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Example of good sandbox placement:

Every time you send a request to a server, the server processes it and sends back a response.
Try it yourself — type a request below and see what comes back:

:::widget sandbox
label: Try a request
inputType: text
outputType: text
initialState: Type: GET /users
processFunction: input.startsWith("GET") ? "200 OK: User data here" : "400 Bad Request: Unknown command"
:::

Example of good mutator placement:

One of the most common beginner mistakes is forgetting to handle errors when calling an API.
Can you spot what's wrong with this code?

:::widget mutator
title: Spot the Bug
language: javascript
brokenCode: function fetchUser(id) {\n  const data = api.get(id);\n  return data.name;\n}
hint: What happens if the API returns null or throws an error?
testCase: fetchUser(1)
testCase: fetchUser(999)
:::

Example of good trade-off placement:

When choosing a database, you need to decide between SQL and NoSQL approaches.
Which would you pick for a blog application?

:::widget trade-off
scenario: Choose a database for a blog application
optionA_name: PostgreSQL
optionA_description: Powerful relational database with ACID compliance
optionA_pro: Data integrity guaranteed
optionA_pro: Mature ecosystem and tools
optionA_con: More complex to set up
optionA_con: Harder to scale horizontally
optionB_name: MongoDB
optionB_description: Flexible document database
optionB_pro: Easy to get started
optionB_pro: Scales horizontally easily
optionB_con: No built-in data validation
optionB_con: No joins between collections
explanation: PostgreSQL is better for structured data with relationships, MongoDB for flexible schemas
:::

Example of good context-diagram placement:

Here's how a typical web request flows through the system:

:::widget context-diagram
diagram: {"type":"flow","title":"Web Request Flow","nodes":[{"id":"client","label":"Client","type":"input"},{"id":"dns","label":"DNS Lookup","type":"process"},{"id":"server","label":"Web Server","type":"service"},{"id":"db","label":"Database","type":"storage"},{"id":"response","label":"Response","type":"output"}],"edges":[{"from":"client","to":"dns"},{"from":"dns","to":"server"},{"from":"server","to":"db"},{"from":"server","to":"response"}]}
:::

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT TEMPLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Start with an engaging opening paragraph (WHAT is this topic + WHY care).
Then use ## headings:

## What Is [Concept]?
[Explain in simple terms with an analogy. 4-6 sentences.]

## Why Does It Matter?
[Real-world problem it solves. 4-6 sentences.]

## How Does It Work?
[Step by step mechanics with a concrete example. 6-8 sentences.]

[Place a widget here if it reinforces the concept]

## Putting It Together
[Connect to the bigger picture. Mention common tools. 4-6 sentences.]

## Key Takeaways
- Most important insight
- Second key point
- Third key point

Now write the full lesson. Output ONLY markdown — no JSON, no wrapping code fences.
`;
};
