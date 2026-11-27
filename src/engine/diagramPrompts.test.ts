import { describe, it, expect } from 'vitest';
import {
  DIAGRAM_TEXT_SYSTEM_PROMPT,
  DIAGRAM_EXTRACTION_SYSTEM_PROMPT,
  DIAGRAM_EXTRACTION_STRICT_PROMPT,
  DIAGRAM_FEW_SHOT_EXAMPLES,
  DIAGRAM_FEW_SHOT_DIAGRAMS,
  buildDiagramTextUserPrompt,
  buildDiagramExtractionUserPrompt,
} from '@/engine/diagramPrompts';
import { DiagramSchema } from '@/engine/generatorSchema';

// ───────────────────────────────────────────────────────────────
// Stage 1: Text Generation Prompt
// ───────────────────────────────────────────────────────────────

describe('DIAGRAM_TEXT_SYSTEM_PROMPT', () => {
  it('defines the role as expert technical educator', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('expert technical educator');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('visual thinker');
  });

  it('emphasizes diagram-aware thinking (components, relationships, flows)', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('components');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('relationships');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('flows');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('decision points');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('NODES');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('EDGES');
  });

  it('specifies the word count constraint (200-400 words)', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('200-400');
  });

  it('explicitly forbids JSON output and requires markdown', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('No JSON');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('markdown text');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).not.toContain('JSON API');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).not.toContain('"nodes"');
  });

  it('includes the WHAT-WHY-HOW pedagogical structure', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('WHAT');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('WHY');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('HOW');
  });

  it('requires the machine-readable "Key components:" trailer line', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('Key components:');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('3-8');
  });

  it('models the trailer format with few-shot examples (W1.3)', () => {
    // The trailer is regex-parsed by the generator, so an unmodelled format is a
    // silent loss of every key component.
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('EXAMPLES OF A CORRECT FINAL LINE');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toMatch(
      /Key components: [A-Z][^,\n]+, [A-Z][^,\n]+, [A-Z][^\n]*/
    );
  });

  it('tells the model the listed names are reused verbatim as node labels', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('VERBATIM');
  });

  it('instructs the model to use context and previous concepts', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('previously covered concepts');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('do NOT re-explain');
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 2: Diagram Extraction Prompt (Standard)
// ───────────────────────────────────────────────────────────────

describe('DIAGRAM_EXTRACTION_SYSTEM_PROMPT', () => {
  it('defines the role as JSON API (no prose)', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('JSON API');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('ONLY output valid JSON');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('STRUCTURAL ACCURACY');
  });

  it('enforces JSON-only output rules', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('MUST be "{"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('MUST be "}"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('Do NOT write introductory');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('Do NOT use markdown code blocks');
  });

  it('describes exactly the four W1.2 diagram types', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"flow"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"relationship"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"architecture"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"sequence"');
    // Old schema types must be gone
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('"flowchart"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('"class"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('"er"');
  });

  it('describes all six W1.2 node types', () => {
    for (const nodeType of ['input', 'process', 'decision', 'output', 'storage', 'service']) {
      expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain(`"${nodeType}"`);
    }
    // Old schema node types must be gone
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('"start"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('"end"');
  });

  it('states the W1.2 size and field constraints', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('2-8 nodes');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('1-10 edges');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('max 20 characters');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('max 15 characters');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('max 50 characters');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('max 200 characters');
  });

  it('states the semantic validation rules', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('kebab-case');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('unique');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('orphan');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('acyclic');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('at least 2 outgoing edges');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('reference existing node IDs');
  });

  it('teaches schema Rule 5 (one connected graph), which "no orphans" does not cover', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toMatch(/ONE connected graph/i);
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toMatch(/connected/i);
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toMatch(/Disconnected subgraphs/i);
  });

  it('gives an explicit policy for the optional styling fields the schema validates', () => {
    // A malformed "color"/"icon" rejects the entire diagram, and
    // fixCommonDiagramErrors cannot repair it, so the prompt must address it.
    for (const prompt of [DIAGRAM_EXTRACTION_SYSTEM_PROMPT, DIAGRAM_EXTRACTION_STRICT_PROMPT]) {
      expect(prompt).toMatch(/SHOULD BE OMITTED|Do NOT output/);
      expect(prompt).toContain('"color"');
      expect(prompt).toContain('"icon"');
    }
  });

  it('includes the exact JSON shape and few-shot examples', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"nodes"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"edges"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('EXAMPLE 1');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('EXAMPLE 4');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain(DIAGRAM_FEW_SHOT_EXAMPLES);
  });

  it('is not the strict variant', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('EXTREMELY strict');
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 2: Strict/Retry Prompt
// ───────────────────────────────────────────────────────────────

describe('DIAGRAM_EXTRACTION_STRICT_PROMPT', () => {
  it('is more restrictive than the standard prompt', () => {
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('EXTREMELY strict');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('ZERO TOLERANCE');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('SIMPLE diagram');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('No more than 5 nodes');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).not.toEqual(DIAGRAM_EXTRACTION_SYSTEM_PROMPT);
  });

  it('lists the common mistakes that cause rejection', () => {
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Dangling edges');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Orphan nodes');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Cycles');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Duplicate node IDs');
  });

  it('still enforces JSON-only output', () => {
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('JSON API');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('MUST be "{"');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('MUST be "}"');
  });
});

// ───────────────────────────────────────────────────────────────
// Few-shot examples — must be valid against the W1.2 schema
// ───────────────────────────────────────────────────────────────

describe('DIAGRAM_FEW_SHOT_DIAGRAMS', () => {
  it('every example passes DiagramSchema validation', () => {
    for (const diagram of DIAGRAM_FEW_SHOT_DIAGRAMS) {
      const result = DiagramSchema.safeParse(diagram);
      if (!result.success) {
        // Surface which example failed for easy debugging
        throw new Error(
          `Few-shot example "${diagram.title}" is invalid: ${result.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`
        );
      }
      expect(result.success).toBe(true);
    }
  });

  it('covers all four diagram types', () => {
    const types = new Set(DIAGRAM_FEW_SHOT_DIAGRAMS.map((d) => d.type));
    expect(types).toEqual(new Set(['flow', 'relationship', 'architecture', 'sequence']));
  });
});

// ───────────────────────────────────────────────────────────────
// User prompt builders
// ───────────────────────────────────────────────────────────────

describe('buildDiagramTextUserPrompt', () => {
  it('includes topic, context and previous concepts', () => {
    const prompt = buildDiagramTextUserPrompt('HTTP Requests', 'Web fundamentals lesson.', [
      'DNS',
      'TCP',
    ]);
    expect(prompt).toContain('Topic: HTTP Requests');
    expect(prompt).toContain('Web fundamentals lesson.');
    expect(prompt).toContain('- DNS');
    expect(prompt).toContain('- TCP');
    expect(prompt).toContain('Key components:');
  });

  it('handles empty context and empty concept list gracefully', () => {
    const prompt = buildDiagramTextUserPrompt('Topic', '', []);
    expect(prompt).toContain('(no additional context provided)');
    expect(prompt).toContain('(none — this is the first concept)');
  });

  it('is deterministic (same input → same prompt)', () => {
    const a = buildDiagramTextUserPrompt('T', 'C', ['X']);
    const b = buildDiagramTextUserPrompt('T', 'C', ['X']);
    expect(a).toBe(b);
  });
});

describe('buildDiagramExtractionUserPrompt', () => {
  const text = 'The client sends a request to the server.';
  const components = ['Client', 'Server'];

  it('includes the text and key components', () => {
    const prompt = buildDiagramExtractionUserPrompt(text, components);
    expect(prompt).toContain(text);
    expect(prompt).toContain('- Client');
    expect(prompt).toContain('- Server');
    expect(prompt).toContain('Return ONLY the JSON object');
  });

  it('forces the diagram type when provided', () => {
    const prompt = buildDiagramExtractionUserPrompt(text, components, 'architecture');
    expect(prompt).toContain('REQUIRED DIAGRAM TYPE: "architecture"');
  });

  it('lets the model choose the type when none is provided', () => {
    const prompt = buildDiagramExtractionUserPrompt(text, components);
    expect(prompt).toContain('choose the most appropriate');
    expect(prompt).not.toContain('REQUIRED DIAGRAM TYPE');
  });

  it('handles missing key components', () => {
    const prompt = buildDiagramExtractionUserPrompt(text, []);
    expect(prompt).toContain('not provided');
  });

  it('uses the SIMPLE task line in strict mode', () => {
    const prompt = buildDiagramExtractionUserPrompt(text, components, undefined, { strict: true });
    expect(prompt).toContain('SIMPLE diagram (max 5 nodes');
  });

  it('clamps the component list to the strict node budget instead of contradicting it', () => {
    const eight = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8'];
    const strict = buildDiagramExtractionUserPrompt(text, eight, undefined, { strict: true });
    // Stage 1 may name 8 components while the strict prompt allows 5 nodes.
    for (const kept of ['A1', 'B2', 'C3', 'D4', 'E5']) expect(strict).toContain(`- ${kept}`);
    for (const dropped of ['F6', 'G7', 'H8']) expect(strict).not.toContain(`- ${dropped}`);
    expect(strict).toContain('do NOT add extra nodes');

    const relaxed = buildDiagramExtractionUserPrompt(text, eight);
    expect(relaxed).toContain('- H8');
    expect(relaxed).toContain('you may add 1-2 connecting nodes');
  });

  it('keeps the budget in sync with the strict system prompt cap', () => {
    const strictPrompt = buildDiagramExtractionUserPrompt(
      text,
      Array.from({ length: 9 }, (_, i) => `C${i}`),
      undefined,
      { strict: true }
    );
    const listed = (strictPrompt.match(/^- C\d/gm) ?? []).length;
    const cap = Number(DIAGRAM_EXTRACTION_STRICT_PROMPT.match(/No more than (\d+) nodes/)?.[1]);
    expect(cap).toBe(5);
    expect(listed).toBe(Math.min(9, cap));
  });

  it('asks for a minimal repair rather than a redesign on retry', () => {
    const prompt = buildDiagramExtractionUserPrompt(text, components, undefined, {
      strict: true,
      validationError: 'Orphan node detected: lonely has no connections',
    });
    expect(prompt).toMatch(/same conceptual structure/i);
    expect(prompt).toMatch(/do NOT redesign/i);
  });

  it('embeds validator error feedback on retries', () => {
    const prompt = buildDiagramExtractionUserPrompt(text, components, undefined, {
      strict: true,
      validationError: 'No orphan nodes allowed — every node must have at least one edge.',
    });
    expect(prompt).toContain('REJECTED BY THE VALIDATOR');
    expect(prompt).toContain('No orphan nodes allowed');
  });

  it('omits the error block when there is no validation error', () => {
    const prompt = buildDiagramExtractionUserPrompt(text, components);
    expect(prompt).not.toContain('REJECTED BY THE VALIDATOR');
  });

  it('is deterministic (same input → same prompt)', () => {
    const a = buildDiagramExtractionUserPrompt(text, components, 'flow', { strict: true });
    const b = buildDiagramExtractionUserPrompt(text, components, 'flow', { strict: true });
    expect(a).toBe(b);
  });
});
