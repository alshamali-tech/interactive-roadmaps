import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateDiagramText,
  extractDiagram,
  mergeDiagram,
  diagramDefinitionToSource,
  generateDiagram,
  DiagramDefinitionSchema,
  type DiagramDefinition,
} from '@/engine/diagramGenerator';
import * as aiService from '@/engine/aiService';
import type { AISettings } from '@/engine/settings';

vi.mock('@/engine/aiService', () => ({
  generateRawCompletion: vi.fn(),
}));

const mockSettings: AISettings = {
  provider: 'openai',
  apiKey: 'test-key',
  baseUrl: '',
  model: 'gpt-4',
  generationMode: 'focused',
};

// ───────────────────────────────────────────────────────────────
// Zod Schema tests (Stage 2 output contract)
// ───────────────────────────────────────────────────────────────

describe('DiagramDefinitionSchema', () => {
  const validDefinition = {
    diagramType: 'flowchart' as const,
    title: 'HTTP Request',
    caption: 'How an HTTP request flows through a web app',
    nodes: [
      { id: 'user', label: 'User Request', type: 'start' as const },
      { id: 'server', label: 'Process Request', type: 'process' as const },
      { id: 'response', label: 'Send Response', type: 'end' as const },
    ],
    edges: [
      { from: 'user', to: 'server' },
      { from: 'server', to: 'response' },
    ],
  };

  it('accepts a valid diagram definition', () => {
    const result = DiagramDefinitionSchema.safeParse(validDefinition);
    expect(result.success).toBe(true);
  });

  it('rejects diagram with missing start node', () => {
    const noStart = {
      ...validDefinition,
      nodes: [
        { id: 'server', label: 'Process', type: 'process' as const },
        { id: 'response', label: 'End Result', type: 'end' as const },
      ],
      edges: [{ from: 'server', to: 'response' }],
    };
    const result = DiagramDefinitionSchema.safeParse(noStart);
    expect(result.success).toBe(false);
  });

  it('rejects diagram with missing end node', () => {
    const noEnd = {
      ...validDefinition,
      nodes: [
        { id: 'user', label: 'User', type: 'start' as const },
        { id: 'server', label: 'Process', type: 'process' as const },
      ],
      edges: [{ from: 'user', to: 'server' }],
    };
    const result = DiagramDefinitionSchema.safeParse(noEnd);
    expect(result.success).toBe(false);
  });

  it('rejects edges referencing non-existent nodes', () => {
    const badEdges = {
      ...validDefinition,
      edges: [
        { from: 'user', to: 'nonexistent' },
        { from: 'server', to: 'response' },
      ],
    };
    const result = DiagramDefinitionSchema.safeParse(badEdges);
    expect(result.success).toBe(false);
  });

  it('rejects decision nodes with fewer than 2 outgoing edges', () => {
    const badDecision = {
      ...validDefinition,
      nodes: [
        { id: 'start', label: 'Start', type: 'start' as const },
        { id: 'check', label: 'Valid?', type: 'decision' as const },
        { id: 'end', label: 'End', type: 'end' as const },
      ],
      edges: [
        { from: 'start', to: 'check' },
        { from: 'check', to: 'end', label: 'Yes' },
        // Missing the "No" edge
      ],
    };
    const result = DiagramDefinitionSchema.safeParse(badDecision);
    expect(result.success).toBe(false);
  });

  it('rejects orphan nodes', () => {
    const orphan = {
      ...validDefinition,
      nodes: [
        { id: 'start', label: 'Start', type: 'start' as const },
        { id: 'lonely', label: 'Lonely Node', type: 'process' as const },
        { id: 'end', label: 'End', type: 'end' as const },
      ],
      edges: [{ from: 'start', to: 'end' }],
    };
    const result = DiagramDefinitionSchema.safeParse(orphan);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate node labels', () => {
    const dupes = {
      ...validDefinition,
      nodes: [
        { id: 'start', label: 'Start', type: 'start' as const },
        { id: 'step1', label: 'Process Step', type: 'process' as const },
        { id: 'step2', label: 'Process Step', type: 'process' as const },
        { id: 'end', label: 'End', type: 'end' as const },
      ],
      edges: [
        { from: 'start', to: 'step1' },
        { from: 'step1', to: 'step2' },
        { from: 'step2', to: 'end' },
      ],
    };
    const result = DiagramDefinitionSchema.safeParse(dupes);
    expect(result.success).toBe(false);
  });

  it('rejects non-kebab-case node IDs', () => {
    const badId = {
      ...validDefinition,
      nodes: [
        { id: 'Start Node', label: 'Start', type: 'start' as const },
        { id: 'end', label: 'End', type: 'end' as const },
      ],
      edges: [{ from: 'Start Node', to: 'end' }],
    };
    const result = DiagramDefinitionSchema.safeParse(badId);
    expect(result.success).toBe(false);
  });

  it('accepts decision node with exactly 2 outgoing edges', () => {
    const goodDecision = {
      ...validDefinition,
      nodes: [
        { id: 'start', label: 'Start', type: 'start' as const },
        { id: 'check', label: 'Is Valid?', type: 'decision' as const },
        { id: 'yes-path', label: 'Process Yes', type: 'process' as const },
        { id: 'no-path', label: 'Process No', type: 'process' as const },
        { id: 'end', label: 'End', type: 'end' as const },
      ],
      edges: [
        { from: 'start', to: 'check' },
        { from: 'check', to: 'yes-path', label: 'Yes' },
        { from: 'check', to: 'no-path', label: 'No' },
        { from: 'yes-path', to: 'end' },
        { from: 'no-path', to: 'end' },
      ],
    };
    const result = DiagramDefinitionSchema.safeParse(goodDecision);
    expect(result.success).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 3: diagramDefinitionToSource (pure function)
// ───────────────────────────────────────────────────────────────

describe('diagramDefinitionToSource', () => {
  it('converts a simple flowchart to Mermaid-like syntax', () => {
    const definition: DiagramDefinition = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'user', label: 'User Request', type: 'start' },
        { id: 'validate', label: 'Validate Input', type: 'process' },
        { id: 'response', label: 'Send Response', type: 'end' },
      ],
      edges: [
        { from: 'user', to: 'validate' },
        { from: 'validate', to: 'response' },
      ],
    };

    const source = diagramDefinitionToSource(definition);
    expect(source).toContain('Start --> Validate Input');
    expect(source).toContain('Validate Input --> End');
  });

  it('converts decision nodes to diamond syntax', () => {
    const definition: DiagramDefinition = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'start', label: 'Start', type: 'start' },
        { id: 'check', label: 'Valid?', type: 'decision' },
        { id: 'yes', label: 'Process', type: 'process' },
        { id: 'no', label: 'Error', type: 'process' },
        { id: 'end', label: 'End', type: 'end' },
      ],
      edges: [
        { from: 'start', to: 'check' },
        { from: 'check', to: 'yes', label: 'Yes' },
        { from: 'check', to: 'no', label: 'No' },
        { from: 'yes', to: 'end' },
      ],
    };

    const source = diagramDefinitionToSource(definition);
    expect(source).toContain('Start --> {Valid?}');
    expect(source).toContain('{Valid?} -->|Yes| Process');
    expect(source).toContain('{Valid?} -->|No| Error');
    expect(source).toContain('Process --> End');
  });

  it('uses "End" for end-type nodes', () => {
    const definition: DiagramDefinition = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'start', label: 'Start', type: 'start' },
        { id: 'end1', label: 'Custom End Label', type: 'end' },
      ],
      edges: [{ from: 'start', to: 'end1' }],
    };

    const source = diagramDefinitionToSource(definition);
    expect(source).toBe('Start --> End');
  });

  it('handles edges with labels', () => {
    const definition: DiagramDefinition = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'a', label: 'Step A', type: 'start' },
        { id: 'b', label: 'Step B', type: 'end' },
      ],
      edges: [{ from: 'a', to: 'b', label: 'Next' }],
    };

    const source = diagramDefinitionToSource(definition);
    expect(source).toBe('Start -->|Next| End');
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 3: mergeDiagram (pure function)
// ───────────────────────────────────────────────────────────────

describe('mergeDiagram', () => {
  const validDefinition: DiagramDefinition = {
    diagramType: 'flowchart',
    title: 'Test Diagram',
    caption: 'A test flowchart',
    nodes: [
      { id: 'start', label: 'Start', type: 'start' },
      { id: 'end', label: 'End', type: 'end' },
    ],
    edges: [{ from: 'start', to: 'end' }],
  };

  it('returns a valid widget config', () => {
    const result = mergeDiagram('Some text', validDefinition, 'test-diagram');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('test-diagram');
    expect(result!.type).toBe('diagram');
    expect(result!.props.diagramType).toBe('flowchart');
    expect(result!.props.source).toBe('Start --> End');
    expect(result!.props.caption).toBe('A test flowchart');
  });

  it('uses default widget ID when not specified', () => {
    const result = mergeDiagram('Some text', validDefinition);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('diagram-1');
  });

  it('falls back to title when caption is missing', () => {
    const noCaption: DiagramDefinition = {
      ...validDefinition,
      caption: undefined,
    };
    const result = mergeDiagram('Some text', noCaption);
    expect(result!.props.caption).toBe('Test Diagram');
  });

  it('returns null for empty source output', () => {
    const emptyDef: DiagramDefinition = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'start', label: 'Start', type: 'start' },
        { id: 'end', label: 'End', type: 'end' },
      ],
      edges: [], // No edges — but won't pass validation normally
    };
    // Force through by bypassing validation (this tests merge behavior)
    const result = mergeDiagram('text', emptyDef);
    expect(result).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 1: generateDiagramText (mocked AI)
// ───────────────────────────────────────────────────────────────

describe('generateDiagramText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls generateRawCompletion with text generation prompt', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce('HTTP requests flow from client to server...');

    const text = await generateDiagramText('HTTP Requests', mockSettings);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn.mock.calls[0][0]).toContain('technical educator');
    expect(mockFn.mock.calls[0][0]).toContain('visual thinker');
    expect(text).toContain('HTTP requests flow');
  });

  it('throws when AI call fails', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockRejectedValueOnce(new Error('API error'));

    await expect(generateDiagramText('Topic', mockSettings)).rejects.toThrow('API error');
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 2: extractDiagram (mocked AI)
// ───────────────────────────────────────────────────────────────

describe('extractDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validJson = JSON.stringify({
    diagramType: 'flowchart',
    title: 'Test',
    caption: 'A test diagram',
    nodes: [
      { id: 'start', label: 'Start', type: 'start' },
      { id: 'process', label: 'Process Data', type: 'process' },
      { id: 'end', label: 'End', type: 'end' },
    ],
    edges: [
      { from: 'start', to: 'process' },
      { from: 'process', to: 'end' },
    ],
  });

  it('extracts and validates a diagram from text', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(validJson);

    const definition = await extractDiagram('Some text about a process', mockSettings);

    expect(definition.nodes).toHaveLength(3);
    expect(definition.edges).toHaveLength(2);
    expect(definition.diagramType).toBe('flowchart');
  });

  it('uses strict prompt when useStrictPrompt is true', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(validJson);

    await extractDiagram('text', mockSettings, undefined, true);

    // Should use the strict system prompt
    expect(mockFn.mock.calls[0][0]).toContain('EXTREMELY strict');
    expect(mockFn.mock.calls[0][0]).toContain('SIMPLE diagram');
  });

  it('uses standard prompt when useStrictPrompt is false', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(validJson);

    await extractDiagram('text', mockSettings, undefined, false);

    expect(mockFn.mock.calls[0][0]).toContain('STRUCTURAL ACCURACY');
    expect(mockFn.mock.calls[0][0]).not.toContain('EXTREMELY strict');
  });

  it('strips code fences from AI response', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce('```json\n' + validJson + '\n```');

    const definition = await extractDiagram('text', mockSettings);
    expect(definition.nodes).toHaveLength(3);
  });

  it('throws on invalid JSON structure', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(JSON.stringify({ invalid: 'data' }));

    await expect(extractDiagram('text', mockSettings)).rejects.toThrow();
  });

  it('throws when validation fails (e.g., orphan nodes)', async () => {
    const badJson = JSON.stringify({
      diagramType: 'flowchart',
      nodes: [
        { id: 'start', label: 'Start', type: 'start' },
        { id: 'lonely', label: 'Orphan', type: 'process' },
        { id: 'end', label: 'End', type: 'end' },
      ],
      edges: [{ from: 'start', to: 'end' }],
    });

    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(badJson);

    await expect(extractDiagram('text', mockSettings)).rejects.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────
// Orchestrator: generateDiagram (full pipeline)
// ───────────────────────────────────────────────────────────────

describe('generateDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validDiagramJson = JSON.stringify({
    diagramType: 'flowchart',
    title: 'Test',
    caption: 'A test',
    nodes: [
      { id: 'start', label: 'Start', type: 'start' },
      { id: 'process', label: 'Process', type: 'process' },
      { id: 'end', label: 'End', type: 'end' },
    ],
    edges: [
      { from: 'start', to: 'process' },
      { from: 'process', to: 'end' },
    ],
  });

  it('runs full pipeline: text → extract → merge', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce('Here is a text explanation about the topic...')
      .mockResolvedValueOnce(validDiagramJson);

    const result = await generateDiagram(mockSettings, { topic: 'Test Topic' });

    expect(result.text).toContain('text explanation');
    expect(result.diagram).not.toBeNull();
    expect(result.widgetConfig).not.toBeNull();
    expect(result.textOnlyFallback).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('skips Stage 1 when existingText is provided', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(validDiagramJson);

    const result = await generateDiagram(mockSettings, {
      existingText: 'Pre-written text about the topic.',
      widgetId: 'my-diagram',
    });

    // Only 1 call (Stage 2), not 2
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('Pre-written text about the topic.');
    expect(result.widgetConfig).not.toBeNull();
    expect(result.widgetConfig!.id).toBe('my-diagram');
  });

  it('retries Stage 2 on validation failure (standard → strict)', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce('Text explanation...')
      .mockResolvedValueOnce(JSON.stringify({ invalid: true })) // Stage 2 fail
      .mockResolvedValueOnce(validDiagramJson); // Stage 2 retry success

    const result = await generateDiagram(mockSettings, { topic: 'Topic' });

    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(result.widgetConfig).not.toBeNull();
    expect(result.textOnlyFallback).toBe(false);
  });

  it('falls back to text-only after max retries exhausted', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce('Text explanation...')
      .mockResolvedValueOnce(JSON.stringify({ bad: 'data' })) // Attempt 1
      .mockResolvedValueOnce(JSON.stringify({ bad: 'data' })) // Attempt 2 (strict)
      .mockResolvedValueOnce(JSON.stringify({ bad: 'data' })); // Attempt 3 (strict)

    const result = await generateDiagram(mockSettings, {
      topic: 'Topic',
      maxRetries: 2,
    });

    expect(result.text).toContain('Text explanation');
    expect(result.diagram).toBeNull();
    expect(result.widgetConfig).toBeNull();
    expect(result.textOnlyFallback).toBe(true);
    expect(result.error).toContain('Stage 2');
  });

  it('returns error when neither topic nor existingText is provided', async () => {
    const result = await generateDiagram(mockSettings, {});

    expect(result.text).toBe('');
    expect(result.diagram).toBeNull();
    expect(result.widgetConfig).toBeNull();
    expect(result.textOnlyFallback).toBe(true);
    expect(result.error).toContain('Either');
  });

  it('returns error when Stage 1 fails', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockRejectedValueOnce(new Error('Network error'));

    const result = await generateDiagram(mockSettings, { topic: 'Topic' });

    expect(result.text).toContain('Failed to generate');
    expect(result.widgetConfig).toBeNull();
    expect(result.textOnlyFallback).toBe(true);
    expect(result.error).toContain('Stage 1');
  });

  it('uses custom widgetId in widget config', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce('Text...')
      .mockResolvedValueOnce(validDiagramJson);

    const result = await generateDiagram(mockSettings, {
      topic: 'Topic',
      widgetId: 'lesson-2-diagram',
    });

    expect(result.widgetConfig!.id).toBe('lesson-2-diagram');
  });
});

// ───────────────────────────────────────────────────────────────
// System Prompts (quality checks)
// ───────────────────────────────────────────────────────────────

describe('System Prompts', () => {
  it('DIAGRAM_TEXT_SYSTEM_PROMPT mentions diagram-aware thinking', async () => {
    const { DIAGRAM_TEXT_SYSTEM_PROMPT } = await import('@/engine/diagramGenerator');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('components');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('relationships');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('flows');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('decision points');
  });

  it('DIAGRAM_EXTRACTION_SYSTEM_PROMPT requires JSON-only output', async () => {
    const { DIAGRAM_EXTRACTION_SYSTEM_PROMPT } = await import('@/engine/diagramGenerator');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('ONLY output valid JSON');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('MUST be "{"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('MUST be "}"');
  });

  it('DIAGRAM_EXTRACTION_STRICT_PROMPT is more restrictive', async () => {
    const { DIAGRAM_EXTRACTION_STRICT_PROMPT } = await import('@/engine/diagramGenerator');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('EXTREMELY strict');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('No more than 8 nodes');
  });

  it('each stage has a distinct system prompt', async () => {
    const {
      DIAGRAM_TEXT_SYSTEM_PROMPT,
      DIAGRAM_EXTRACTION_SYSTEM_PROMPT,
      DIAGRAM_EXTRACTION_STRICT_PROMPT,
    } = await import('@/engine/diagramGenerator');

    // Stage 1 is about writing, not JSON
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('markdown');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).not.toContain('JSON API');

    // Stage 2 is about JSON extraction
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('JSON API');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('markdown text');

    // Strict prompt is even more constrained
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('ZERO TOLERANCE');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).not.toEqual(DIAGRAM_EXTRACTION_SYSTEM_PROMPT);
  });
});
