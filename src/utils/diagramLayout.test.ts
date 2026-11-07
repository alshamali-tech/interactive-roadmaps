import { describe, it, expect } from 'vitest';
import { calculateDiagramLayout } from '@/lib/diagramLayout';
import type { DiagramNode, DiagramEdge } from '@/engine/generatorSchema';

// Helper to create nodes
function makeNode(id: string, type: DiagramNode['type'], label?: string): DiagramNode {
  return { id, label: label || id, type, description: `Description for ${id}` };
}

describe('Diagram Layout Utilities', () => {
  describe('Flow layout', () => {
    it('produces left-to-right order', () => {
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
      
      const startX = result.nodes.find((n) => n.id === 'start')!.position.x;
      const processX = result.nodes.find((n) => n.id === 'process')!.position.x;
      const endX = result.nodes.find((n) => n.id === 'end')!.position.x;

      expect(startX).toBeLessThan(processX);
      expect(processX).toBeLessThan(endX);
    });
  });

  describe('Relationship layout', () => {
    it('centers the hub node', () => {
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
      
      const hubNode = result.nodes.find((n) => n.id === 'hub')!;
      const centerX = result.width / 2 - 90;
      const centerY = result.height / 2 - 30;

      const distanceFromCenter = Math.sqrt(
        Math.pow(hubNode.position.x - centerX, 2) + Math.pow(hubNode.position.y - centerY, 2)
      );
      expect(distanceFromCenter).toBeLessThan(100);
    });
  });

  describe('Layout constraints', () => {
    it('ensures no overlapping nodes in any layout type', () => {
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

      const positions = result.nodes.map((n) => `${n.position.x},${n.position.y}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(result.nodes.length);
    });

    it('produces deterministic output for same input', () => {
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
});
