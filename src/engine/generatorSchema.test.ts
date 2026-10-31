import { describe, it, expect } from 'vitest';
import {
  extractJson,
  parsePlanResponse,
  parseLessonResponse,
  GeneratedCourseSchema,
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
// parseLessonResponse (Stage 2)
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

  it('accepts valid trade_off widget', () => {
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
                type: 'trade_off',
                props: {
                  scenario: 'Pick one',
                  options: [
                    {
                      id: 'a',
                      name: 'A',
                      description: 'A desc',
                      pros: ['fast'],
                      cons: ['costly'],
                      metrics: { cost: 5, performance: 7, complexity: 4 },
                    },
                    {
                      id: 'b',
                      name: 'B',
                      description: 'B desc',
                      pros: ['cheap'],
                      cons: ['slow'],
                      metrics: { cost: 3, performance: 4, complexity: 2 },
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
