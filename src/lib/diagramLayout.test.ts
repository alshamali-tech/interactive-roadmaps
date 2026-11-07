import { describe, it, expect } from 'vitest';
import { calculateDiagramLayout } from './diagramLayout';
import type { DiagramNode, DiagramEdge } from '@/engine/generatorSchema';

// Helper to create nodes
function makeNode(id: string, type: DiagramNode['type'], label?: string): DiagramNode {
  return { id, label: label || id, type, description: `Description for ${id}` };
}

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
  });
});
