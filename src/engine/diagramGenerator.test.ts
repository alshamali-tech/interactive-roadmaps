import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateDiagramText,
  extractDiagramJSON,
  mergeAndValidate,
  generateContextDiagram,
  buildTextFallback,
  extractKeyComponents,
  normalizeDiagramCandidate,
  defaultDiagramWidgetId,
  clearDiagramCaches,
} from '@/engine/diagramGenerator';
import { WidgetConfigSchema, type Diagram } from '@/engine/generatorSchema';
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

/** A minimal valid W1.2 flow diagram (input → process → output). */
const validDiagram: Diagram = {
  type: 'flow',
  title: 'Test Flow',
  nodes: [
    { id: 'start', label: 'Start', type: 'input' },
    { id: 'process', label: 'Process Data', type: 'process' },
    { id: 'end', label: 'End', type: 'output' },
  ],
  edges: [
    { from: 'start', to: 'process' },
    { from: 'process', to: 'end' },
  ],
};
const validDiagramJson = JSON.stringify(validDiagram);

/** Stage 1-style AI response with the "Key components:" trailer. */
const stage1Response =
  'The Client sends a request. The Server processes it and returns a Response.\n\nKey components: Client, Server, Response';

/** JSON that fails W1.2 validation (orphan node). */
const orphanJson = JSON.stringify({
  type: 'flow',
  title: 'Bad Flow',
  nodes: [
    { id: 'start', label: 'Start', type: 'input' },
    { id: 'lonely', label: 'Orphan', type: 'process' },
    { id: 'end', label: 'End', type: 'output' },
  ],
  edges: [{ from: 'start', to: 'end' }],
});

const runtime = { settings: mockSettings, retryBaseDelayMs: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  clearDiagramCaches();
});

afterEach(() => {
  vi.useRealTimers();
});

// ───────────────────────────────────────────────────────────────
// Stage 1: generateDiagramText
// ───────────────────────────────────────────────────────────────

describe('generateDiagramText (Stage 1)', () => {
  const input = {
    topic: 'HTTP Requests',
    context: 'Lesson about web fundamentals.',
    previousConcept: ['DNS', 'TCP'],
  };

  it('returns { text, keyComponents } parsed from the trailer line', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(stage1Response);

    const result = await generateDiagramText(input, { settings: mockSettings });

    expect(result.text).toBe(
      'The Client sends a request. The Server processes it and returns a Response.'
    );
    expect(result.keyComponents).toEqual(['Client', 'Server', 'Response']);
    // Trailer line must be removed from the lesson text
    expect(result.text).not.toContain('Key components:');
  });

  it('passes topic, context and previous concepts into the prompt', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(stage1Response);

    await generateDiagramText(input, { settings: mockSettings });

    expect(mockFn).toHaveBeenCalledTimes(1);
    const [systemPrompt, userPrompt] = mockFn.mock.calls[0];
    expect(systemPrompt).toContain('expert technical educator');
    expect(systemPrompt).toContain('visual thinker');
    expect(userPrompt).toContain('HTTP Requests');
    expect(userPrompt).toContain('Lesson about web fundamentals.');
    expect(userPrompt).toContain('- DNS');
    expect(userPrompt).toContain('- TCP');
  });

  it('supports a bold trailer variant (**Key components:** ...)', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce('Some explanation.\n**Key components:** Client; Server');

    const result = await generateDiagramText(input, { settings: mockSettings });
    expect(result.keyComponents).toEqual(['Client', 'Server']);
    expect(result.text).toBe('Some explanation.');
  });

  it('falls back to **bold** extraction when the trailer is missing', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce('Use **Client** then **Server** and **Database**.');

    const result = await generateDiagramText(input, { settings: mockSettings });
    expect(result.keyComponents).toEqual(['Client', 'Server', 'Database']);
  });

  it('returns empty keyComponents for plain prose with no markers', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce('Plain prose with no markers at all.');

    const result = await generateDiagramText(input, { settings: mockSettings });
    expect(result.keyComponents).toEqual([]);
    expect(result.text).toBe('Plain prose with no markers at all.');
  });

  it('dedupes (case-insensitive), caps at 8 and clamps to 20 chars', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(
      'Text.\nKey components: A, a, B, C, D, E, F, G, H, I, ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    );

    const result = await generateDiagramText(input, { settings: mockSettings });
    expect(result.keyComponents).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

    mockFn.mockResolvedValueOnce('Text.\nKey components: ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    clearDiagramCaches();
    const clamped = await generateDiagramText(input, { settings: mockSettings });
    expect(clamped.keyComponents).toEqual(['ABCDEFGHIJKLMNOPQRST']);
  });

  it('strips wrapping markdown code fences', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce('```markdown\nText body.\nKey components: A, B\n```');

    const result = await generateDiagramText(input, { settings: mockSettings });
    expect(result.text).toBe('Text body.');
    expect(result.text).not.toContain('```');
  });

  it('caches identical input — second call reuses text without an AI call', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(stage1Response);

    const first = await generateDiagramText(input, { settings: mockSettings });
    const second = await generateDiagramText(input, { settings: mockSettings });

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('throws when the AI call fails', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockRejectedValueOnce(new Error('API error'));

    await expect(generateDiagramText(input, { settings: mockSettings })).rejects.toThrow(
      'API error'
    );
  });

  it('throws on empty topic', async () => {
    await expect(
      generateDiagramText({ topic: '  ', context: '', previousConcept: [] }, { settings: mockSettings })
    ).rejects.toThrow('topic');
  });

  it('rejects with AbortError when the signal is already aborted', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateDiagramText(input, { settings: mockSettings, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFn).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 2: extractDiagramJSON
// ───────────────────────────────────────────────────────────────

describe('extractDiagramJSON (Stage 2)', () => {
  const input = { text: 'Some text about a process.', keyComponents: ['Client', 'Server'] };

  it('extracts and validates a Diagram from text (temperature 0)', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(validDiagramJson);

    const diagram = await extractDiagramJSON(input, runtime);

    expect(diagram).not.toBeNull();
    expect(diagram!.nodes).toHaveLength(3);
    expect(diagram!.edges).toHaveLength(2);
    expect(diagram!.type).toBe('flow');
    expect(mockFn.mock.calls[0][3]).toMatchObject({ temperature: 0 });
  });

  it('includes key components and forced diagram type in the prompt', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(validDiagramJson);

    await extractDiagramJSON({ ...input, diagramType: 'architecture' }, runtime);

    const userPrompt = mockFn.mock.calls[0][1];
    expect(userPrompt).toContain('- Client');
    expect(userPrompt).toContain('- Server');
    expect(userPrompt).toContain('REQUIRED DIAGRAM TYPE: "architecture"');
  });

  it('strips code fences from the AI response', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce('```json\n' + validDiagramJson + '\n```');

    const diagram = await extractDiagramJSON(input, runtime);
    expect(diagram!.nodes).toHaveLength(3);
  });

  it('retries with the strict prompt + validator error feedback on failure', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce(orphanJson) // attempt 1: orphan node → validation fails
      .mockResolvedValueOnce(validDiagramJson); // attempt 2: success

    const diagram = await extractDiagramJSON(input, runtime);

    expect(diagram).not.toBeNull();
    expect(mockFn).toHaveBeenCalledTimes(2);
    // Attempt 1 used the standard prompt
    expect(mockFn.mock.calls[0][0]).toContain('STRUCTURAL ACCURACY');
    expect(mockFn.mock.calls[0][0]).not.toContain('EXTREMELY strict');
    // Attempt 2 used the strict prompt and included the exact validator error
    expect(mockFn.mock.calls[1][0]).toContain('EXTREMELY strict');
    expect(mockFn.mock.calls[1][1]).toContain('REJECTED BY THE VALIDATOR');
    expect(mockFn.mock.calls[1][1]).toContain('orphan');
  });

  it('returns null after exhausting all attempts (default: 3 total)', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValue(orphanJson);

    const diagram = await extractDiagramJSON(input, runtime);

    expect(diagram).toBeNull();
    expect(mockFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('respects maxRetries: 0 (single attempt)', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(orphanJson);

    const diagram = await extractDiagramJSON(input, { ...runtime, maxRetries: 0 });

    expect(diagram).toBeNull();
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('treats non-JSON responses as failed attempts and recovers on retry', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce('Sorry, I cannot produce JSON.')
      .mockResolvedValueOnce(validDiagramJson);

    const diagram = await extractDiagramJSON(input, runtime);
    expect(diagram).not.toBeNull();
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('is idempotent — same input twice returns the same output with one AI call', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(validDiagramJson);

    const first = await extractDiagramJSON(input, runtime);
    const second = await extractDiagramJSON(input, runtime);

    expect(first).toEqual(validDiagram);
    expect(second).toEqual(first);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('uses a different cache key for a different diagram type', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValue(validDiagramJson);

    await extractDiagramJSON(input, runtime);
    await extractDiagramJSON({ ...input, diagramType: 'sequence' }, runtime);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('clamps over-long labels/title/edge labels before validation (weak-model rescue)', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    const longJson = JSON.stringify({
      type: 'flow',
      title: 'T'.repeat(80),
      nodes: [
        { id: 'start', label: 'Start', type: 'input' },
        { id: 'end', label: 'A very long label that exceeds twenty characters', type: 'output', description: 'D'.repeat(300) },
      ],
      edges: [{ from: 'start', to: 'end', label: 'L'.repeat(30) }],
    });
    mockFn.mockResolvedValueOnce(longJson);

    const diagram = await extractDiagramJSON(input, runtime);

    expect(diagram).not.toBeNull();
    expect(diagram!.title.length).toBeLessThanOrEqual(50);
    expect(diagram!.nodes[1].label.length).toBeLessThanOrEqual(20);
    expect(diagram!.nodes[1].description!.length).toBeLessThanOrEqual(200);
    expect(diagram!.edges[0].label!.length).toBeLessThanOrEqual(15);
  });

  it('uses exponential backoff between retries (500ms → 1000ms)', async () => {
    vi.useFakeTimers();
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValue(orphanJson);

    const promise = extractDiagramJSON(input, { settings: mockSettings }); // default base 500

    await vi.advanceTimersByTimeAsync(0); // attempt 1 runs, schedules 500ms backoff
    expect(mockFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(499);
    expect(mockFn).toHaveBeenCalledTimes(1); // still waiting

    await vi.advanceTimersByTimeAsync(1); // 500ms elapsed → attempt 2
    expect(mockFn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(999);
    expect(mockFn).toHaveBeenCalledTimes(2); // waiting 1000ms this time

    await vi.advanceTimersByTimeAsync(1); // 1000ms elapsed → attempt 3
    expect(mockFn).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toBeNull();
  });

  it('rejects with AbortError when aborted during backoff', async () => {
    vi.useFakeTimers();
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValue(orphanJson);
    const controller = new AbortController();

    const promise = extractDiagramJSON(input, {
      settings: mockSettings,
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(0); // attempt 1 fails, backoff scheduled
    controller.abort();

    await assertion;
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('throws on empty text input', async () => {
    await expect(
      extractDiagramJSON({ text: '   ', keyComponents: [] }, runtime)
    ).rejects.toThrow('text');
  });
});

// ───────────────────────────────────────────────────────────────
// normalizeDiagramCandidate (pure helper)
// ───────────────────────────────────────────────────────────────

describe('normalizeDiagramCandidate', () => {
  it('clamps string fields but never touches IDs, types or structure', () => {
    const input = {
      type: 'flow',
      title: 'T'.repeat(60),
      nodes: [{ id: 'My-ID', label: 'L'.repeat(30), type: 'input' }],
      edges: [{ from: 'My-ID', to: 'My-ID', label: 'E'.repeat(20) }],
    };
    const result = normalizeDiagramCandidate(input) as typeof input;

    expect(result.title).toHaveLength(50);
    expect(result.nodes[0].label).toHaveLength(20);
    expect(result.nodes[0].id).toBe('My-ID');
    expect(result.nodes[0].type).toBe('input');
    expect(result.edges[0].label).toHaveLength(15);
  });

  it('passes non-objects through unchanged', () => {
    expect(normalizeDiagramCandidate(null)).toBeNull();
    expect(normalizeDiagramCandidate('str')).toBe('str');
    expect(normalizeDiagramCandidate(42)).toBe(42);
  });
});

// ───────────────────────────────────────────────────────────────
// buildTextFallback (pure, deterministic text representation)
// ───────────────────────────────────────────────────────────────

describe('buildTextFallback', () => {
  it('always includes a friendly note explaining the diagram is unavailable', () => {
    const result = buildTextFallback('', []);
    expect(result).toContain('could not be generated');
    expect(result.length).toBeGreaterThan(0);
  });

  it('builds a numbered walkthrough enriched with matching sentences', () => {
    const text = 'The Client sends a request. The Server handles it and replies.';
    const result = buildTextFallback(text, ['Client', 'Server']);

    expect(result).toContain('1. **Client** — The Client sends a request.');
    expect(result).toContain('2. **Server** — The Server handles it and replies.');
  });

  it('lists components without descriptions when no sentence matches', () => {
    const result = buildTextFallback('Unrelated prose.', ['Alpha', 'Beta']);
    expect(result).toContain('1. **Alpha**');
    expect(result).toContain('2. **Beta**');
    expect(result).not.toContain('—');
  });

  it('reuses existing list lines when fewer than 2 components are known', () => {
    const text = 'Intro.\n1. First step\n2. Second step\n3. Third step';
    const result = buildTextFallback(text, []);
    expect(result).toContain('### Summary');
    expect(result).toContain('1. First step');
    expect(result).toContain('3. Third step');
  });

  it('summarizes prose sentences as bullets when no lists exist', () => {
    const text =
      'This is the first reasonably long sentence. This is the second reasonably long sentence.';
    const result = buildTextFallback(text, []);
    expect(result).toContain('- This is the first reasonably long sentence.');
  });
});

// ───────────────────────────────────────────────────────────────
// extractKeyComponents / defaultDiagramWidgetId (pure helpers)
// ───────────────────────────────────────────────────────────────

describe('pure helpers', () => {
  it('extractKeyComponents collects bold spans, then headings', () => {
    expect(extractKeyComponents('A **Client** and a **Server**.')).toEqual(['Client', 'Server']);
    expect(extractKeyComponents('## First Concept\nprose\n## Second Concept')).toEqual([
      'First Concept',
      'Second Concept',
    ]);
    expect(extractKeyComponents('nothing special')).toEqual([]);
  });

  it('defaultDiagramWidgetId slugifies the topic deterministically', () => {
    expect(defaultDiagramWidgetId('HTTP Requests!')).toBe('http-requests-diagram');
    expect(defaultDiagramWidgetId('')).toBe('context-diagram-1');
    expect(defaultDiagramWidgetId('TCP/IP Handshake')).toBe('tcp-ip-handshake-diagram');
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 3: mergeAndValidate (pure)
// ───────────────────────────────────────────────────────────────

describe('mergeAndValidate (Stage 3)', () => {
  it('produces markdown with a {{widget:id}} marker and a valid widget config', () => {
    const result = mergeAndValidate(
      { text: 'Some explanation.', diagram: validDiagram },
      { widgetId: 'my-diagram' }
    );

    expect(result.markdown).toContain('Some explanation.');
    expect(result.markdown).toContain('{{widget:my-diagram}}');
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0].id).toBe('my-diagram');
    expect(result.widgets[0].type).toBe('context-diagram');
    expect(WidgetConfigSchema.safeParse(result.widgets[0]).success).toBe(true);
    if (result.widgets[0].type === 'context-diagram') {
      expect(result.widgets[0].props.diagram).toEqual(validDiagram);
    }
  });

  it('uses the default widget ID when none is provided', () => {
    const result = mergeAndValidate({ text: 'text', diagram: validDiagram });
    expect(result.widgets[0].id).toBe('context-diagram-1');
    expect(result.markdown).toContain('{{widget:context-diagram-1}}');
  });

  it('returns text-only output with a note when diagram is null', () => {
    const result = mergeAndValidate({
      text: 'The Client sends a request. The Server replies.',
      diagram: null,
      keyComponents: ['Client', 'Server'],
    });

    expect(result.widgets).toEqual([]);
    expect(result.markdown).toContain('The Client sends a request.');
    expect(result.markdown).toContain('could not be generated');
    expect(result.markdown).toContain('1. **Client**');
    expect(result.markdown).not.toContain('{{widget:');
  });

  it('falls back to text-only when the diagram fails re-validation', () => {
    const invalid = {
      ...validDiagram,
      nodes: [...validDiagram.nodes, { id: 'orphan', label: 'Orphan', type: 'process' }],
    } as unknown as Diagram;

    const result = mergeAndValidate({ text: 'Some text.', diagram: invalid });
    expect(result.widgets).toEqual([]);
    expect(result.markdown).toContain('Some text.');
    expect(result.markdown).toContain('could not be generated');
  });

  it('never returns empty markdown, even with empty text and no diagram', () => {
    const result = mergeAndValidate({ text: '', diagram: null });
    expect(result.markdown.length).toBeGreaterThan(0);
    expect(result.widgets).toEqual([]);
  });

  it('is pure — makes no AI calls', () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mergeAndValidate({ text: 'text', diagram: validDiagram });
    mergeAndValidate({ text: 'text', diagram: null });
    expect(mockFn).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────
// Orchestrator: generateContextDiagram (end-to-end)
// ───────────────────────────────────────────────────────────────

describe('generateContextDiagram (orchestrator)', () => {
  it('runs the full pipeline: text → JSON → merge', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce(stage1Response)
      .mockResolvedValueOnce(validDiagramJson);

    const result = await generateContextDiagram('HTTP Requests', 'lesson context', ['DNS'], runtime);

    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(result.text).toContain('The Client sends a request.');
    expect(result.keyComponents).toEqual(['Client', 'Server', 'Response']);
    expect(result.diagram).toEqual(validDiagram);
    expect(result.widgets).toHaveLength(1);
    expect(result.markdown).toContain('{{widget:http-requests-diagram}}');
    expect(result.textOnlyFallback).toBe(false);
    expect(result.retriesUsed).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('skips Stage 1 when skipTextGeneration + existingText are provided', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(validDiagramJson);

    const result = await generateContextDiagram('Topic', 'unused context', [], {
      ...runtime,
      skipTextGeneration: true,
      existingText: 'Pre-written text about **Client** and **Server**.',
      widgetId: 'custom-id',
    });

    expect(mockFn).toHaveBeenCalledTimes(1); // Stage 2 only
    expect(result.text).toBe('Pre-written text about **Client** and **Server**.');
    expect(result.keyComponents).toEqual(['Client', 'Server']);
    expect(result.widgets[0].id).toBe('custom-id');
  });

  it('uses context as the text when skipping without existingText', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(validDiagramJson);

    const result = await generateContextDiagram('Topic', 'Context text with **Client**.', [], {
      ...runtime,
      skipTextGeneration: true,
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('Context text with **Client**.');
  });

  it('reports retriesUsed when Stage 2 succeeds on a retry', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce(stage1Response)
      .mockResolvedValueOnce(orphanJson)
      .mockResolvedValueOnce(validDiagramJson);

    const result = await generateContextDiagram('Topic', '', [], runtime);

    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(result.widgets).toHaveLength(1);
    expect(result.retriesUsed).toBe(1);
    expect(result.textOnlyFallback).toBe(false);
  });

  it('falls back to useful text-only output when all Stage 2 attempts fail', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce(stage1Response)
      .mockResolvedValue(orphanJson);

    const result = await generateContextDiagram('Topic', '', [], runtime);

    expect(result.diagram).toBeNull();
    expect(result.widgets).toEqual([]);
    expect(result.textOnlyFallback).toBe(true);
    expect(result.retriesUsed).toBe(2);
    expect(result.error).toContain('Stage 2');
    // Fallback must still be useful: original text + note + component outline
    expect(result.markdown).toContain('The Client sends a request.');
    expect(result.markdown).toContain('could not be generated');
    expect(result.markdown).toContain('1. **Client**');
  });

  it('never fails by default: Stage 1 failure returns context-based text-only', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockRejectedValueOnce(new Error('Network error'));

    const result = await generateContextDiagram('Topic', 'Helpful existing context.', [], runtime);

    expect(result.textOnlyFallback).toBe(true);
    expect(result.widgets).toEqual([]);
    expect(result.text).toBe('Helpful existing context.');
    expect(result.error).toContain('Stage 1');
    expect(result.error).toContain('Network error');
    expect(result.markdown).toContain('Helpful existing context.');
  });

  it('throws on Stage 1 failure when fallbackToTextOnly is false', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      generateContextDiagram('Topic', '', [], { ...runtime, fallbackToTextOnly: false })
    ).rejects.toThrow('Stage 1');
  });

  it('throws on Stage 2 failure when fallbackToTextOnly is false', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn.mockResolvedValueOnce(stage1Response).mockResolvedValue(orphanJson);

    await expect(
      generateContextDiagram('Topic', '', [], { ...runtime, fallbackToTextOnly: false })
    ).rejects.toThrow('Stage 2');
  });

  it('reuses cached Stage 1 text across pipeline runs (no text regeneration)', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    mockFn
      .mockResolvedValueOnce(stage1Response) // run 1: Stage 1
      .mockResolvedValueOnce(validDiagramJson) // run 1: Stage 2
      .mockResolvedValueOnce(validDiagramJson); // run 2: Stage 2 only (different type → cache miss)

    const first = await generateContextDiagram('Topic', 'ctx', [], runtime);
    const second = await generateContextDiagram('Topic', 'ctx', [], {
      ...runtime,
      diagramType: 'sequence',
    });

    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(second.text).toBe(first.text);
    expect(second.keyComponents).toEqual(first.keyComponents);
  });

  it('returns a graceful error result when no topic and no skip text exist', async () => {
    const result = await generateContextDiagram('', '', [], runtime);

    expect(result.textOnlyFallback).toBe(true);
    expect(result.widgets).toEqual([]);
    expect(result.error).toBeDefined();
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('errors gracefully when skipTextGeneration has no text to use', async () => {
    const result = await generateContextDiagram('Topic', '', [], {
      ...runtime,
      skipTextGeneration: true,
    });

    expect(result.textOnlyFallback).toBe(true);
    expect(result.error).toContain('skipTextGeneration');
  });

  it('propagates aborts even when fallbackToTextOnly is true', async () => {
    const mockFn = vi.mocked(aiService.generateRawCompletion);
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateContextDiagram('Topic', '', [], { ...runtime, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFn).not.toHaveBeenCalled();
  });
});
