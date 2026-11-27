import { describe, it, expect } from 'vitest';
import {
  calculateDiagramLayout,
  NODE_WIDTH,
  NODE_HEIGHT,
  type LayoutNode,
} from './diagramLayout';
import type { DiagramNode, DiagramEdge } from '@/engine/generatorSchema';

// Helper to create nodes
function makeNode(id: string, type: DiagramNode['type'], label?: string): DiagramNode {
  return { id, label: label || id, type, description: `Description for ${id}` };
}

/**
 * Rendered visual boxes, mirrored from ContextDiagram.tsx. A decision node is a
 * 112px square rotated 45°, so its axis-aligned footprint is 112·√2 ≈ 158px —
 * using NODE_HEIGHT (60) for it would hide real overlaps, which is exactly the
 * blind spot this suite originally had.
 */
const VISUAL_BOX: Record<string, { w: number; h: number }> = {
  decision: { w: 159, h: 159 },
  service: { w: 160, h: 80 },
};

function boxOf(node: LayoutNode): { w: number; h: number } {
  return VISUAL_BOX[node.type] ?? { w: NODE_WIDTH, h: NODE_HEIGHT };
}

/**
 * Two nodes overlap when their rendered bounding boxes intersect. Positions are
 * box anchors, so comparing against the larger of each pair keeps the test
 * conservative (it can over-report, never under-report).
 */
function findOverlap(nodes: LayoutNode[]): string | null {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const boxA = boxOf(a);
      const boxB = boxOf(b);
      const horizontal = Math.abs(a.position.x - b.position.x);
      const vertical = Math.abs(a.position.y - b.position.y);
      if (horizontal < Math.max(boxA.w, boxB.w) && vertical < Math.max(boxA.h, boxB.h)) {
        return `${a.id}/${b.id} (dx=${horizontal.toFixed(1)}, dy=${vertical.toFixed(1)})`;
      }
    }
  }
  return null;
}

/** 8-node fixtures — the DiagramSchema maximum, where spacing gets tightest. */
const EIGHT_NODE_FIXTURES: Record<
  'flow' | 'relationship' | 'architecture' | 'sequence',
  { nodes: DiagramNode[]; edges: DiagramEdge[] }
> = {
  flow: {
    nodes: [
      makeNode('req', 'input'),
      makeNode('gw', 'service'),
      makeNode('auth', 'process'),
      makeNode('check', 'decision'),
      makeNode('cache', 'storage'),
      makeNode('db', 'storage'),
      makeNode('fmt', 'process'),
      makeNode('res', 'output'),
    ],
    edges: [
      { from: 'req', to: 'gw' },
      { from: 'gw', to: 'auth' },
      { from: 'auth', to: 'check' },
      { from: 'check', to: 'cache', label: 'hit' },
      { from: 'check', to: 'db', label: 'miss' },
      { from: 'cache', to: 'fmt' },
      { from: 'db', to: 'fmt' },
      { from: 'fmt', to: 'res' },
    ],
  },
  relationship: {
    nodes: [
      makeNode('hub', 'service'),
      makeNode('alpha', 'process'),
      makeNode('beta', 'process'),
      makeNode('gamma', 'storage'),
      makeNode('delta', 'storage'),
      makeNode('epsilon', 'input'),
      makeNode('zeta', 'output'),
      makeNode('eta', 'decision'),
    ],
    edges: [
      { from: 'hub', to: 'alpha' },
      { from: 'hub', to: 'beta' },
      { from: 'hub', to: 'gamma' },
      { from: 'hub', to: 'delta' },
      { from: 'hub', to: 'epsilon' },
      { from: 'hub', to: 'zeta' },
      { from: 'hub', to: 'eta' },
    ],
  },
  architecture: {
    nodes: [
      makeNode('ui', 'input'),
      makeNode('mobile', 'input'),
      makeNode('api', 'service'),
      makeNode('worker', 'service'),
      makeNode('rule', 'decision'),
      makeNode('sql', 'storage'),
      makeNode('blob', 'storage'),
      makeNode('email', 'output'),
    ],
    edges: [
      { from: 'ui', to: 'api' },
      { from: 'mobile', to: 'api' },
      { from: 'api', to: 'rule' },
      { from: 'rule', to: 'sql' },
      { from: 'rule', to: 'blob' },
      { from: 'api', to: 'worker' },
      { from: 'worker', to: 'email' },
    ],
  },
  sequence: {
    nodes: [
      makeNode('user', 'input'),
      makeNode('browser', 'service'),
      makeNode('edge', 'service'),
      makeNode('app', 'service'),
      makeNode('cache', 'storage'),
      makeNode('store', 'storage'),
      makeNode('audit', 'process'),
      makeNode('reply', 'output'),
    ],
    edges: [
      { from: 'user', to: 'browser' },
      { from: 'browser', to: 'edge' },
      { from: 'edge', to: 'app' },
      { from: 'app', to: 'cache' },
      { from: 'app', to: 'store' },
      { from: 'app', to: 'audit' },
      { from: 'audit', to: 'reply' },
    ],
  },
};

describe('calculateDiagramLayout', () => {
  describe('Edge cases', () => {
    it('returns empty result for no nodes', () => {
      const result = calculateDiagramLayout([], [], 'flow');
      expect(result.nodes).toHaveLength(0);
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    it('centers a single node at origin', () => {
      const nodes = [makeNode('a', 'process')];
      const result = calculateDiagramLayout(nodes, [], 'flow');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].position).toEqual({ x: 0, y: 0 });
    });

    it('handles two nodes for flow (side by side)', () => {
      const nodes = [makeNode('a', 'input'), makeNode('b', 'output')];
      const edges: DiagramEdge[] = [{ from: 'a', to: 'b' }];
      const result = calculateDiagramLayout(nodes, edges, 'flow');
      expect(result.nodes).toHaveLength(2);
      // Nodes should have different x positions (left-to-right)
      const nodeA = result.nodes.find((n) => n.id === 'a');
      const nodeB = result.nodes.find((n) => n.id === 'b');
      expect(nodeA!.position.x).toBeLessThan(nodeB!.position.x);
    });
  });

  describe('Flow diagram layout', () => {
    it('places nodes left-to-right in topological order', () => {
      const nodes = [
        makeNode('start', 'input', 'Start'),
        makeNode('process', 'process', 'Process'),
        makeNode('end', 'output', 'End'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'start', to: 'process' },
        { from: 'process', to: 'end' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'flow');
      expect(result.nodes).toHaveLength(3);

      const startX = result.nodes.find((n) => n.id === 'start')!.position.x;
      const processX = result.nodes.find((n) => n.id === 'process')!.position.x;
      const endX = result.nodes.find((n) => n.id === 'end')!.position.x;

      expect(startX).toBeLessThan(processX);
      expect(processX).toBeLessThan(endX);
    });

    it('groups parallel nodes in the same column', () => {
      const nodes = [
        makeNode('start', 'input'),
        makeNode('a', 'process'),
        makeNode('b', 'process'),
        makeNode('end', 'output'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'start', to: 'a' },
        { from: 'start', to: 'b' },
        { from: 'a', to: 'end' },
        { from: 'b', to: 'end' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'flow');

      const nodeA = result.nodes.find((n) => n.id === 'a')!;
      const nodeB = result.nodes.find((n) => n.id === 'b')!;

      // a and b should be in the same column (same x)
      expect(nodeA.position.x).toBe(nodeB.position.x);
      // but different y positions
      expect(nodeA.position.y).not.toBe(nodeB.position.y);
    });

    it('handles cycles gracefully (places remaining nodes)', () => {
      const nodes = [
        makeNode('a', 'process'),
        makeNode('b', 'process'),
        makeNode('c', 'process'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' }, // Cycle
      ];
      const result = calculateDiagramLayout(nodes, edges, 'flow');
      expect(result.nodes).toHaveLength(3);
      // All nodes should have positions
      result.nodes.forEach((node) => {
        expect(node.position.x).toBeGreaterThanOrEqual(0);
        expect(node.position.y).toBeGreaterThanOrEqual(0);
      });
    });

    it('produces deterministic output (same input = same output)', () => {
      const nodes = [
        makeNode('c', 'process'),
        makeNode('a', 'input'),
        makeNode('b', 'output'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'a', to: 'c' },
        { from: 'c', to: 'b' },
      ];

      const result1 = calculateDiagramLayout(nodes, edges, 'flow');
      const result2 = calculateDiagramLayout(nodes, edges, 'flow');

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe('Relationship diagram layout', () => {
    it('places the most-connected node at the center', () => {
      const nodes = [
        makeNode('hub', 'service', 'Hub'),
        makeNode('a', 'process'),
        makeNode('b', 'process'),
        makeNode('c', 'process'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'hub', to: 'a' },
        { from: 'hub', to: 'b' },
        { from: 'hub', to: 'c' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'relationship');
      expect(result.nodes).toHaveLength(4);

      // The hub should be closest to the center of the bounding box
      const hubNode = result.nodes.find((n) => n.id === 'hub')!;
      const centerX = result.width / 2 - 90; // Adjust for node width
      const centerY = result.height / 2 - 30; // Adjust for node height

      // Hub should be near center
      const distanceFromCenter = Math.sqrt(
        Math.pow(hubNode.position.x - centerX, 2) + Math.pow(hubNode.position.y - centerY, 2)
      );
      expect(distanceFromCenter).toBeLessThan(100);
    });

    it('arranges other nodes in a circle around the center', () => {
      const nodes = [
        makeNode('center', 'service'),
        makeNode('a', 'process'),
        makeNode('b', 'process'),
        makeNode('c', 'process'),
        makeNode('d', 'process'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'center', to: 'a' },
        { from: 'center', to: 'b' },
        { from: 'center', to: 'c' },
        { from: 'center', to: 'd' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'relationship');
      expect(result.nodes).toHaveLength(5);

      const centerNode = result.nodes.find((n) => n.id === 'center')!;
      const otherNodes = result.nodes.filter((n) => n.id !== 'center');

      // All other nodes should be approximately the same distance from center
      const distances = otherNodes.map((n) => {
        return Math.sqrt(
          Math.pow(n.position.x - centerNode.position.x, 2) +
            Math.pow(n.position.y - centerNode.position.y, 2)
        );
      });

      // Check that all distances are approximately equal (within 10%)
      const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
      distances.forEach((d) => {
        expect(Math.abs(d - avgDistance)).toBeLessThan(avgDistance * 0.1);
      });
    });
  });

  describe('Architecture diagram layout', () => {
    it('groups nodes by type in vertical layers', () => {
      const nodes = [
        makeNode('input-1', 'input', 'User Request'),
        makeNode('process-1', 'process', 'Validate'),
        makeNode('service-1', 'service', 'API'),
        makeNode('storage-1', 'storage', 'Database'),
        makeNode('output-1', 'output', 'Response'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'input-1', to: 'process-1' },
        { from: 'process-1', to: 'service-1' },
        { from: 'service-1', to: 'storage-1' },
        { from: 'storage-1', to: 'output-1' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'architecture');
      expect(result.nodes).toHaveLength(5);

      const inputNode = result.nodes.find((n) => n.id === 'input-1')!;
      const processNode = result.nodes.find((n) => n.id === 'process-1')!;
      const serviceNode = result.nodes.find((n) => n.id === 'service-1')!;
      const storageNode = result.nodes.find((n) => n.id === 'storage-1')!;
      const outputNode = result.nodes.find((n) => n.id === 'output-1')!;

      // Inputs should be above processes (smaller y)
      expect(inputNode.position.y).toBeLessThan(processNode.position.y);
      // Processes should be above outputs
      expect(processNode.position.y).toBeLessThan(outputNode.position.y);
      // Storage should be in the middle layers
      expect(serviceNode.position.y).toBeGreaterThanOrEqual(processNode.position.y);
      expect(storageNode.position.y).toBeGreaterThanOrEqual(serviceNode.position.y);
    });

    it('places multiple nodes of the same type in the same horizontal layer', () => {
      const nodes = [
        makeNode('p1', 'process'),
        makeNode('p2', 'process'),
        makeNode('p3', 'process'),
        makeNode('o1', 'output'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'p1', to: 'o1' },
        { from: 'p2', to: 'o1' },
        { from: 'p3', to: 'o1' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'architecture');

      const processNodes = result.nodes.filter((n) => n.type === 'process');
      // All process nodes should have the same y coordinate
      const yPositions = processNodes.map((n) => n.position.y);
      expect(new Set(yPositions).size).toBe(1);
    });
  });

  describe('Sequence diagram layout', () => {
    it('places actors in horizontal lanes and messages vertically', () => {
      const nodes = [
        makeNode('client', 'service', 'Client'),
        makeNode('server', 'service', 'Server'),
        makeNode('request', 'input', 'Request'),
        makeNode('response', 'output', 'Response'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'client', to: 'request' },
        { from: 'request', to: 'server' },
        { from: 'server', to: 'response' },
        { from: 'response', to: 'client' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'sequence');
      expect(result.nodes).toHaveLength(4);

      const client = result.nodes.find((n) => n.id === 'client')!;
      const server = result.nodes.find((n) => n.id === 'server')!;

      // Actors should be at the top (smaller y)
      const request = result.nodes.find((n) => n.id === 'request')!;
      const response = result.nodes.find((n) => n.id === 'response')!;

      expect(client.position.y).toBeLessThan(request.position.y);
      expect(server.position.y).toBeLessThan(response.position.y);
    });

    it('falls back to vertical stack when no actors present', () => {
      const nodes = [
        makeNode('step1', 'input'),
        makeNode('step2', 'decision'),
        makeNode('step3', 'output'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'step1', to: 'step2' },
        { from: 'step2', to: 'step3' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'sequence');
      expect(result.nodes).toHaveLength(3);

      // All nodes should have the same x (vertical stack)
      const xPositions = result.nodes.map((n) => n.position.x);
      expect(new Set(xPositions).size).toBe(1);

      // Y positions should increase (top to bottom)
      const step1 = result.nodes.find((n) => n.id === 'step1')!;
      const step2 = result.nodes.find((n) => n.id === 'step2')!;
      const step3 = result.nodes.find((n) => n.id === 'step3')!;

      expect(step1.position.y).toBeLessThan(step2.position.y);
      expect(step2.position.y).toBeLessThan(step3.position.y);
    });
  });

  describe('Disconnected subgraphs', () => {
    it('layouts each subgraph separately and stacks them vertically', () => {
      // Two disconnected components
      const nodes = [
        makeNode('a1', 'input'),
        makeNode('a2', 'output'),
        makeNode('b1', 'input'),
        makeNode('b2', 'output'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'a1', to: 'a2' },
        { from: 'b1', to: 'b2' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'flow');
      expect(result.nodes).toHaveLength(4);

      // Component A nodes
      const a1 = result.nodes.find((n) => n.id === 'a1')!;
      const a2 = result.nodes.find((n) => n.id === 'a2')!;

      // Component B nodes
      const b1 = result.nodes.find((n) => n.id === 'b1')!;
      const b2 = result.nodes.find((n) => n.id === 'b2')!;

      // Component A and B should be separated vertically
      const aMaxY = Math.max(a1.position.y, a2.position.y);
      const bMinY = Math.min(b1.position.y, b2.position.y);

      // There should be a gap between components
      expect(bMinY).toBeGreaterThan(aMaxY);
    });
  });

  describe('Position normalization', () => {
    it('ensures all positions are non-negative (normalized to start at 0,0)', () => {
      const nodes = [
        makeNode('a', 'input'),
        makeNode('b', 'process'),
        makeNode('c', 'output'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'flow');

      result.nodes.forEach((node) => {
        expect(node.position.x).toBeGreaterThanOrEqual(0);
        expect(node.position.y).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('No overlapping nodes', () => {
    it('ensures no two nodes occupy the same position', () => {
      const nodes = [
        makeNode('a', 'process'),
        makeNode('b', 'process'),
        makeNode('c', 'process'),
        makeNode('d', 'process'),
        makeNode('e', 'process'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'e' },
      ];

      const result = calculateDiagramLayout(nodes, edges, 'flow');

      // Check that no two nodes have the same position
      const positions = result.nodes.map((n) => `${n.position.x},${n.position.y}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(result.nodes.length);
    });

    it('detects an overlap when one is actually present (guards this suite)', () => {
      // findOverlap is the instrument for every assertion below — if it were
      // trivially null, the whole suite would pass against a broken layout.
      const overlapping: LayoutNode[] = [
        { id: 'x', label: 'X', type: 'process', position: { x: 0, y: 0 } },
        { id: 'y', label: 'Y', type: 'process', position: { x: NODE_WIDTH - 1, y: NODE_HEIGHT - 1 } },
      ];
      expect(findOverlap(overlapping)).toContain('x/y');

      const apart: LayoutNode[] = [
        overlapping[0],
        { id: 'y', label: 'Y', type: 'process', position: { x: 0, y: NODE_HEIGHT } },
      ];
      expect(findOverlap(apart)).toBeNull();
    });

    it('keeps bounding boxes apart for every diagram type at the 8-node maximum', () => {
      for (const [type, fixture] of Object.entries(EIGHT_NODE_FIXTURES)) {
        const result = calculateDiagramLayout(
          fixture.nodes,
          fixture.edges,
          type as 'flow' | 'relationship' | 'architecture' | 'sequence'
        );
        expect(result.nodes).toHaveLength(8);
        expect(findOverlap(result.nodes), `overlap in "${type}" layout`).toBeNull();
      }
    });

    it('keeps bounding boxes apart for the dense (>8 node) compressed path', () => {
      const fixture = EIGHT_NODE_FIXTURES.relationship;
      const nodes = [...fixture.nodes, makeNode('theta', 'process')];
      const edges = [...fixture.edges, { from: 'hub', to: 'theta' }];
      const result = calculateDiagramLayout(nodes, edges, 'relationship');
      expect(result.nodes).toHaveLength(9);
      expect(findOverlap(result.nodes)).toBeNull();
    });
    it('does not overlap a rotated decision node on a sequence timeline', () => {
      // Regression: SEQUENCE_ROW_PITCH was a fixed 150px while a decision node
      // occupies ~158px vertically, so every decision collided with its row.
      const nodes = [
        makeNode('user', 'service', 'User'),
        makeNode('valid', 'decision', 'Valid?'),
        makeNode('done', 'process', 'Done'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'user', to: 'valid' },
        { from: 'valid', to: 'done' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'sequence');
      expect(findOverlap(result.nodes)).toBeNull();

      const y = (id: string) => result.nodes.find((n) => n.id === id)!.position.y;
      expect(y('valid') - y('user')).toBeGreaterThanOrEqual(158);
    });

    it('does not overlap stacked decision nodes in a compressed (>8 node) flow column', () => {
      const nodes = [
        makeNode('start', 'input'),
        makeNode('decA', 'decision'),
        makeNode('decB', 'decision'),
        makeNode('p1', 'process'),
        makeNode('p2', 'process'),
        makeNode('p3', 'process'),
        makeNode('p4', 'process'),
        makeNode('p5', 'process'),
        makeNode('p6', 'process'),
        makeNode('end', 'output'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'start', to: 'decA' },
        { from: 'start', to: 'decB' },
        { from: 'decA', to: 'p1' },
        { from: 'decA', to: 'p2' },
        { from: 'decA', to: 'p3' },
        { from: 'decB', to: 'p4' },
        { from: 'decB', to: 'p5' },
        { from: 'decB', to: 'p6' },
        { from: 'p1', to: 'end' },
        { from: 'p4', to: 'end' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'flow');
      expect(result.nodes).toHaveLength(10);
      expect(findOverlap(result.nodes)).toBeNull();

      const decA = result.nodes.find((n) => n.id === 'decA')!;
      const decB = result.nodes.find((n) => n.id === 'decB')!;
      expect(decA.position.x).toBe(decB.position.x);
      expect(Math.abs(decA.position.y - decB.position.y)).toBeGreaterThanOrEqual(158);
    });

    it('reports a taller layout height when a decision node is present', () => {
      const plain = calculateDiagramLayout(
        [makeNode('a', 'input'), makeNode('b', 'output')],
        [{ from: 'a', to: 'b' }],
        'sequence'
      );
      const tall = calculateDiagramLayout(
        [makeNode('a', 'input'), makeNode('b', 'decision')],
        [{ from: 'a', to: 'b' }],
        'sequence'
      );
      expect(tall.height).toBeGreaterThan(plain.height);
    });
  });

  describe('Determinism', () => {
    it('returns byte-identical output on repeat calls for every diagram type', () => {
      for (const [type, fixture] of Object.entries(EIGHT_NODE_FIXTURES)) {
        const first = JSON.stringify(
          calculateDiagramLayout(fixture.nodes, fixture.edges, type as never)
        );
        const second = JSON.stringify(
          calculateDiagramLayout(fixture.nodes, fixture.edges, type as never)
        );
        expect(first, `"${type}" layout is unstable`).toBe(second);
      }
    });

    it('breaks ties by code point, not by locale collation', () => {
      // localeCompare puts "a" before "B"; code point puts "B" (0x42) first.
      // The layout must not change when the runtime default locale changes.
      const nodes = [makeNode('a', 'process'), makeNode('B', 'process'), makeNode('z', 'input')];
      const edges: DiagramEdge[] = [
        { from: 'z', to: 'a' },
        { from: 'z', to: 'B' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'flow');
      const a = result.nodes.find((n) => n.id === 'a')!;
      const b = result.nodes.find((n) => n.id === 'B')!;

      // Same column (both depth 1), stacked in code-point order: B above a.
      expect(b.position.x).toBe(a.position.x);
      expect(b.position.y).toBeLessThan(a.position.y);
    });
  });

  describe('Sequence ordering with actor lanes', () => {
    it('orders messages in time order, not merely below their actor', () => {
      const nodes = [
        makeNode('client', 'service', 'Client'),
        makeNode('server', 'service', 'Server'),
        makeNode('request', 'input', 'Request'),
        makeNode('response', 'output', 'Response'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'client', to: 'request' },
        { from: 'request', to: 'server' },
        { from: 'server', to: 'response' },
        { from: 'response', to: 'client' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'sequence');
      const y = (id: string) => result.nodes.find((n) => n.id === id)!.position.y;

      // Time flows strictly top to bottom across the whole timeline.
      expect(y('client')).toBeLessThan(y('request'));
      expect(y('request')).toBeLessThan(y('server'));
      expect(y('server')).toBeLessThan(y('response'));
      expect(y('request')).toBeLessThan(y('response'));
    });

    it('gives each distinct actor its own lane', () => {
      const fixture = EIGHT_NODE_FIXTURES.sequence;
      const result = calculateDiagramLayout(fixture.nodes, fixture.edges, 'sequence');
      const actorX = new Set(
        fixture.nodes
          .filter((n) => n.type === 'process' || n.type === 'service')
          .map((n) => result.nodes.find((r) => r.id === n.id)!.position.x)
      );
      expect(actorX.size).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Disconnected subgraph spacing', () => {
    it('leaves the full 300px gap between stacked components', () => {
      const nodes = [
        makeNode('a1', 'input'),
        makeNode('a2', 'output'),
        makeNode('b1', 'input'),
        makeNode('b2', 'output'),
      ];
      const edges: DiagramEdge[] = [
        { from: 'a1', to: 'a2' },
        { from: 'b1', to: 'b2' },
      ];
      const result = calculateDiagramLayout(nodes, edges, 'flow');
      const aMaxY = Math.max(
        ...nodes
          .filter((n) => n.id.startsWith('a'))
          .map((n) => result.nodes.find((r) => r.id === n.id)!.position.y)
      );
      const bMinY = Math.min(
        ...nodes
          .filter((n) => n.id.startsWith('b'))
          .map((n) => result.nodes.find((r) => r.id === n.id)!.position.y)
      );

      // COMPONENT_GAP is measured edge-to-edge, so the anchor delta includes
      // the height of the box above it.
      expect(bMinY - (aMaxY + NODE_HEIGHT)).toBe(300);
    });
  });

  describe('Input immutability', () => {
    it('never mutates the caller node objects', () => {
      const nodes = [makeNode('a', 'input'), makeNode('b', 'output')];
      const snapshot = JSON.stringify(nodes);
      calculateDiagramLayout(nodes, [{ from: 'a', to: 'b' }], 'flow');
      expect(JSON.stringify(nodes)).toBe(snapshot);
    });
  });
});
