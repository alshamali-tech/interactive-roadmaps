import { describe, it, expect } from 'vitest';
import { DiagramSchema, validateDiagram } from './generatorSchema';

describe('Diagram Schema Validation', () => {
  const validDiagram = {
    type: 'flow' as const,
    title: 'Test Flow',
    nodes: [
      { id: 'start', label: 'Start', type: 'input' as const },
      { id: 'process', label: 'Process', type: 'process' as const },
      { id: 'end', label: 'End', type: 'output' as const },
    ],
    edges: [
      { from: 'start', to: 'process' },
      { from: 'process', to: 'end' },
    ],
  };

  it('valid diagram passes validation', () => {
    const result = DiagramSchema.safeParse(validDiagram);
    expect(result.success).toBe(true);
    
    const validateResult = validateDiagram(validDiagram);
    expect(validateResult.success).toBe(true);
  });

  it('disconnected graph fails with specific error', () => {
    const disconnectedDiagram = {
      ...validDiagram,
      nodes: [
        ...validDiagram.nodes,
        { id: 'orphan', label: 'Orphan', type: 'process' as const },
      ],
    };

    const result = validateDiagram(disconnectedDiagram);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('orphan');
      expect(result.error.toLowerCase()).toContain('edge');
    }
  });

  it('cyclic flow fails with specific error', () => {
    const cyclicDiagram = {
      type: 'flow' as const,
      title: 'Cyclic Flow',
      nodes: [
        { id: 'a', label: 'A', type: 'process' as const },
        { id: 'b', label: 'B', type: 'process' as const },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' }, // Cycle
      ],
    };

    const result = validateDiagram(cyclicDiagram);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.toLowerCase()).toContain('acyclic');
    }
  });

  it('duplicate node IDs fail', () => {
    const duplicateIdDiagram = {
      ...validDiagram,
      nodes: [
        { id: 'start', label: 'Start 1', type: 'input' as const },
        { id: 'start', label: 'Start 2', type: 'process' as const }, // Duplicate ID
        { id: 'end', label: 'End', type: 'output' as const },
      ],
    };

    const result = validateDiagram(duplicateIdDiagram);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.toLowerCase()).toContain('unique');
    }
  });

  it('edge referencing non-existent node fails', () => {
    const invalidEdgeDiagram = {
      ...validDiagram,
      edges: [
        { from: 'start', to: 'process' },
        { from: 'process', to: 'non-existent-node' }, // Invalid reference
      ],
    };

    const result = validateDiagram(invalidEdgeDiagram);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.toLowerCase()).toContain('exist');
    }
  });

  it('missing start node fails', () => {
    const noStartDiagram = {
      ...validDiagram,
      nodes: [
        { id: 'process', label: 'Process', type: 'process' as const },
        { id: 'end', label: 'End', type: 'output' as const },
      ],
      edges: [
        { from: 'process', to: 'end' },
      ],
    };

    const result = validateDiagram(noStartDiagram);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.toLowerCase()).toContain('start');
    }
  });

  it('decision node with fewer than 2 outgoing edges fails', () => {
    const badDecisionDiagram = {
      type: 'flow' as const,
      title: 'Bad Decision',
      nodes: [
        { id: 'start', label: 'Start', type: 'input' as const },
        { id: 'decision', label: 'Decision?', type: 'decision' as const },
        { id: 'end', label: 'End', type: 'output' as const },
      ],
      edges: [
        { from: 'start', to: 'decision' },
        { from: 'decision', to: 'end' }, // Only 1 outgoing edge from decision
      ],
    };

    const result = validateDiagram(badDecisionDiagram);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.toLowerCase()).toContain('decision');
    }
  });
});
