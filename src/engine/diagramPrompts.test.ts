import { describe, it, expect } from 'vitest';
import {
  DIAGRAM_TEXT_SYSTEM_PROMPT,
  DIAGRAM_EXTRACTION_SYSTEM_PROMPT,
  DIAGRAM_EXTRACTION_STRICT_PROMPT,
  DIAGRAM_FALLBACK_SYSTEM_PROMPT,
  DIAGRAM_FEW_SHOT_EXAMPLES,
  buildFallbackUserPrompt,
} from '@/engine/diagramPrompts';

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

  it('specifies word count constraint (200-400 words)', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('200-400');
  });

  it('explicitly forbids JSON output', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('No JSON');
  });

  it('requires markdown output', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('markdown text');
  });

  it('includes the WHAT-WHY-HOW pedagogical structure', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('WHAT');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('WHY');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('HOW');
  });

  it('does NOT contain JSON API language', () => {
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).not.toContain('JSON API');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).not.toContain('"diagramType"');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).not.toContain('"nodes"');
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 2: Diagram Extraction Prompt (Standard)
// ───────────────────────────────────────────────────────────────

describe('DIAGRAM_EXTRACTION_SYSTEM_PROMPT', () => {
  it('defines the role as JSON API (no prose)', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('JSON API');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('ONLY output valid JSON');
  });

  it('enforces JSON-only output rules', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('MUST be "{"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('MUST be "}"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('Do NOT write introductory');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('Do NOT use markdown code blocks');
  });

  it('describes all diagram types for type selection', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"flowchart"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"sequence"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"class"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"er"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"custom"');
  });

  it('describes all node types', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"start"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"end"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"process"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"decision"');
  });

  it('includes constraints on node/edge counts', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('Maximum 8 nodes');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('Maximum 10 edges');
  });

  it('requires kebab-case node IDs', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('kebab-case');
  });

  it('requires unique node labels', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('UNIQUE across all nodes');
  });

  it('includes an example JSON shape', () => {
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"diagramType"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"nodes"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"edges"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"id"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"label"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"type"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"from"');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('"to"');
  });
});

// ───────────────────────────────────────────────────────────────
// Stage 2: Diagram Extraction Prompt (Strict/Retry)
// ───────────────────────────────────────────────────────────────

describe('DIAGRAM_EXTRACTION_STRICT_PROMPT', () => {
  it('is measurably stricter than the standard prompt', () => {
    // Strict prompt has additional emphasis on zero tolerance
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('ZERO TOLERANCE');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('EXTREMELY strict');
  });

  it('explicitly lists common mistakes to avoid', () => {
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('COMMON MISTAKES THAT CAUSE REJECTION');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Dangling edges');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Orphan nodes');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Cycles');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Duplicate node IDs');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Duplicate node labels');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Missing start or end');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('Decision nodes with only one');
  });

  it('emphasizes exact start/end node counts', () => {
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('EXACTLY ONE "start"');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('EXACTLY ONE "end"');
  });

  it('specifies node/edge limits', () => {
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('No more than 8 nodes');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('No more than 10 edges');
  });

  it('is different from the standard prompt', () => {
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).not.toEqual(DIAGRAM_EXTRACTION_SYSTEM_PROMPT);
    // Both prompts are substantial and well-formed, but serve different purposes
    // (Strict is shorter because it omits few-shot examples to focus purely on rules)
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT.length).toBeGreaterThan(1500);
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT.length).toBeGreaterThan(2000);
  });

  it('forbids any text outside JSON', () => {
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('NOTHING ELSE');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('rejected');
  });
});

// ───────────────────────────────────────────────────────────────
// Fallback Prompt
// ───────────────────────────────────────────────────────────────

describe('DIAGRAM_FALLBACK_SYSTEM_PROMPT', () => {
  it('instructs AI to create text-based representation', () => {
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('text-based representation');
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('bullet');
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('numbered');
  });

  it('describes output format options (bullets and numbered lists)', () => {
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('numbered list');
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('bullet points');
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('nested lists');
  });

  it('includes examples of both process flow and architecture output', () => {
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('user authentication');
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('web application');
  });

  it('specifies concise word count', () => {
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('100-200');
  });

  it('forbids JSON output', () => {
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('No JSON');
  });

  it('requires markdown output', () => {
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('markdown text');
  });
});

// ───────────────────────────────────────────────────────────────
// Few-shot Examples
// ───────────────────────────────────────────────────────────────

describe('DIAGRAM_FEW_SHOT_EXAMPLES', () => {
  it('includes at least 2 examples for different diagram types', () => {
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('EXAMPLE 1');
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('EXAMPLE 2');
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('EXAMPLE 3');
  });

  it('demonstrates a flowchart example', () => {
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('Flowchart');
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('"diagramType": "flowchart"');
  });

  it('demonstrates a sequence diagram example', () => {
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('Sequence');
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('"diagramType": "sequence"');
  });

  it('demonstrates an architecture diagram example', () => {
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('Architecture');
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('"diagramType": "class"');
  });

  it('includes complete JSON output for each example', () => {
    // Each example should have valid-looking JSON with nodes and edges
    const nodeCount = (DIAGRAM_FEW_SHOT_EXAMPLES.match(/"nodes"/g) || []).length;
    const edgeCount = (DIAGRAM_FEW_SHOT_EXAMPLES.match(/"edges"/g) || []).length;
    expect(nodeCount).toBeGreaterThanOrEqual(3);
    expect(edgeCount).toBeGreaterThanOrEqual(3);
  });

  it('includes both input text and output for each example', () => {
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('Input text:');
    expect(DIAGRAM_FEW_SHOT_EXAMPLES).toContain('Output:');
  });
});

// ───────────────────────────────────────────────────────────────
// Helper functions
// ───────────────────────────────────────────────────────────────

describe('buildFallbackUserPrompt', () => {
  it('includes the original text in the prompt', () => {
    const originalText = 'HTTP requests flow from client through gateway to microservices.';
    const prompt = buildFallbackUserPrompt(originalText);
    expect(prompt).toContain(originalText);
  });

  it('truncates very long text to prevent token overflow', () => {
    const longText = 'x'.repeat(5000);
    const prompt = buildFallbackUserPrompt(longText);
    expect(prompt.length).toBeLessThan(longText.length);
  });

  it('mentions that diagram generation failed', () => {
    const prompt = buildFallbackUserPrompt('Some text');
    expect(prompt).toContain('failed');
  });

  it('asks for text-based representation', () => {
    const prompt = buildFallbackUserPrompt('Some text');
    expect(prompt).toContain('text-based representation');
  });
});

// ───────────────────────────────────────────────────────────────
// Prompt quality checks
// ───────────────────────────────────────────────────────────────

describe('Prompt quality and separation', () => {
  it('each prompt is focused on a single distinct task', () => {
    // Stage 1: writes text, not JSON
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).toContain('markdown text');
    expect(DIAGRAM_TEXT_SYSTEM_PROMPT).not.toContain('JSON API');

    // Stage 2: outputs JSON, not markdown prose
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).toContain('JSON API');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('markdown text');

    // Stage 2 Strict: even more restrictive
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('ZERO TOLERANCE');
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).not.toEqual(DIAGRAM_EXTRACTION_SYSTEM_PROMPT);

    // Fallback: text-based when diagram fails
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('text-based');
    expect(DIAGRAM_FALLBACK_SYSTEM_PROMPT).toContain('bullet');
  });

  it('Stage 2 retry prompt is measurably stricter', () => {
    // Strict prompt should have more rules about common mistakes
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('COMMON MISTAKES');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('COMMON MISTAKES');

    // Strict prompt uses stronger language
    expect(DIAGRAM_EXTRACTION_STRICT_PROMPT).toContain('ZERO TOLERANCE');
    expect(DIAGRAM_EXTRACTION_SYSTEM_PROMPT).not.toContain('ZERO TOLERANCE');
  });
});
