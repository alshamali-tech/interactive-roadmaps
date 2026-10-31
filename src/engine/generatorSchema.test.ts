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
