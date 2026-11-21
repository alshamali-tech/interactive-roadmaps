import { describe, it, expect } from 'vitest';
import {
  extractJson,
  parsePlanResponse,
  parseLessonResponse,
  GeneratedCourseSchema,
  buildPlanUserPrompt,
  buildLessonUserPrompt,
  FOCUSED_SYSTEM_PROMPT,
  buildFocusedUserPrompt,
  DiagramSchema,
  validateDiagram,
  type CoursePlan,
  type LessonPlan,
  type GeneratedLesson,
} from '@/engine/generatorSchema';

// ───────────────────────────────────────────────────────────────
// extractJson
// ───────────────────────────────────────────────────────────────

describe('extractJson', () => {
  it('parses plain JSON', () => {
    const result = extractJson('{"a":1}');
    expect(result).toEqual({ a: 1 });
  });

  it('strips ```json wrapper', () => {
    const result = extractJson('```json\n{"a":1}\n```');
    expect(result).toEqual({ a: 1 });
  });

  it('strips ``` wrapper (without json)', () => {
    const result = extractJson('```\n{"a":1}\n```');
    expect(result).toEqual({ a: 1 });
  });

  it('extracts JSON from prose prefix/suffix', () => {
    const result = extractJson(
      'Here is the JSON you asked for:\n{"a":1}\nHope this helps!'
    );
    expect(result).toEqual({ a: 1 });
  });

  it('fixes trailing commas before } and ]', () => {
    const result = extractJson('{"a":[1,2,],}');
    expect(result).toEqual({ a: [1, 2] });
  });

  it('auto-closes unbalanced braces (truncated JSON)', () => {
    const result = extractJson('{"a":{"b":1');
    expect(result).toEqual({ a: { b: 1 } });
  });

  it('auto-closes unbalanced brackets (truncated JSON)', () => {
    const result = extractJson('{"items":[1,2,3');
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it('throws when no JSON object exists', () => {
    expect(() => extractJson('I cannot generate this.')).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────
// parsePlanResponse (Stage 1)
// ───────────────────────────────────────────────────────────────

describe('parsePlanResponse', () => {
  const validPlan = {
    title: 'Test Course',
    description: 'A test course',
    lessons: [
      {
        id: 'lesson-1',
        title: 'First Lesson',
        suggestedDifficulty: 'beginner',
        keyPoints: ['Point 1', 'Point 2'],
        widgetSuggestions: [
          { type: 'sandbox', purpose: 'Try the concept' },
        ],
      },
    ],
  };

  it('parses a valid plan', () => {
    const result = parsePlanResponse(JSON.stringify(validPlan));
    expect(result.title).toBe('Test Course');
    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0].keyPoints).toEqual(['Point 1', 'Point 2']);
    expect(result.lessons[0].suggestedDifficulty).toBe('beginner');
  });

  it('defaults suggestedDifficulty to beginner when omitted', () => {
    const planWithoutDifficulty = {
      ...validPlan,
      lessons: [{ id: 'lesson-1', title: 'Test', keyPoints: ['P1'] }],
    };
    const result = parsePlanResponse(JSON.stringify(planWithoutDifficulty));
    expect(result.lessons[0].suggestedDifficulty).toBe('beginner');
  });

  it('strips markdown fences before parsing', () => {
    const result = parsePlanResponse('```json\n' + JSON.stringify(validPlan) + '\n```');
    expect(result.title).toBe('Test Course');
  });

  it('rejects plan with invalid widget type', () => {
    const badPlan = {
      ...validPlan,
      lessons: [
        {
          ...validPlan.lessons[0],
          widgetSuggestions: [{ type: 'node_graph', purpose: 'bad' }],
        },
      ],
    };
    expect(() => parsePlanResponse(JSON.stringify(badPlan))).toThrow();
  });

  it('rejects plan with missing title', () => {
    const { title, ...noTitle } = validPlan;
    expect(() => parsePlanResponse(JSON.stringify(noTitle))).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────
// parseLessonResponse (Stage 2 — structured mode)
// ───────────────────────────────────────────────────────────────

describe('parseLessonResponse', () => {
  const validLesson = {
    id: 'lesson-1',
    title: 'Lesson 1',
    metadata: {
      difficulty: 'beginner',
      estimatedMinutes: 10,
      tags: ['test'],
      version: '1.0.0',
    },
    prerequisites: [],
    content: {
      markdown: '# Hello World\n\n{{widget:lesson-1-sandbox-1}}',
      widgets: [
        {
          id: 'lesson-1-sandbox-1',
          type: 'sandbox',
          props: {
            inputType: 'text',
            outputType: 'text',
            initialState: 'Type here',
          },
        },
      ],
    },
  };

  it('parses a valid lesson', () => {
    const result = parseLessonResponse(JSON.stringify(validLesson));
    expect(result.id).toBe('lesson-1');
    expect(result.content.widgets).toHaveLength(1);
  });

  it('strips markdown fences before parsing', () => {
    const result = parseLessonResponse(
      '```json\n' + JSON.stringify(validLesson) + '\n```'
    );
    expect(result.id).toBe('lesson-1');
  });

  it('rejects lesson with invalid widget type', () => {
    const badLesson = {
      ...validLesson,
      content: {
        ...validLesson.content,
        widgets: [
          {
            id: 'w1',
            type: 'node_graph',
            props: { nodes: [], edges: [] },
          },
        ],
      },
    };
    expect(() => parseLessonResponse(JSON.stringify(badLesson))).toThrow();
  });

  it('rejects lesson with invalid difficulty', () => {
    const badLesson = {
      ...validLesson,
      metadata: { ...validLesson.metadata, difficulty: 'expert' },
    };
    expect(() => parseLessonResponse(JSON.stringify(badLesson))).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────
// Schema edge cases (Stage 3 validation)
// ───────────────────────────────────────────────────────────────

describe('GeneratedCourseSchema', () => {
  const lessonTemplate = {
    id: 'lesson-1',
    title: 'Lesson',
    metadata: {
      difficulty: 'beginner' as const,
      estimatedMinutes: 10,
      tags: ['test'],
      version: '1.0.0',
    },
    prerequisites: [],
    content: { markdown: '# Test', widgets: [] },
  };

  it('rejects a course with node_graph widget', () => {
    const result = GeneratedCourseSchema.safeParse({
      title: 'Test',
      description: 'Test',
      lessons: [
        {
          ...lessonTemplate,
          content: {
            markdown: '# Test',
            widgets: [{ id: 'w1', type: 'node_graph', props: {} }],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects course with more than 10 lessons', () => {
    const result = GeneratedCourseSchema.safeParse({
      title: 'Test',
      description: 'Test',
      lessons: Array.from({ length: 11 }, (_, i) => ({
        ...lessonTemplate,
        id: `lesson-${i}`,
      })),
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid sandbox widget', () => {
    const result = GeneratedCourseSchema.safeParse({
      title: 'Test',
      description: 'Test',
      lessons: [
        {
          ...lessonTemplate,
          content: {
            markdown: '# Test',
            widgets: [
              {
                id: 'w1',
                type: 'sandbox',
                props: {
                  inputType: 'text',
                  outputType: 'text',
                  initialState: 'Go',
                },
              },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid mutator widget (testCases defaults to [])', () => {
    const result = GeneratedCourseSchema.safeParse({
      title: 'Test',
      description: 'Test',
      lessons: [
        {
          ...lessonTemplate,
          content: {
            markdown: '# Test',
            widgets: [
              {
                id: 'w1',
                type: 'mutator',
                props: {
                  language: 'javascript',
                  brokenCode: 'let x = 1',
                  hint: 'Add semicolon',
                },
              },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid trade-off widget', () => {
    const result = GeneratedCourseSchema.safeParse({
      title: 'Test',
      description: 'Test',
      lessons: [
        {
          ...lessonTemplate,
          content: {
            markdown: '# Test',
            widgets: [
              {
                id: 'w1',
                type: 'trade-off',
                props: {
                  scenario: 'Pick one',
                  options: [
                    {
                      id: 'a',
                      name: 'A',
                      description: 'A desc',
                      pros: ['fast'],
                      cons: ['costly'],
                      metrics: { cost: 5, performance: 7, complexity: 4, scalability: 6 },
                    },
                    {
                      id: 'b',
                      name: 'B',
                      description: 'B desc',
                      pros: ['cheap'],
                      cons: ['slow'],
                      metrics: { cost: 3, performance: 4, complexity: 2, scalability: 3 },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// buildPlanUserPrompt (prompt quality)
// ───────────────────────────────────────────────────────────────

describe('buildPlanUserPrompt', () => {
  it('includes suggestedDifficulty in JSON example', () => {
    const prompt = buildPlanUserPrompt('Some content about backend development', 3);
    expect(prompt).toContain('"suggestedDifficulty": "beginner"');
  });

  it('instructs progressive difficulty from beginner to advanced', () => {
    const prompt = buildPlanUserPrompt('Some content', 3);
    expect(prompt).toContain('start from absolute fundamentals');
    expect(prompt).toContain('assume the reader knows NOTHING');
  });

  it('includes all three widget type guidelines', () => {
    const prompt = buildPlanUserPrompt('Some content', 3);
    expect(prompt).toContain('sandbox');
    expect(prompt).toContain('mutator');
    expect(prompt).toContain('trade-off');
  });
});

// ───────────────────────────────────────────────────────────────
// buildLessonUserPrompt (structured mode prompt quality)
// ───────────────────────────────────────────────────────────────

describe('buildLessonUserPrompt', () => {
  const mockPlan: CoursePlan = {
    title: 'Test Course',
    description: 'A test course',
    lessons: [
      {
        id: 'lesson-1',
        title: 'First Lesson',
        suggestedDifficulty: 'beginner',
        keyPoints: ['Point 1'],
        widgetSuggestions: [{ type: 'sandbox', purpose: 'Try it' }],
      },
      {
        id: 'lesson-2',
        title: 'Second Lesson',
        suggestedDifficulty: 'intermediate',
        keyPoints: ['Point 2'],
        widgetSuggestions: [],
      },
    ],
  };

  const beginnerLesson: LessonPlan = mockPlan.lessons[0];
  const intermediateLesson: LessonPlan = mockPlan.lessons[1];

  it('includes beginner audience description for beginner difficulty', () => {
    const prompt = buildLessonUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('complete beginner who has NEVER heard of this topic');
    expect(prompt).toContain('Define EVERY technical term');
  });

  it('includes intermediate audience description for intermediate difficulty', () => {
    const prompt = buildLessonUserPrompt('content', mockPlan, intermediateLesson, [
      { id: 'lesson-1', title: 'First', metadata: { difficulty: 'beginner', estimatedMinutes: 10, tags: [], version: '1.0.0' }, prerequisites: [], content: { markdown: '# Test', widgets: [] } },
    ]);
    expect(prompt).toContain('knows the basics and wants deeper understanding');
  });

  it('includes WHAT-WHY-HOW pedagogical structure', () => {
    const prompt = buildLessonUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('WHAT → WHY → HOW');
    expect(prompt).toContain('## What Is [Concept]?');
    expect(prompt).toContain('## Why Does [Concept] Matter?');
    expect(prompt).toContain('## How Does [Concept] Work?');
  });

  it('includes good vs bad content examples', () => {
    const prompt = buildLessonUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('❌ BAD');
    expect(prompt).toContain('✅ GOOD');
    expect(prompt).toContain('restaurant');
  });

  it('includes zero jargon rule', () => {
    const prompt = buildLessonUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('ZERO JARGON RULE');
    expect(prompt).toContain('Never use a technical term without explaining it first');
  });

  it('forbids "Building on what you learned" for first lesson', () => {
    const prompt = buildLessonUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('FIRST lesson');
    expect(prompt).toContain('Do NOT reference any previous lessons');
    expect(prompt).toContain('Start fresh');
  });

  it('allows referencing previous lessons for non-first lessons', () => {
    const previousLesson: GeneratedLesson = {
      id: 'lesson-1',
      title: 'First',
      metadata: { difficulty: 'beginner', estimatedMinutes: 10, tags: [], version: '1.0.0' },
      prerequisites: [],
      content: { markdown: '# Test', widgets: [] },
    };
    const prompt = buildLessonUserPrompt('content', mockPlan, intermediateLesson, [previousLesson]);
    expect(prompt).toContain('Reference previous lessons naturally');
    expect(prompt).toContain('Build on those concepts');
  });

  it('sets difficulty in metadata example from suggestedDifficulty', () => {
    const prompt = buildLessonUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('"difficulty": "beginner"');
  });

  it('requires 800-1200 words of real content', () => {
    const prompt = buildLessonUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('800-1200 words');
  });

  it('includes first paragraph rule', () => {
    const prompt = buildLessonUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('FIRST PARAGRAPH RULE');
    expect(prompt).toContain('WHAT this topic is');
    expect(prompt).toContain('WHY they should care');
  });
});

// ───────────────────────────────────────────────────────────────
// Focused mode prompts
// ───────────────────────────────────────────────────────────────

describe('FOCUSED_SYSTEM_PROMPT', () => {
  it('instructs the model to output markdown, not JSON', () => {
    expect(FOCUSED_SYSTEM_PROMPT).toContain('markdown');
    expect(FOCUSED_SYSTEM_PROMPT).toContain('No JSON');
  });

  it('mentions widget markers', () => {
    expect(FOCUSED_SYSTEM_PROMPT).toContain(':::widget');
  });
});

describe('buildFocusedUserPrompt', () => {
  const mockPlan: CoursePlan = {
    title: 'Test Course',
    description: 'A test course',
    lessons: [
      {
        id: 'lesson-1',
        title: 'First Lesson',
        suggestedDifficulty: 'beginner',
        keyPoints: ['Point 1', 'Point 2'],
        widgetSuggestions: [{ type: 'sandbox', purpose: 'Try it' }],
      },
    ],
  };

  const beginnerLesson: LessonPlan = mockPlan.lessons[0];

  it('includes widget marker format examples', () => {
    const prompt = buildFocusedUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain(':::widget sandbox');
    expect(prompt).toContain(':::widget mutator');
    expect(prompt).toContain(':::widget trade-off');
  });

  it('includes audience description for beginners', () => {
    const prompt = buildFocusedUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('NEVER heard of this topic');
    expect(prompt).toContain('analogies');
  });

  it('forbids "Building on what you learned" for first lesson', () => {
    const prompt = buildFocusedUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('FIRST lesson');
    expect(prompt).toContain('zero context');
  });

  it('includes previous lesson context for non-first lessons', () => {
    const previousLesson: GeneratedLesson = {
      id: 'lesson-1',
      title: 'Intro to Backend',
      metadata: { difficulty: 'beginner', estimatedMinutes: 10, tags: [], version: '1.0.0' },
      prerequisites: [],
      content: {
        markdown: '# Backend\n\nSome content',
        widgets: [{ id: 'lesson-1-widget-1', type: 'sandbox', props: { inputType: 'text', outputType: 'text', initialState: 'test' } }],
      },
    };

    const mockPlanWith2: CoursePlan = {
      ...mockPlan,
      lessons: [
        mockPlan.lessons[0],
        { id: 'lesson-2', title: 'Databases', suggestedDifficulty: 'intermediate', keyPoints: ['SQL'], widgetSuggestions: [] },
      ],
    };

    const prompt = buildFocusedUserPrompt('content', mockPlanWith2, mockPlanWith2.lessons[1], [previousLesson]);
    expect(prompt).toContain('PREVIOUS LESSONS');
    expect(prompt).toContain('Intro to Backend');
  });

  it('includes content template with section headings', () => {
    const prompt = buildFocusedUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('## What Is');
    expect(prompt).toContain('## Why Does It Matter');
    expect(prompt).toContain('## Key Takeaways');
  });

  it('instructs the model to output only markdown', () => {
    const prompt = buildFocusedUserPrompt('content', mockPlan, beginnerLesson, []);
    expect(prompt).toContain('Output ONLY markdown');
    expect(prompt).toContain('no JSON');
  });
});

// ───────────────────────────────────────────────────────────────
// Diagram Schema (W1.2)
// ───────────────────────────────────────────────────────────────

describe('DiagramSchema (W1.2)', () => {
  const validDiagram = {
    type: 'flow' as const,
    title: 'Request Lifecycle',
    nodes: [
      { id: 'req', label: 'User Request', type: 'input' as const },
      { id: 'proc', label: 'Process Data', type: 'process' as const },
      { id: 'resp', label: 'Send Response', type: 'output' as const },
    ],
    edges: [
      { from: 'req', to: 'proc' },
      { from: 'proc', to: 'resp' },
    ],
  };

  it('accepts a valid flow diagram', () => {
    const result = DiagramSchema.safeParse(validDiagram);
    expect(result.success).toBe(true);
  });

  it('accepts a valid relationship diagram', () => {
    const rel = {
      type: 'relationship' as const,
      title: 'System Components',
      nodes: [
        { id: 'db', label: 'Database', type: 'storage' as const },
        { id: 'api', label: 'API Server', type: 'service' as const },
      ],
      edges: [{ from: 'db', to: 'api' }],
    };
    const result = DiagramSchema.safeParse(rel);
    expect(result.success).toBe(true);
  });

  it('accepts a valid architecture diagram', () => {
    const arch = {
      type: 'architecture' as const,
      title: 'Microservices',
      nodes: [
        { id: 'gw', label: 'API Gateway', type: 'service' as const },
        { id: 'auth', label: 'Auth Service', type: 'service' as const },
        { id: 'users', label: 'User Service', type: 'service' as const },
      ],
      edges: [
        { from: 'gw', to: 'auth' },
        { from: 'gw', to: 'users' },
        { from: 'users', to: 'gw' }, // Cycle allowed in architecture!
      ],
    };
    const result = DiagramSchema.safeParse(arch);
    expect(result.success).toBe(true);
  });

  it('accepts a valid sequence diagram', () => {
    const seq = {
      type: 'sequence' as const,
      title: 'Login Flow',
      nodes: [
        { id: 'user', label: 'User', type: 'input' as const },
        { id: 'ui', label: 'Login Form', type: 'process' as const },
        { id: 'api', label: 'Auth API', type: 'service' as const },
      ],
      edges: [
        { from: 'user', to: 'ui' },
        { from: 'ui', to: 'api' },
        { from: 'api', to: 'ui', label: 'Token' },
      ],
    };
    const result = DiagramSchema.safeParse(seq);
    expect(result.success).toBe(true);
  });

  it('accepts nodes with optional description', () => {
    const withDesc = {
      ...validDiagram,
      nodes: [
        { id: 'req', label: 'User Request', type: 'input' as const, description: 'HTTP request from client' },
        { id: 'proc', label: 'Process', type: 'process' as const },
        { id: 'resp', label: 'Response', type: 'output' as const },
      ],
      edges: [{ from: 'req', to: 'proc' }, { from: 'proc', to: 'resp' }],
    };
    const result = DiagramSchema.safeParse(withDesc);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes[0].description).toBe('HTTP request from client');
    }
  });

  it('rejects diagram with fewer than 2 nodes', () => {
    const tooFew = {
      ...validDiagram,
      nodes: [{ id: 'only', label: 'Only One', type: 'process' as const }],
      edges: [],
    };
    const result = DiagramSchema.safeParse(tooFew);
    expect(result.success).toBe(false);
  });

  it('rejects diagram with more than 8 nodes', () => {
    const tooMany = {
      ...validDiagram,
      nodes: Array.from({ length: 9 }, (_, i) => ({
        id: `node-${i}`,
        label: `Node ${i}`,
        type: 'process' as const,
      })),
      edges: Array.from({ length: 8 }, (_, i) => ({
        from: `node-${i}`,
        to: `node-${i + 1}`,
      })),
    };
    const result = DiagramSchema.safeParse(tooMany);
    expect(result.success).toBe(false);
  });

  it('rejects diagram with fewer than 1 edge', () => {
    const noEdges = {
      ...validDiagram,
      edges: [],
    };
    const result = DiagramSchema.safeParse(noEdges);
    expect(result.success).toBe(false);
  });

  it('rejects diagram with more than 10 edges', () => {
    const tooManyEdges = {
      ...validDiagram,
      nodes: [
        { id: 'a', label: 'A', type: 'process' as const },
        { id: 'b', label: 'B', type: 'process' as const },
      ],
      edges: Array.from({ length: 11 }, () => ({
        from: 'a',
        to: 'b',
      })),
    };
    const result = DiagramSchema.safeParse(tooManyEdges);
    expect(result.success).toBe(false);
  });

  it('rejects node with label longer than 20 characters', () => {
    const longLabel = {
      ...validDiagram,
      nodes: [
        { id: 'req', label: 'This is a very long node label that exceeds the limit', type: 'input' as const },
        { id: 'proc', label: 'Process', type: 'process' as const },
      ],
      edges: [{ from: 'req', to: 'proc' }],
    };
    const result = DiagramSchema.safeParse(longLabel);
    expect(result.success).toBe(false);
  });

  it('rejects edge with label longer than 15 characters', () => {
    const longEdgeLabel = {
      ...validDiagram,
      edges: [{ from: 'req', to: 'proc', label: 'This edge label is way too long' }],
    };
    const result = DiagramSchema.safeParse(longEdgeLabel);
    expect(result.success).toBe(false);
  });

  it('rejects title longer than 50 characters', () => {
    const longTitle = {
      ...validDiagram,
      title: 'This is a very long diagram title that exceeds fifty characters limit',
    };
    const result = DiagramSchema.safeParse(longTitle);
    expect(result.success).toBe(false);
  });

  it('rejects invalid diagram type', () => {
    const badType = {
      ...validDiagram,
      type: 'mindmap',
    };
    const result = DiagramSchema.safeParse(badType);
    expect(result.success).toBe(false);
  });

  it('rejects invalid node type', () => {
    const badNodeType = {
      ...validDiagram,
      nodes: [
        { id: 'req', label: 'Request', type: 'terminal' },
        { id: 'proc', label: 'Process', type: 'process' as const },
      ],
      edges: [{ from: 'req', to: 'proc' }],
    };
    const result = DiagramSchema.safeParse(badNodeType);
    expect(result.success).toBe(false);
  });

  it('rejects edges referencing non-existent nodes', () => {
    const badEdges = {
      ...validDiagram,
      edges: [
        { from: 'req', to: 'nonexistent' },
        { from: 'proc', to: 'resp' },
      ],
    };
    const result = DiagramSchema.safeParse(badEdges);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages.some(m => m.includes('existing node IDs'))).toBe(true);
    }
  });

  it('rejects orphan nodes (disconnected graph)', () => {
    const orphan = {
      ...validDiagram,
      nodes: [
        { id: 'req', label: 'Request', type: 'input' as const },
        { id: 'lonely', label: 'Lonely Node', type: 'process' as const },
        { id: 'proc', label: 'Process', type: 'process' as const },
      ],
      edges: [{ from: 'req', to: 'proc' }],
    };
    const result = DiagramSchema.safeParse(orphan);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages.some(m => m.includes('orphan'))).toBe(true);
    }
  });

  it('rejects duplicate node IDs', () => {
    const dupIds = {
      ...validDiagram,
      nodes: [
        { id: 'req', label: 'Request', type: 'input' as const },
        { id: 'req', label: 'Duplicate ID', type: 'process' as const },
        { id: 'resp', label: 'Response', type: 'output' as const },
      ],
      edges: [
        { from: 'req', to: 'req' },
        { from: 'req', to: 'resp' },
      ],
    };
    const result = DiagramSchema.safeParse(dupIds);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages.some(m => m.includes('unique'))).toBe(true);
    }
  });

  it('rejects cyclic flow diagrams with specific error message', () => {
    const cyclic = {
      type: 'flow' as const,
      title: 'Cyclic Flow',
      nodes: [
        { id: 'a', label: 'Step A', type: 'input' as const },
        { id: 'b', label: 'Step B', type: 'process' as const },
        { id: 'c', label: 'Step C', type: 'output' as const },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' }, // Cycle!
      ],
    };
    const result = DiagramSchema.safeParse(cyclic);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages.some(m => m.includes('acyclic'))).toBe(true);
    }
  });

  it('allows cycles in non-flow diagram types', () => {
    const cyclicRelationship = {
      type: 'relationship' as const,
      title: 'Mutual Dependence',
      nodes: [
        { id: 'a', label: 'Component A', type: 'service' as const },
        { id: 'b', label: 'Component B', type: 'service' as const },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' }, // Cycle allowed!
      ],
    };
    const result = DiagramSchema.safeParse(cyclicRelationship);
    expect(result.success).toBe(true);
  });

  it('allows self-loops in non-flow diagrams', () => {
    const selfLoop = {
      type: 'architecture' as const,
      title: 'Self Referencing',
      nodes: [
        { id: 'a', label: 'Service A', type: 'service' as const },
        { id: 'b', label: 'Service B', type: 'service' as const },
      ],
      edges: [
        { from: 'a', to: 'a' }, // Self-loop
        { from: 'a', to: 'b' },
      ],
    };
    const result = DiagramSchema.safeParse(selfLoop);
    expect(result.success).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// validateDiagram helper
// ───────────────────────────────────────────────────────────────

describe('validateDiagram', () => {
  it('returns success with validated data for valid diagram', () => {
    const validDiagram = {
      type: 'flow' as const,
      title: 'Test Flow',
      nodes: [
        { id: 'a', label: 'Start', type: 'input' as const },
        { id: 'b', label: 'End', type: 'output' as const },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };

    const result = validateDiagram(validDiagram);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Test Flow');
      expect(result.data.nodes).toHaveLength(2);
      expect(result.data.edges).toHaveLength(1);
    }
  });

  it('returns error with detailed message for invalid diagram', () => {
    const invalidDiagram = {
      type: 'flow' as const,
      title: 'Bad Diagram',
      nodes: [
        { id: 'a', label: 'Start', type: 'input' as const },
      ],
      edges: [{ from: 'a', to: 'nonexistent' }],
    };

    const result = validateDiagram(invalidDiagram);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Diagram validation failed');
      // Should list all errors (too few nodes + edge to nonexistent)
      expect(result.error).toContain('nodes');
      expect(result.error).toContain('existing node IDs');
    }
  });

  it('returns error for non-object input', () => {
    const result = validateDiagram('not an object');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Diagram validation failed');
    }
  });

  it('returns error for null input', () => {
    const result = validateDiagram(null);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Diagram validation failed');
    }
  });

  it('returns error for undefined input', () => {
    const result = validateDiagram(undefined);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Diagram validation failed');
    }
  });

  it('lists multiple validation failures at once', () => {
    const multipleErrors = {
      type: 'flow' as const,
      title: '', // Too short
      nodes: [], // Too few
      edges: [], // Too few
    };

    const result = validateDiagram(multipleErrors);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should list errors for title, nodes, and edges
      expect(result.error).toContain('title');
      expect(result.error).toContain('nodes');
      expect(result.error).toContain('edges');
    }
  });

  it('returns specific cyclic error for flow diagrams', () => {
    const cyclicFlow = {
      type: 'flow' as const,
      title: 'Cyclic',
      nodes: [
        { id: 'a', label: 'A', type: 'process' as const },
        { id: 'b', label: 'B', type: 'process' as const },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    };

    const result = validateDiagram(cyclicFlow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('acyclic');
    }
  });

  it('returns orphan node error when graph is disconnected', () => {
    const disconnected = {
      type: 'flow' as const,
      title: 'Disconnected',
      nodes: [
        { id: 'a', label: 'A', type: 'input' as const },
        { id: 'b', label: 'B', type: 'process' as const },
        { id: 'c', label: 'Lonely', type: 'output' as const },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };

    const result = validateDiagram(disconnected);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('orphan');
    }
  });

  it('returns duplicate ID error when IDs are not unique', () => {
    const dupIds = {
      type: 'flow' as const,
      title: 'Duplicate IDs',
      nodes: [
        { id: 'same', label: 'First', type: 'input' as const },
        { id: 'same', label: 'Second', type: 'output' as const },
      ],
      edges: [{ from: 'same', to: 'same' }],
    };

    const result = validateDiagram(dupIds);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('unique');
    }
  });
});
