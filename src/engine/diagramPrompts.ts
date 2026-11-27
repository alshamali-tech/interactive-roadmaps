/**
 * Diagram Generation Prompts (W1.1 — Staged Diagram Generation)
 *
 * Optimized system prompts for each stage of the diagram generation pipeline.
 * Each prompt is focused on a single task with clear constraints and output format.
 *
 * Stages:
 *   1. Text Generation — Pedagogical explanation + "Key components:" trailer (Stage 1)
 *   2. Diagram Extraction — Structured JSON matching the W1.2 DiagramSchema (Stage 2)
 *   2b. Diagram Extraction (Strict) — Retry variant with stricter rules (Stage 2 retry)
 *
 * NOTE: The text-only fallback (when all Stage 2 retries fail) is built
 * deterministically in code — see buildTextFallback() in diagramGenerator.ts.
 * No AI call is needed for the fallback, so it can never fail.
 *
 * NOTE: The original W1.3 brief asked Stage 1 to return {"text", "keyComponents"}
 * JSON. That was replaced on purpose: wrapping 200-400 words of prose in a JSON
 * string is the single most common weak-model failure (escaped newlines, unquoted
 * markdown), and Stage 1 output is never structurally validated anyway. The prose
 * plus a one-line trailer gives the same data with no parse step to fail.
 *
 * All prompts target the W1.2 schema in generatorSchema.ts:
 *   - diagram types: flow | relationship | architecture | sequence
 *   - node types:    input | process | decision | output | storage | service
 *   - 2-8 nodes, 1-10 edges, label ≤ 20 chars, edge label ≤ 15 chars,
 *     title ≤ 50 chars, description ≤ 200 chars
 */

import type { Diagram, DiagramType } from './generatorSchema';

// ───────────────────────────────────────────────────────────────
// Stage 1: Text Generation System Prompt
// ───────────────────────────────────────────────────────────────

/**
 * System prompt for Stage 1: Text Generation.
 *
 * **Role:** Expert technical educator.
 * **Task:** Explain the given concept focusing on relationships, flows, or architecture,
 * using the lesson context and previously covered concepts for coherence.
 * **Output:** 200–400 words of markdown text ending with a machine-readable
 * `Key components: A, B, C` trailer line. NO JSON or diagram syntax.
 *
 * The trailer is parsed deterministically by the generator to produce
 * `keyComponents` — the entities that become diagram nodes in Stage 2.
 */
export const DIAGRAM_TEXT_SYSTEM_PROMPT = `You are an expert technical educator and visual thinker. Your job is to write clear, pedagogically sound explanations of concepts, processes, and architectures — with an eye toward how they can be visualized as diagrams.

When explaining a topic, always consider:
- What are the key components or steps? (these become NODES)
- How do they relate to each other? (these become EDGES)
- What is the entry point and the final result? (input/output nodes)
- Where are there decision points or branches? (decision nodes)
- What data, signals, or control flows between components? (edge labels)

WRITING GUIDELINES:
1. Start with WHAT this concept is in the simplest possible terms (1-2 sentences)
2. Explain WHY it matters — what real-world problem does it solve? (2-3 sentences)
3. Explain HOW it works step by step, describing each component and its role
4. Describe relationships and flows between components EXPLICITLY
5. Use the provided lesson context and previously covered concepts to stay consistent — build on them, do NOT re-explain them
6. Use concrete examples and short analogies, not vague descriptions
7. Keep the total response between 200-400 words

OUTPUT FORMAT:
- Output ONLY markdown text. No JSON, no diagram syntax, no code blocks wrapping your entire output.
- Do NOT include an H1 heading — just start with your introductory paragraph.
- End your response with ONE final line in exactly this format:
Key components: Component A, Component B, Component C
- That line lists 3-8 key components/entities (the things that should become diagram nodes), comma-separated, each 20 characters or fewer.
- The names you list are reused VERBATIM as the diagram's node labels in the next stage, so write them as short, specific noun phrases with no trailing punctuation.

EXAMPLES OF A CORRECT FINAL LINE:

Topic: how a load balancer spreads traffic across servers
Key components: Client, Load Balancer, Web Server A, Web Server B, Health Check

Topic: how a database uses an index to answer a query
Key components: Incoming Query, Index Lookup, Table Scan, Result Set`;

// ───────────────────────────────────────────────────────────────
// Few-shot examples (typed against the W1.2 Diagram schema)
// ───────────────────────────────────────────────────────────────

/**
 * Few-shot example diagrams embedded in the Stage 2 extraction prompt.
 *
 * These are typed as `Diagram` and unit-tested against DiagramSchema,
 * guaranteeing the prompt never teaches the model an invalid shape.
 * One example per diagram type (flow, sequence, architecture, relationship).
 */
export const DIAGRAM_FEW_SHOT_DIAGRAMS: Diagram[] = [
  {
    type: 'flow',
    title: 'Form Submission Flow',
    nodes: [
      { id: 'submit', label: 'Form Submitted', type: 'input' },
      { id: 'validate', label: 'Validate Data', type: 'process' },
      { id: 'is-valid', label: 'Data Valid?', type: 'decision' },
      { id: 'save', label: 'Save to DB', type: 'process' },
      { id: 'error', label: 'Show Error', type: 'output' },
      {
        id: 'success',
        label: 'Confirmation',
        type: 'output',
        description: 'The user sees a success message after the data is stored.',
      },
    ],
    edges: [
      { from: 'submit', to: 'validate' },
      { from: 'validate', to: 'is-valid' },
      { from: 'is-valid', to: 'save', label: 'Yes' },
      { from: 'is-valid', to: 'error', label: 'No' },
      { from: 'save', to: 'success' },
    ],
  },
  {
    type: 'sequence',
    title: 'HTTP Request Cycle',
    nodes: [
      { id: 'client', label: 'Client Request', type: 'input' },
      { id: 'server', label: 'Server Handle', type: 'process' },
      { id: 'db-query', label: 'Query Database', type: 'process' },
      { id: 'response', label: 'Send Response', type: 'output' },
    ],
    edges: [
      { from: 'client', to: 'server', label: 'GET /users' },
      { from: 'server', to: 'db-query', label: 'SQL' },
      { from: 'db-query', to: 'response', label: 'rows' },
    ],
  },
  {
    type: 'architecture',
    title: 'Web App Architecture',
    nodes: [
      { id: 'frontend', label: 'Frontend UI', type: 'service' },
      { id: 'gateway', label: 'API Gateway', type: 'service' },
      { id: 'service', label: 'Microservice', type: 'process' },
      { id: 'cache', label: 'Cache Layer', type: 'storage' },
      { id: 'database', label: 'Database', type: 'storage' },
    ],
    edges: [
      { from: 'frontend', to: 'gateway', label: 'HTTP' },
      { from: 'gateway', to: 'service' },
      { from: 'service', to: 'cache', label: 'read' },
      { from: 'service', to: 'database', label: 'write' },
    ],
  },
  {
    type: 'relationship',
    title: 'Docker Concept Map',
    nodes: [
      { id: 'engine', label: 'Docker Engine', type: 'service' },
      { id: 'images', label: 'Images', type: 'storage' },
      { id: 'containers', label: 'Containers', type: 'process' },
      { id: 'registry', label: 'Registry', type: 'service' },
      { id: 'volumes', label: 'Volumes', type: 'storage' },
    ],
    edges: [
      { from: 'images', to: 'containers', label: 'runs as' },
      { from: 'engine', to: 'containers', label: 'manages' },
      { from: 'registry', to: 'images', label: 'distributes' },
      { from: 'engine', to: 'volumes', label: 'persists data' },
    ],
  },
];

const FEW_SHOT_INPUTS = [
  'When a user submits a form, the system first validates the data. If valid, it saves to the database and shows a confirmation. If invalid, it shows an error message.',
  'The client sends an HTTP request to the server. The server queries the database, receives the rows, and sends a response back to the client.',
  'A web application has a frontend that talks to an API gateway. The gateway routes requests to a microservice, which reads from a cache and writes to a database.',
  'Docker images run as containers. The Docker engine manages containers and persists data in volumes. A registry distributes images.',
];

const FEW_SHOT_LABELS = [
  'Flow (process workflow with a decision)',
  'Sequence (time-ordered interaction)',
  'Architecture (system components)',
  'Relationship (concept map)',
];

/**
 * Few-shot examples rendered as prompt text.
 * Built from the typed DIAGRAM_FEW_SHOT_DIAGRAMS so examples always match the schema.
 */
export const DIAGRAM_FEW_SHOT_EXAMPLES: string = DIAGRAM_FEW_SHOT_DIAGRAMS.map(
  (diagram, i) =>
    `EXAMPLE ${i + 1} — ${FEW_SHOT_LABELS[i]}:\nInput text: "${FEW_SHOT_INPUTS[i]}"\nOutput:\n${JSON.stringify(diagram, null, 2)}`
).join('\n\n');

// ───────────────────────────────────────────────────────────────
// Stage 2: Diagram Extraction System Prompt (Standard)
// ───────────────────────────────────────────────────────────────

/**
 * System prompt for Stage 2: Diagram Extraction (standard variant).
 *
 * **Role:** JSON API — structural accuracy only.
 * **Output:** ONLY valid JSON matching the W1.2 DiagramSchema.
 * Includes few-shot examples for all four diagram types.
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
7. Node IDs must be unique, kebab-case (e.g., "check-input", "send-response").
8. No orphan nodes — every node must connect to at least one edge.
9. All nodes must form ONE connected graph. Two small groups that share no edge between them are rejected, even when every node in each group is connected to something.

DIAGRAM TYPES — choose the most appropriate (or use the REQUIRED type if one is given):
- "flow": Step-by-step processes and workflows (DEFAULT — use when in doubt). Must be acyclic (no loops), with at least one "input" node (start) and at least one "output" node (end).
- "relationship": Concept maps and dependencies between ideas or components.
- "architecture": System structure — how services, storage, and components fit together.
- "sequence": Time-ordered interactions between actors (request/response chains).

NODE TYPES:
- "input": Entry point — where data, requests, or triggers enter (start of a flow).
- "process": A step, operation, or transformation.
- "decision": A branching point with a question. MUST have at least 2 outgoing edges (e.g., "Yes"/"No").
- "output": A final result or response (end of a flow).
- "storage": Databases, caches, files, queues — anything that holds data.
- "service": Servers, APIs, external systems, or applications.

SIZE AND FIELD CONSTRAINTS (enforced by a strict validator):
- 2-8 nodes total, 1-10 edges total — keep diagrams focused and readable
- "title": required, max 50 characters
- node "label": required, max 20 characters, short and descriptive
- node "id": required, unique, kebab-case
- node "description": optional, max 200 characters — one helpful sentence shown when the learner clicks the node
- edge "label": optional, max 15 characters (e.g., "Yes", "No", "HTTP", "SQL")

STYLING FIELDS: "color", "icon", "animated" and "style" are accepted but SHOULD BE OMITTED — the renderer styles every node type itself. If you do use one, an invalid format rejects the whole diagram: "color" must be hex (e.g. #3b82f6), "icon" must be letters/digits/hyphens only (e.g. database, arrow-right), "animated" must be true or false. When in doubt, leave them out.

Return this EXACT JSON shape:
{
  "type": "flow",
  "title": "Request Validation Flow",
  "nodes": [
    { "id": "user-request", "label": "User Request", "type": "input", "description": "The browser sends an HTTP request." },
    { "id": "validate", "label": "Validate Input", "type": "process" },
    { "id": "is-valid", "label": "Valid?", "type": "decision" },
    { "id": "process-data", "label": "Process Data", "type": "process" },
    { "id": "error", "label": "Return Error", "type": "output" },
    { "id": "response", "label": "Send Response", "type": "output" }
  ],
  "edges": [
    { "from": "user-request", "to": "validate" },
    { "from": "validate", "to": "is-valid" },
    { "from": "is-valid", "to": "process-data", "label": "Yes" },
    { "from": "is-valid", "to": "error", "label": "No" },
    { "from": "process-data", "to": "response" }
  ]
}

${DIAGRAM_FEW_SHOT_EXAMPLES}

REMINDER: Your response must start with "{" and end with "}". NO prose outside JSON.`;

// ───────────────────────────────────────────────────────────────
// Stage 2: Diagram Extraction System Prompt (Strict/Retry)
// ───────────────────────────────────────────────────────────────

/**
 * System prompt for Stage 2 retry: Diagram Extraction (stricter variant).
 *
 * Used when the standard prompt fails validation. Fewer nodes, simpler
 * structure, and an explicit list of the mistakes that cause rejection.
 * The specific validator errors from the failed attempt are appended to
 * the user prompt (see buildDiagramExtractionUserPrompt).
 */
export const DIAGRAM_EXTRACTION_STRICT_PROMPT = `You are a JSON API. You ONLY output valid JSON. No prose, no markdown code fences, no explanations.

Your job: Extract a SIMPLE diagram from the provided text. Be EXTREMELY strict about structure.

ABSOLUTE RULES — ZERO TOLERANCE:
1. ENTIRE response is one JSON object. Nothing else. Not even a single word outside JSON.
2. First character MUST be "{"
3. Last character MUST be "}"
4. NO \`\`\`json code blocks wrapping your output.
5. ALL edges MUST reference existing node IDs — no dangling references.
6. Node IDs must be unique and kebab-case (e.g., "check-input", "send-response").
7. Node labels: max 20 characters. Edge labels: max 15 characters. Title: max 50 characters. Node descriptions: max 200 characters.
8. No more than 5 nodes total — keep it SIMPLE. Prefer a linear structure.
9. No more than 6 edges total.
10. For "flow" type: at least one "input" node, at least one "output" node, and NO cycles.
11. Avoid "decision" nodes unless the text clearly describes a branch. If you use one, it MUST have at least 2 outgoing edges labeled "Yes" and "No".
12. Every node must be reachable from every other node (ignoring arrow direction) — ONE connected graph, and at least 2 nodes.
13. Do NOT output "color", "icon", "style" or "animated". Emit only type, title, nodes and edges.

COMMON MISTAKES THAT CAUSE REJECTION — AVOID THESE:
❌ Dangling edges — "from"/"to" references a node ID that doesn't exist in the nodes array
❌ Orphan nodes — nodes never connected by any edge
❌ Disconnected subgraphs — two groups of nodes with no edge linking the groups. This is NOT the same as an orphan: every node can be connected to a neighbour and still be rejected because the graph is split in two
❌ Cycles in "flow" diagrams — following edges leads back to a previous node
❌ Duplicate node IDs
❌ Missing "input" or "output" node in a "flow" diagram
❌ Decision nodes with only one outgoing edge
❌ Labels longer than 20 characters

VALID NODE TYPES: "input", "process", "decision", "output", "storage", "service"
VALID DIAGRAM TYPES: "flow", "relationship", "architecture", "sequence"

Return this EXACT JSON shape:
{
  "type": "flow",
  "title": "Diagram Title",
  "nodes": [
    { "id": "start-node", "label": "Start", "type": "input" },
    { "id": "step-one", "label": "First Step", "type": "process" },
    { "id": "end-node", "label": "End Result", "type": "output" }
  ],
  "edges": [
    { "from": "start-node", "to": "step-one" },
    { "from": "step-one", "to": "end-node" }
  ]
}

REMINDER: Start with "{", end with "}". NOTHING ELSE. If you write even one word outside the JSON, the response is rejected.`;

// ───────────────────────────────────────────────────────────────
// User prompt builders
// ───────────────────────────────────────────────────────────────

/** Maximum characters of lesson context passed to Stage 1 (token safety). */
const CONTEXT_CHAR_LIMIT = 6000;
/** Maximum characters of explanation text passed to Stage 2 (token safety). */
const TEXT_CHAR_LIMIT = 4000;
/** Must equal the "No more than 5 nodes" cap in DIAGRAM_EXTRACTION_STRICT_PROMPT. */
const STRICT_NODE_BUDGET = 5;

/**
 * Builds the Stage 1 user prompt.
 *
 * @param topic - The concept to explain
 * @param context - Surrounding lesson/course context (smart-truncated)
 * @param previousConcept - Concepts already covered (for coherence)
 */
export function buildDiagramTextUserPrompt(
  topic: string,
  context: string,
  previousConcept: string[]
): string {
  const trimmedContext = context.trim().slice(0, CONTEXT_CHAR_LIMIT);
  const conceptsBlock =
    previousConcept.length > 0
      ? previousConcept.map((c) => `- ${c}`).join('\n')
      : '(none — this is the first concept)';

  return `Explain the following topic in a way that highlights its components, relationships, and flows. Write as if you're teaching a junior engineer.

Topic: ${topic}

LESSON CONTEXT (where this explanation will appear):
"""
${trimmedContext || '(no additional context provided)'}
"""

PREVIOUSLY COVERED CONCEPTS (build on these — do NOT re-explain them):
${conceptsBlock}

Remember:
- Follow WHAT → WHY → HOW
- Name each component and describe how components connect and what flows between them
- 200-400 words total
- Output ONLY markdown (no JSON, no wrapping code fences, no H1 heading)
- Finish with the final trailer line: Key components: A, B, C (3-8 items, each 20 characters or fewer)`;
}

/** Options for the Stage 2 user prompt builder. */
export interface ExtractionPromptOptions {
  /** Use the simpler/stricter instruction variant (retry attempts). */
  strict?: boolean;
  /** Validator error message from the previous failed attempt (retry feedback). */
  validationError?: string;
}

/**
 * Builds the Stage 2 user prompt.
 *
 * Deterministic: the same inputs always produce the same prompt
 * (required for Stage 2 idempotency).
 *
 * @param text - The explanation text to extract a diagram from
 * @param keyComponents - Entities from Stage 1 that should become nodes
 * @param diagramType - Force a specific diagram type (otherwise the model chooses)
 * @param options - Strict variant + validator error feedback for retries
 */
export function buildDiagramExtractionUserPrompt(
  text: string,
  keyComponents: string[],
  diagramType?: DiagramType,
  options: ExtractionPromptOptions = {}
): string {
  const truncatedText = text.slice(0, TEXT_CHAR_LIMIT);

  // Stage 1 is told to name 3-8 components, but the strict retry prompt caps the
  // diagram at STRICT_NODE_BUDGET nodes. Listing all 8 during a retry orders the
  // model to do two incompatible things at once, so the list is clamped instead.
  const listedComponents = options.strict
    ? keyComponents.slice(0, STRICT_NODE_BUDGET)
    : keyComponents;

  let componentsBlock: string;
  if (listedComponents.length === 0) {
    componentsBlock =
      'KEY COMPONENTS: not provided — identify the most important components from the text yourself.';
  } else {
    const bullets = listedComponents.map((c) => `- ${c}`).join('\n');
    componentsBlock = options.strict
      ? `KEY COMPONENTS (map these directly to nodes — do NOT add extra nodes):\n${bullets}`
      : `KEY COMPONENTS (use these as the primary nodes — you may add 1-2 connecting nodes if needed):\n${bullets}`;
  }

  const typeBlock = diagramType
    ? `REQUIRED DIAGRAM TYPE: "${diagramType}" — you MUST use exactly this type.`
    : 'DIAGRAM TYPE: choose the most appropriate of "flow", "relationship", "architecture", "sequence".';

  const errorBlock = options.validationError
    ? `\nYOUR PREVIOUS ATTEMPT WAS REJECTED BY THE VALIDATOR. Fix these EXACT problems:\n${options.validationError}\nDo not repeat these mistakes.\nKeep the same conceptual structure as your previous attempt — the same topic and essentially the same components. Make the smallest changes that satisfy the validator (shorten a label, drop or reconnect an edge, merge a redundant node); do NOT redesign the diagram or switch to unrelated components.\n`
    : '';

  const taskLine = options.strict
    ? `Extract a SIMPLE diagram (max 5 nodes, prefer a linear structure) from this text:`
    : `Extract a structured diagram from the following text explanation. Identify all key components (nodes) and their relationships (edges).`;

  return `${taskLine}

TEXT:
"""
${truncatedText}
"""

${componentsBlock}

${typeBlock}
${errorBlock}
Return ONLY the JSON object — no prose, no code fences, nothing else.`;
}
