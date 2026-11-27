/**
 * W1.2 — Diagram Zod Schema Definition (full coverage)
 *
 * Covers:
 *   - Field-level schemas (node, edge, style, color, icon, animated)
 *   - Structural limits (2-8 nodes, 1-10 edges, label/title lengths)
 *   - Rule 1: edge reference validation (with offending node ID)
 *   - Rule 2: no orphan nodes (with offending node ID)
 *   - Rule 3: flow acyclicity (DFS, lists the cycle nodes)
 *   - Rule 4: unique node IDs (with offending ID)
 *   - Rule 5: connected graph (reports subgraph count)
 *   - Pedagogical rules (flow input/output, decision branches)
 *   - validateDiagram: { valid, diagram } / { valid, errors[] } — ALL errors
 *   - fixCommonDiagramErrors: auto-fixes + strict mode + unfixable throws
 */
import { describe, it, expect } from 'vitest';
import {
  DiagramSchema,
  DiagramNodeSchema,
  DiagramEdgeSchema,
  DiagramNodeTypeSchema,
  DiagramTypeSchema,
  DiagramEdgeStyleSchema,
  HexColorSchema,
  validateDiagram,
  formatDiagramErrors,
  fixCommonDiagramErrors,
  type Diagram,
} from './generatorSchema';

// ───────────────────────────────────────────────────────────────
// Fixtures & helpers
// ───────────────────────────────────────────────────────────────

/** Fresh minimal valid flow diagram (input → process → output). */
function makeFlow(): Diagram {
  return {
    type: 'flow',
    title: 'Test Flow',
    nodes: [
      { id: 'start', label: 'Start', type: 'input' },
      { id: 'process', label: 'Process', type: 'process' },
      { id: 'end', label: 'End', type: 'output' },
    ],
    edges: [
      { from: 'start', to: 'process' },
      { from: 'process', to: 'end' },
    ],
  };
}

/** Validates and returns ALL error strings (fails the test if valid). */
function errorsOf(data: unknown): string[] {
  const result = validateDiagram(data);
  if (result.valid) {
    throw new Error('Expected diagram to be invalid, but it passed validation.');
  }
  return result.errors;
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const value of Object.values(obj as Record<string, unknown>)) {
      deepFreeze(value);
    }
  }
  return obj;
}

// ───────────────────────────────────────────────────────────────
// DiagramNodeSchema (field level)
// ───────────────────────────────────────────────────────────────

describe('DiagramNodeSchema', () => {
  it('accepts a minimal node (id, label, type)', () => {
    const result = DiagramNodeSchema.safeParse({ id: 'a', label: 'A', type: 'process' });
    expect(result.success).toBe(true);
  });

  it('accepts optional description, color and icon', () => {
    const result = DiagramNodeSchema.safeParse({
      id: 'db',
      label: 'Database',
      type: 'storage',
      description: 'Stores the data.',
      color: '#3b82f6',
      icon: 'database',
    });
    expect(result.success).toBe(true);
  });

  it('rejects labels longer than 20 characters', () => {
    const result = DiagramNodeSchema.safeParse({ id: 'a', label: 'L'.repeat(21), type: 'process' });
    expect(result.success).toBe(false);
  });

  it('rejects empty labels and empty ids', () => {
    expect(DiagramNodeSchema.safeParse({ id: 'a', label: '', type: 'process' }).success).toBe(false);
    expect(DiagramNodeSchema.safeParse({ id: '', label: 'A', type: 'process' }).success).toBe(false);
  });

  it('rejects invalid node types', () => {
    const result = DiagramNodeSchema.safeParse({ id: 'a', label: 'A', type: 'terminal' });
    expect(result.success).toBe(false);
  });

  it('accepts 3-digit and 6-digit hex colors', () => {
    expect(DiagramNodeSchema.safeParse({ id: 'a', label: 'A', type: 'process', color: '#abc' }).success).toBe(true);
    expect(DiagramNodeSchema.safeParse({ id: 'a', label: 'A', type: 'process', color: '#A1B2C3' }).success).toBe(true);
  });

  it('rejects non-hex colors', () => {
    for (const color of ['red', '#12345', 'ff0000', '#gggggg']) {
      expect(DiagramNodeSchema.safeParse({ id: 'a', label: 'A', type: 'process', color }).success).toBe(false);
    }
  });

  it('accepts kebab-case and PascalCase Lucide icon names', () => {
    expect(DiagramNodeSchema.safeParse({ id: 'a', label: 'A', type: 'process', icon: 'arrow-right' }).success).toBe(true);
    expect(DiagramNodeSchema.safeParse({ id: 'a', label: 'A', type: 'process', icon: 'Database' }).success).toBe(true);
  });

  it('rejects icon names with spaces or invalid characters', () => {
    expect(DiagramNodeSchema.safeParse({ id: 'a', label: 'A', type: 'process', icon: 'bad icon' }).success).toBe(false);
    expect(DiagramNodeSchema.safeParse({ id: 'a', label: 'A', type: 'process', icon: 'icon!' }).success).toBe(false);
  });

  it('rejects descriptions longer than 200 characters', () => {
    const result = DiagramNodeSchema.safeParse({
      id: 'a', label: 'A', type: 'process', description: 'D'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
// DiagramEdgeSchema (field level)
// ───────────────────────────────────────────────────────────────

describe('DiagramEdgeSchema', () => {
  it('accepts a minimal edge (from, to)', () => {
    const result = DiagramEdgeSchema.safeParse({ from: 'a', to: 'b' });
    expect(result.success).toBe(true);
  });

  it('does not inject keys when optional fields are omitted (animated stays absent = false)', () => {
    const result = DiagramEdgeSchema.parse({ from: 'a', to: 'b' });
    expect(result).toEqual({ from: 'a', to: 'b' });
  });

  it('accepts label, animated and style', () => {
    const result = DiagramEdgeSchema.safeParse({
      from: 'a',
      to: 'b',
      label: 'HTTP',
      animated: true,
      style: { stroke: '#ff0000', strokeWidth: 2, dashed: true, opacity: 0.5 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects labels longer than 15 characters', () => {
    const result = DiagramEdgeSchema.safeParse({ from: 'a', to: 'b', label: 'L'.repeat(16) });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean animated', () => {
    const result = DiagramEdgeSchema.safeParse({ from: 'a', to: 'b', animated: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid style values', () => {
    expect(DiagramEdgeSchema.safeParse({ from: 'a', to: 'b', style: { strokeWidth: 'thick' } }).success).toBe(false);
    expect(DiagramEdgeSchema.safeParse({ from: 'a', to: 'b', style: { stroke: 'blue' } }).success).toBe(false);
    expect(DiagramEdgeSchema.safeParse({ from: 'a', to: 'b', style: { opacity: 2 } }).success).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
// DiagramSchema — structure & limits
// ───────────────────────────────────────────────────────────────

describe('DiagramSchema — structure', () => {
  it('accepts a valid flow diagram and returns it unchanged (no key injection)', () => {
    const diagram = makeFlow();
    const result = DiagramSchema.safeParse(diagram);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(diagram);
  });

  it('accepts a valid relationship diagram', () => {
    const result = DiagramSchema.safeParse({
      type: 'relationship',
      title: 'System Components',
      nodes: [
        { id: 'db', label: 'Database', type: 'storage' },
        { id: 'api', label: 'API Server', type: 'service' },
      ],
      edges: [{ from: 'db', to: 'api' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid architecture diagram (cycles allowed)', () => {
    const result = DiagramSchema.safeParse({
      type: 'architecture',
      title: 'Microservices',
      nodes: [
        { id: 'gw', label: 'API Gateway', type: 'service' },
        { id: 'auth', label: 'Auth Service', type: 'service' },
        { id: 'users', label: 'User Service', type: 'service' },
      ],
      edges: [
        { from: 'gw', to: 'auth' },
        { from: 'gw', to: 'users' },
        { from: 'users', to: 'gw' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid sequence diagram (return edges allowed)', () => {
    const result = DiagramSchema.safeParse({
      type: 'sequence',
      title: 'Login Flow',
      nodes: [
        { id: 'user', label: 'User', type: 'input' },
        { id: 'ui', label: 'Login Form', type: 'process' },
        { id: 'api', label: 'Auth API', type: 'service' },
      ],
      edges: [
        { from: 'user', to: 'ui' },
        { from: 'ui', to: 'api' },
        { from: 'api', to: 'ui', label: 'Token' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects fewer than 2 nodes', () => {
    const errors = errorsOf({ ...makeFlow(), nodes: [{ id: 'only', label: 'Only', type: 'process' }], edges: [] });
    expect(errors.some((e) => e.includes('nodes'))).toBe(true);
  });

  it('rejects more than 8 nodes', () => {
    const errors = errorsOf({
      ...makeFlow(),
      nodes: Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, type: 'process' as const })),
      edges: Array.from({ length: 8 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
    });
    expect(errors.some((e) => e.includes('nodes'))).toBe(true);
  });

  it('rejects fewer than 1 edge', () => {
    const errors = errorsOf({ ...makeFlow(), edges: [] });
    expect(errors.some((e) => e.includes('edges'))).toBe(true);
  });

  it('rejects more than 10 edges', () => {
    const errors = errorsOf({
      type: 'relationship',
      title: 'Too Many Edges',
      nodes: [
        { id: 'a', label: 'A', type: 'service' },
        { id: 'b', label: 'B', type: 'service' },
      ],
      edges: Array.from({ length: 11 }, () => ({ from: 'a', to: 'b' })),
    });
    expect(errors.some((e) => e.includes('edges'))).toBe(true);
  });

  it('rejects empty or over-long titles (>50)', () => {
    expect(errorsOf({ ...makeFlow(), title: '' }).some((e) => e.includes('title'))).toBe(true);
    expect(errorsOf({ ...makeFlow(), title: 'T'.repeat(51) }).some((e) => e.includes('title'))).toBe(true);
  });

  it('rejects invalid diagram types', () => {
    expect(errorsOf({ ...makeFlow(), type: 'mindmap' }).some((e) => e.includes('type'))).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// Rule 1 — Edge reference validation
// ───────────────────────────────────────────────────────────────

describe('Rule 1 — edge references', () => {
  it('reports the exact non-existent node ID (dangling "to")', () => {
    const errors = errorsOf({
      ...makeFlow(),
      edges: [{ from: 'start', to: 'process' }, { from: 'process', to: 'ghost' }],
    });
    expect(errors).toContain('edges.1.to: Edge references non-existent node: ghost');
  });

  it('reports the exact non-existent node ID (dangling "from")', () => {
    const errors = errorsOf({
      ...makeFlow(),
      edges: [{ from: 'ghost', to: 'process' }, { from: 'process', to: 'end' }],
    });
    expect(errors).toContain('edges.0.from: Edge references non-existent node: ghost');
  });

  it('reports EVERY dangling reference, not just the first', () => {
    const errors = errorsOf({
      ...makeFlow(),
      edges: [{ from: 'ghost1', to: 'process' }, { from: 'process', to: 'ghost2' }],
    });
    expect(errors.some((e) => e.includes('Edge references non-existent node: ghost1'))).toBe(true);
    expect(errors.some((e) => e.includes('Edge references non-existent node: ghost2'))).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// Rule 2 — No orphan nodes
// ───────────────────────────────────────────────────────────────

describe('Rule 2 — orphan nodes', () => {
  it('reports the exact orphan node ID', () => {
    const errors = errorsOf({
      ...makeFlow(),
      nodes: [...makeFlow().nodes, { id: 'lonely', label: 'Lonely', type: 'process' }],
    });
    expect(errors).toContain('Orphan node detected: lonely has no connections');
  });

  it('reports every orphan node', () => {
    const errors = errorsOf({
      ...makeFlow(),
      nodes: [
        ...makeFlow().nodes,
        { id: 'lonely1', label: 'Lonely 1', type: 'process' },
        { id: 'lonely2', label: 'Lonely 2', type: 'process' },
      ],
    });
    expect(errors).toContain('Orphan node detected: lonely1 has no connections');
    expect(errors).toContain('Orphan node detected: lonely2 has no connections');
  });
});

// ───────────────────────────────────────────────────────────────
// Rule 3 — Flow acyclicity
// ───────────────────────────────────────────────────────────────

describe('Rule 3 — flow acyclicity', () => {
  it('fails a 2-node cycle and lists the cycle nodes', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'Cyclic Flow',
      nodes: [
        { id: 'a', label: 'A', type: 'input' },
        { id: 'b', label: 'B', type: 'output' },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
    });
    expect(errors).toEqual([
      'Flow diagrams must be acyclic. Cycle detected involving nodes: a → b → a',
    ]);
  });

  it('lists all nodes of a 3-node cycle', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'Cyclic Flow',
      nodes: [
        { id: 'a', label: 'A', type: 'input' },
        { id: 'b', label: 'B', type: 'process' },
        { id: 'c', label: 'C', type: 'output' },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }],
    });
    expect(errors).toContain(
      'Flow diagrams must be acyclic. Cycle detected involving nodes: a → b → c → a'
    );
  });

  it('detects self-loops in flow diagrams', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'Self Loop',
      nodes: [
        { id: 'a', label: 'A', type: 'input' },
        { id: 'b', label: 'B', type: 'output' },
      ],
      edges: [{ from: 'a', to: 'a' }, { from: 'a', to: 'b' }],
    });
    expect(errors).toContain(
      'Flow diagrams must be acyclic. Cycle detected involving nodes: a → a'
    );
  });

  it('allows cycles in relationship diagrams', () => {
    const result = validateDiagram({
      type: 'relationship',
      title: 'Mutual Dependence',
      nodes: [
        { id: 'a', label: 'Component A', type: 'service' },
        { id: 'b', label: 'Component B', type: 'service' },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
    });
    expect(result.valid).toBe(true);
  });

  it('allows self-loops in architecture diagrams', () => {
    const result = validateDiagram({
      type: 'architecture',
      title: 'Self Referencing',
      nodes: [
        { id: 'a', label: 'Service A', type: 'service' },
        { id: 'b', label: 'Service B', type: 'service' },
      ],
      edges: [{ from: 'a', to: 'a' }, { from: 'a', to: 'b' }],
    });
    expect(result.valid).toBe(true);
  });

  it('validates edge references BEFORE cycle detection (dangling edges suppress cycle errors)', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'Dangling And Cyclic',
      nodes: [
        { id: 'a', label: 'A', type: 'input' },
        { id: 'b', label: 'B', type: 'output' },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'ghost' }],
    });
    expect(errors.some((e) => e.includes('Edge references non-existent node: ghost'))).toBe(true);
    expect(errors.some((e) => e.includes('acyclic'))).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
// Rule 4 — Unique node IDs
// ───────────────────────────────────────────────────────────────

describe('Rule 4 — unique node IDs', () => {
  it('reports the exact duplicated ID', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'Duplicate IDs',
      nodes: [
        { id: 'a', label: 'First', type: 'input' },
        { id: 'a', label: 'Second', type: 'process' },
        { id: 'b', label: 'End', type: 'output' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    });
    expect(errors).toEqual(['Duplicate node ID: a']);
  });

  it('reports each duplicated ID separately', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'Duplicate IDs',
      nodes: [
        { id: 'a', label: 'A1', type: 'input' },
        { id: 'a', label: 'A2', type: 'process' },
        { id: 'b', label: 'B1', type: 'output' },
        { id: 'b', label: 'B2', type: 'process' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    });
    expect(errors).toContain('Duplicate node ID: a');
    expect(errors).toContain('Duplicate node ID: b');
  });
});

// ───────────────────────────────────────────────────────────────
// Rule 5 — Connected graph
// ───────────────────────────────────────────────────────────────

describe('Rule 5 — connected graph', () => {
  it('detects two disconnected subgraphs (no orphans) with the subgraph count', () => {
    const errors = errorsOf({
      type: 'relationship',
      title: 'Two Islands',
      nodes: [
        { id: 'a', label: 'A', type: 'service' },
        { id: 'b', label: 'B', type: 'service' },
        { id: 'c', label: 'C', type: 'service' },
        { id: 'd', label: 'D', type: 'service' },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }],
    });
    expect(errors).toEqual(['Disconnected graph detected. Subgraphs: 2']);
  });

  it('counts three disconnected subgraphs', () => {
    const errors = errorsOf({
      type: 'relationship',
      title: 'Three Islands',
      nodes: Array.from({ length: 6 }, (_, i) => ({
        id: `n${i}`, label: `Node ${i}`, type: 'service' as const,
      })),
      edges: [
        { from: 'n0', to: 'n1' },
        { from: 'n2', to: 'n3' },
        { from: 'n4', to: 'n5' },
      ],
    });
    expect(errors).toContain('Disconnected graph detected. Subgraphs: 3');
  });

  it('an orphan node also makes the graph disconnected (both errors reported)', () => {
    const errors = errorsOf({
      ...makeFlow(),
      nodes: [...makeFlow().nodes, { id: 'lonely', label: 'Lonely', type: 'process' }],
    });
    expect(errors).toContain('Orphan node detected: lonely has no connections');
    expect(errors).toContain('Disconnected graph detected. Subgraphs: 2');
  });
});

// ───────────────────────────────────────────────────────────────
// Pedagogical rules (kept in sync with the extraction prompts)
// ───────────────────────────────────────────────────────────────

describe('pedagogical rules', () => {
  it('flow diagrams require at least one input (start) node', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'No Start',
      nodes: [
        { id: 'p', label: 'Process', type: 'process' },
        { id: 'e', label: 'End', type: 'output' },
      ],
      edges: [{ from: 'p', to: 'e' }],
    });
    expect(errors.some((e) => e.includes('start node'))).toBe(true);
  });

  it('flow diagrams require at least one output (end) node', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'No End',
      nodes: [
        { id: 's', label: 'Start', type: 'input' },
        { id: 'p', label: 'Process', type: 'process' },
      ],
      edges: [{ from: 's', to: 'p' }],
    });
    expect(errors.some((e) => e.includes('end node'))).toBe(true);
  });

  it('decision nodes need at least 2 outgoing edges (message names the node)', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'Bad Decision',
      nodes: [
        { id: 's', label: 'Start', type: 'input' },
        { id: 'd', label: 'Decide?', type: 'decision' },
        { id: 'e', label: 'End', type: 'output' },
      ],
      edges: [{ from: 's', to: 'd' }, { from: 'd', to: 'e' }],
    });
    expect(errors).toContain('Decision node "d" must have at least 2 outgoing edges.');
  });

  it('decision nodes with Yes/No branches are valid', () => {
    const result = validateDiagram({
      type: 'flow',
      title: 'Good Decision',
      nodes: [
        { id: 's', label: 'Start', type: 'input' },
        { id: 'd', label: 'Valid?', type: 'decision' },
        { id: 'ok', label: 'Success', type: 'output' },
        { id: 'err', label: 'Error', type: 'output' },
      ],
      edges: [
        { from: 's', to: 'd' },
        { from: 'd', to: 'ok', label: 'Yes' },
        { from: 'd', to: 'err', label: 'No' },
      ],
    });
    expect(result.valid).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// validateDiagram — contract & error collection
// ───────────────────────────────────────────────────────────────

describe('validateDiagram', () => {
  it('returns { valid: true, diagram } for a valid diagram', () => {
    const diagram = makeFlow();
    const result = validateDiagram(diagram);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.diagram).toEqual(diagram);
  });

  it('returns { valid: false, errors: string[] } for an invalid diagram', () => {
    const result = validateDiagram({ ...makeFlow(), edges: [] });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      for (const error of result.errors) expect(typeof error).toBe('string');
    }
  });

  it('collects ALL errors at once (duplicate + dangling + orphan + missing output)', () => {
    const errors = errorsOf({
      type: 'flow',
      title: 'Multiple Problems',
      nodes: [
        { id: 'x', label: 'X Input', type: 'input' },
        { id: 'x', label: 'X Duplicate', type: 'process' },
        { id: 'y', label: 'Y', type: 'process' },
        { id: 'lonely', label: 'Lonely', type: 'process' },
      ],
      edges: [{ from: 'x', to: 'ghost' }, { from: 'x', to: 'y' }],
    });
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors).toContain('Duplicate node ID: x');
    expect(errors.some((e) => e.includes('Edge references non-existent node: ghost'))).toBe(true);
    expect(errors).toContain('Orphan node detected: lonely has no connections');
    expect(errors.some((e) => e.includes('end node'))).toBe(true);
  });

  it('rejects non-object inputs (null, undefined, string, number, array)', () => {
    for (const input of [null, undefined, 'not an object', 42, []]) {
      const result = validateDiagram(input);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('field-level errors include their field paths (title, nodes, edges)', () => {
    const errors = errorsOf({ type: 'flow', title: '', nodes: [], edges: [] });
    expect(errors.some((e) => e.startsWith('title:'))).toBe(true);
    expect(errors.some((e) => e.startsWith('nodes:'))).toBe(true);
    expect(errors.some((e) => e.startsWith('edges:'))).toBe(true);
  });

  it('formatDiagramErrors renders a bulleted block for retry feedback', () => {
    const formatted = formatDiagramErrors(['First error', 'Second error']);
    expect(formatted).toContain('Diagram validation failed');
    expect(formatted).toContain('• First error');
    expect(formatted).toContain('• Second error');
  });
});

// ───────────────────────────────────────────────────────────────
// fixCommonDiagramErrors — auto-fixes
// ───────────────────────────────────────────────────────────────

describe('fixCommonDiagramErrors — fixes', () => {
  it('removes edges referencing non-existent nodes', () => {
    const fixed = fixCommonDiagramErrors({
      ...makeFlow(),
      edges: [...makeFlow().edges, { from: 'process', to: 'ghost' }],
    });
    expect(fixed.edges).toHaveLength(2);
    expect(fixed.edges.some((e) => e.from === 'ghost' || e.to === 'ghost')).toBe(false);
    expect(validateDiagram(fixed).valid).toBe(true);
  });

  it('removes duplicate node IDs, keeping the FIRST occurrence', () => {
    const fixed = fixCommonDiagramErrors({
      type: 'flow',
      title: 'Duplicates',
      nodes: [
        { id: 'a', label: 'First', type: 'input' },
        { id: 'a', label: 'Second', type: 'process' },
        { id: 'b', label: 'End', type: 'output' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    });
    expect(fixed.nodes).toHaveLength(2);
    expect(fixed.nodes[0].label).toBe('First');
    expect(validateDiagram(fixed).valid).toBe(true);
  });

  it('connects an orphan node to its nearest already-connected neighbor', () => {
    const fixed = fixCommonDiagramErrors({
      ...makeFlow(),
      nodes: [...makeFlow().nodes, { id: 'lonely', label: 'Lonely', type: 'process' }],
    });
    // 'lonely' sits right after 'end' in array order → end → lonely
    expect(fixed.edges).toContainEqual({ from: 'end', to: 'lonely' });
    expect(validateDiagram(fixed).valid).toBe(true);
  });

  it('input-type orphans point INTO the graph (sources stay sources)', () => {
    const fixed = fixCommonDiagramErrors({
      ...makeFlow(),
      nodes: [...makeFlow().nodes, { id: 'extra', label: 'Extra Input', type: 'input' }],
    });
    expect(fixed.edges).toContainEqual({ from: 'extra', to: 'end' });
    expect(validateDiagram(fixed).valid).toBe(true);
  });

  it('chains nodes in array order when there are no usable edges at all', () => {
    const fixed = fixCommonDiagramErrors({
      type: 'flow',
      title: 'No Edges',
      nodes: [
        { id: 's', label: 'Start', type: 'input' },
        { id: 'm', label: 'Middle', type: 'process' },
        { id: 'e', label: 'End', type: 'output' },
      ],
    });
    expect(fixed.edges).toEqual([
      { from: 's', to: 'm' },
      { from: 'm', to: 'e' },
    ]);
    expect(validateDiagram(fixed).valid).toBe(true);
  });

  it('removes exact duplicate from→to edge pairs', () => {
    const fixed = fixCommonDiagramErrors({
      ...makeFlow(),
      edges: [
        { from: 'start', to: 'process' },
        { from: 'start', to: 'process' },
        { from: 'process', to: 'end' },
      ],
    });
    expect(fixed.edges).toHaveLength(2);
  });

  it('defaults a missing or empty title to "Untitled Diagram"', () => {
    expect(fixCommonDiagramErrors({ ...makeFlow(), title: '' }).title).toBe('Untitled Diagram');
    const noTitle: Partial<Diagram> = { ...makeFlow() };
    delete noTitle.title;
    expect(fixCommonDiagramErrors(noTitle).title).toBe('Untitled Diagram');
  });

  it('never mutates the input (deep-frozen input works)', () => {
    const broken = deepFreeze({
      ...makeFlow(),
      nodes: [...makeFlow().nodes, { id: 'lonely', label: 'Lonely', type: 'process' as const }],
      edges: [...makeFlow().edges, { from: 'process', to: 'ghost' }],
    });
    const snapshot = JSON.stringify(broken);
    const fixed = fixCommonDiagramErrors(broken);
    expect(JSON.stringify(broken)).toBe(snapshot);
    expect(validateDiagram(fixed).valid).toBe(true);
  });

  it('is deterministic — same input produces the same output', () => {
    const broken = {
      ...makeFlow(),
      nodes: [...makeFlow().nodes, { id: 'lonely', label: 'Lonely', type: 'process' as const }],
    };
    expect(fixCommonDiagramErrors(broken)).toEqual(fixCommonDiagramErrors(broken));
  });
});

// ───────────────────────────────────────────────────────────────
// fixCommonDiagramErrors — unfixable cases & strict mode
// ───────────────────────────────────────────────────────────────

describe('fixCommonDiagramErrors — unfixable & strict', () => {
  it('throws on cycles in flow diagrams (cannot auto-fix)', () => {
    expect(() =>
      fixCommonDiagramErrors({
        type: 'flow',
        title: 'Cyclic',
        nodes: [
          { id: 'a', label: 'A', type: 'input' },
          { id: 'b', label: 'B', type: 'output' },
        ],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
      })
    ).toThrow(/acyclic/);
  });

  it('throws when fewer than 2 nodes remain', () => {
    expect(() =>
      fixCommonDiagramErrors({
        type: 'flow',
        title: 'Too Few',
        nodes: [{ id: 'only', label: 'Only', type: 'process' }],
        edges: [],
      })
    ).toThrow(/at least 2 nodes/);
  });

  it('throws when the diagram type is missing or invalid', () => {
    expect(() =>
      fixCommonDiagramErrors({ nodes: makeFlow().nodes, edges: makeFlow().edges })
    ).toThrow(/type/);
  });

  it('throws with more than 8 nodes (removal must be explicit)', () => {
    expect(() =>
      fixCommonDiagramErrors({
        type: 'relationship',
        title: 'Too Many',
        nodes: Array.from({ length: 9 }, (_, i) => ({
          id: `n${i}`, label: `Node ${i}`, type: 'service' as const,
        })),
        edges: Array.from({ length: 8 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
      })
    ).toThrow(/more than 8 nodes/);
  });

  it('throws when connecting orphans would exceed the 10-edge limit', () => {
    expect(() =>
      fixCommonDiagramErrors({
        type: 'relationship',
        title: 'Edge Overflow',
        nodes: [
          ...Array.from({ length: 7 }, (_, i) => ({
            id: `n${i}`, label: `Node ${i}`, type: 'service' as const,
          })),
          { id: 'orphan', label: 'Orphan', type: 'process' as const },
        ],
        edges: [
          { from: 'n0', to: 'n1' },
          { from: 'n1', to: 'n2' },
          { from: 'n2', to: 'n3' },
          { from: 'n3', to: 'n4' },
          { from: 'n4', to: 'n5' },
          { from: 'n5', to: 'n6' },
          { from: 'n0', to: 'n2' },
          { from: 'n0', to: 'n3' },
          { from: 'n1', to: 'n3' },
          { from: 'n1', to: 'n4' },
        ],
      })
    ).toThrow(/10-edge limit/);
  });

  it('throws with ALL remaining errors for unfixable semantic issues', () => {
    expect(() =>
      fixCommonDiagramErrors({
        type: 'flow',
        title: 'No Output',
        nodes: [
          { id: 'a', label: 'A', type: 'input' },
          { id: 'b', label: 'B', type: 'process' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      })
    ).toThrow(/end node/);
  });

  it('strict mode never auto-fixes — throws even for fixable issues', () => {
    expect(() =>
      fixCommonDiagramErrors(
        { ...makeFlow(), edges: [...makeFlow().edges, { from: 'process', to: 'ghost' }] },
        { strict: true }
      )
    ).toThrow(/non-existent node: ghost/);
  });

  it('strict mode returns the validated diagram when input is already valid', () => {
    const diagram = makeFlow();
    expect(fixCommonDiagramErrors(diagram, { strict: true })).toEqual(diagram);
  });

  it('throws on non-object input', () => {
    expect(() => fixCommonDiagramErrors(null as unknown as Partial<Diagram>)).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────
// Exports smoke test (all schemas usable from other modules)
// ───────────────────────────────────────────────────────────────

describe('schema exports', () => {
  it('DiagramTypeSchema accepts exactly the four W1.2 types', () => {
    for (const type of ['flow', 'relationship', 'architecture', 'sequence']) {
      expect(DiagramTypeSchema.safeParse(type).success).toBe(true);
    }
    expect(DiagramTypeSchema.safeParse('mindmap').success).toBe(false);
  });

  it('DiagramNodeTypeSchema accepts exactly the six W1.2 node types', () => {
    for (const type of ['input', 'process', 'decision', 'output', 'storage', 'service']) {
      expect(DiagramNodeTypeSchema.safeParse(type).success).toBe(true);
    }
    expect(DiagramNodeTypeSchema.safeParse('terminal').success).toBe(false);
  });

  it('HexColorSchema and DiagramEdgeStyleSchema are exported and usable', () => {
    expect(HexColorSchema.safeParse('#fff').success).toBe(true);
    expect(HexColorSchema.safeParse('fff').success).toBe(false);
    expect(DiagramEdgeStyleSchema.safeParse({ dashed: true }).success).toBe(true);
    expect(DiagramEdgeStyleSchema.safeParse({ strokeWidth: 99 }).success).toBe(false);
  });
});
