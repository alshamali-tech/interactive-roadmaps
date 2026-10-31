import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateCourse,
  generateCoursePlan,
  generateLessonsFromPlan,
  regenerateLesson,
} from '@/engine/courseGenerator';
import * as aiService from '@/engine/aiService';
import type { AISettings } from '@/engine/settings';
import type { CoursePlan, GeneratedLesson } from '@/engine/generatorSchema';

vi.mock('@/engine/aiService', () => ({
  generateRawCompletion: vi.fn(),
}));

const mockSettingsStructured: AISettings = {
  provider: 'openai',
  apiKey: 'test-key',
  baseUrl: '',
  model: 'gpt-4',
  generationMode: 'structured',
};

const mockSettingsFocused: AISettings = {
  provider: 'ollama',
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3.2',
  generationMode: 'focused',
};

describe('courseGenerator (structured mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls generateRawCompletion once for plan + once per lesson', async () => {
    const plan = {
      title: 'Test Course',
      description: 'A test course',
      lessons: [
        {
          id: 'lesson-1',
          title: 'Lesson 1',
          keyPoints: ['Point 1'],
          widgetSuggestions: [{ type: 'sandbox', purpose: 'Try it' }],
        },
        {
          id: 'lesson-2',
          title: 'Lesson 2',
          keyPoints: ['Point 2'],
          widgetSuggestions: [],
        },
      ],
    };

    const lesson1 = {
      id: 'lesson-1',
      title: 'Lesson 1',
      metadata: {
        difficulty: 'beginner',
        estimatedMinutes: 10,
        tags: ['test'],
        version: '1.0.0',
      },
      prerequisites: [],
      content: { markdown: '# Lesson 1', widgets: [] },
    };

    const lesson2 = {
      id: 'lesson-2',
      title: 'Lesson 2',
      metadata: {
        difficulty: 'beginner',
        estimatedMinutes: 10,
        tags: ['test'],
        version: '1.0.0',
      },
      prerequisites: [],
      content: { markdown: '# Lesson 2', widgets: [] },
    };

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(plan))
      .mockResolvedValueOnce(JSON.stringify(lesson1))
      .mockResolvedValueOnce(JSON.stringify(lesson2));

    const course = await generateCourse('Source content here', mockSettingsStructured);

    expect(mockGenerateRawCompletion).toHaveBeenCalledTimes(3);
    expect(course.lessons).toHaveLength(2);
    expect(course.lessons[0].id).toBe('lesson-1');
    expect(course.lessons[1].id).toBe('lesson-2');
  });

  it('wires prerequisites so each lesson depends on the previous', async () => {
    const plan = {
      title: 'Test',
      description: 'Test',
      lessons: [
        { id: 'lesson-1', title: 'L1', keyPoints: ['p1'], widgetSuggestions: [] },
        { id: 'lesson-2', title: 'L2', keyPoints: ['p2'], widgetSuggestions: [] },
        { id: 'lesson-3', title: 'L3', keyPoints: ['p3'], widgetSuggestions: [] },
      ],
    };

    const makeLesson = (id: string) => ({
      id,
      title: id,
      metadata: {
        difficulty: 'beginner' as const,
        estimatedMinutes: 10,
        tags: ['test'],
        version: '1.0.0',
      },
      prerequisites: [],
      content: { markdown: '# ' + id, widgets: [] },
    });

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(plan))
      .mockResolvedValueOnce(JSON.stringify(makeLesson('lesson-1')))
      .mockResolvedValueOnce(JSON.stringify(makeLesson('lesson-2')))
      .mockResolvedValueOnce(JSON.stringify(makeLesson('lesson-3')));

    const course = await generateCourse('Source', mockSettingsStructured);

    expect(course.lessons[0].prerequisites).toEqual([]);
    expect(course.lessons[1].prerequisites).toEqual(['lesson-1']);
    expect(course.lessons[2].prerequisites).toEqual(['lesson-2']);
  });

  it('retries on transient failure', async () => {
    const plan = {
      title: 'Test',
      description: 'Test',
      lessons: [
        { id: 'lesson-1', title: 'L1', keyPoints: ['p1'], widgetSuggestions: [] },
      ],
    };

    const lesson = {
      id: 'lesson-1',
      title: 'L1',
      metadata: {
        difficulty: 'beginner',
        estimatedMinutes: 10,
        tags: ['test'],
        version: '1.0.0',
      },
      prerequisites: [],
      content: { markdown: '# L1', widgets: [] },
    };

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(plan))
      .mockRejectedValueOnce(new Error('Transient error'))
      .mockResolvedValueOnce(JSON.stringify(lesson));

    const course = await generateCourse('Source', mockSettingsStructured);

    expect(course.lessons).toHaveLength(1);
    expect(mockGenerateRawCompletion).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries are exhausted', async () => {
    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion.mockRejectedValue(new Error('Always fails'));

    await expect(
      generateCourse('Source', mockSettingsStructured, { maxRetries: 1 })
    ).rejects.toThrow('Always fails');

    expect(mockGenerateRawCompletion).toHaveBeenCalledTimes(2);
  });

  it('calls onProgress callback during generation', async () => {
    const plan = {
      title: 'Test',
      description: 'Test',
      lessons: [
        { id: 'lesson-1', title: 'L1', keyPoints: ['p1'], widgetSuggestions: [] },
      ],
    };

    const lesson = {
      id: 'lesson-1',
      title: 'L1',
      metadata: {
        difficulty: 'beginner',
        estimatedMinutes: 10,
        tags: ['test'],
        version: '1.0.0',
      },
      prerequisites: [],
      content: { markdown: '# L1', widgets: [] },
    };

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(plan))
      .mockResolvedValueOnce(JSON.stringify(lesson));

    const progressUpdates: string[] = [];
    await generateCourse('Source', mockSettingsStructured, {
      onProgress: (p) => progressUpdates.push(p.stage),
    });

    expect(progressUpdates).toContain('planning');
    expect(progressUpdates).toContain('generating-lesson');
    expect(progressUpdates).toContain('merging');
  });
});

// ───────────────────────────────────────────────────────────────
// Tests for split API: generateCoursePlan + generateLessonsFromPlan
// ───────────────────────────────────────────────────────────────

describe('generateCoursePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only the plan (no lesson generation)', async () => {
    const plan = {
      title: 'Test Course',
      description: 'A test course',
      lessons: [
        { id: 'lesson-1', title: 'L1', keyPoints: ['p1'], widgetSuggestions: [] },
      ],
    };

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion.mockResolvedValueOnce(JSON.stringify(plan));

    const result = await generateCoursePlan('Source', 3, mockSettingsStructured);

    expect(result.title).toBe('Test Course');
    expect(result.lessons).toHaveLength(1);
    expect(mockGenerateRawCompletion).toHaveBeenCalledTimes(1);
  });
});

describe('generateLessonsFromPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates lessons from a pre-existing plan', async () => {
    const plan: CoursePlan = {
      title: 'My Course',
      description: 'Desc',
      lessons: [
        { id: 'lesson-1', title: 'Lesson One', suggestedDifficulty: 'beginner', keyPoints: ['k1'], widgetSuggestions: [] },
        { id: 'lesson-2', title: 'Lesson Two', suggestedDifficulty: 'beginner', keyPoints: ['k2'], widgetSuggestions: [] },
      ],
    };

    const makeLesson = (id: string, title: string): GeneratedLesson => ({
      id,
      title,
      metadata: {
        difficulty: 'beginner',
        estimatedMinutes: 10,
        tags: ['test'],
        version: '1.0.0',
      },
      prerequisites: [],
      content: { markdown: `# ${title}`, widgets: [] },
    });

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(makeLesson('lesson-1', 'Lesson One')))
      .mockResolvedValueOnce(JSON.stringify(makeLesson('lesson-2', 'Lesson Two')));

    const course = await generateLessonsFromPlan('Source', plan, mockSettingsStructured);

    expect(course.title).toBe('My Course');
    expect(course.lessons).toHaveLength(2);
    expect(mockGenerateRawCompletion).toHaveBeenCalledTimes(2);
  });
});

describe('regenerateLesson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces only the target lesson and keeps others intact', async () => {
    const plan: CoursePlan = {
      title: 'Test',
      description: 'Test',
      lessons: [
        { id: 'lesson-1', title: 'L1', suggestedDifficulty: 'beginner', keyPoints: ['k1'], widgetSuggestions: [] },
        { id: 'lesson-2', title: 'L2', suggestedDifficulty: 'intermediate', keyPoints: ['k2'], widgetSuggestions: [] },
      ],
    };

    const existingLessons: GeneratedLesson[] = [
      {
        id: 'lesson-1',
        title: 'L1',
        metadata: { difficulty: 'beginner', estimatedMinutes: 10, tags: [], version: '1.0.0' },
        prerequisites: [],
        content: { markdown: '# Original L1', widgets: [] },
      },
      {
        id: 'lesson-2',
        title: 'L2',
        metadata: { difficulty: 'beginner', estimatedMinutes: 10, tags: [], version: '1.0.0' },
        prerequisites: [],
        content: { markdown: '# Original L2', widgets: [] },
      },
    ];

    const regeneratedL1: GeneratedLesson = {
      id: 'lesson-1',
      title: 'L1 (Better)',
      metadata: { difficulty: 'intermediate', estimatedMinutes: 15, tags: ['new'], version: '1.0.0' },
      prerequisites: [],
      content: { markdown: '# Improved L1', widgets: [] },
    };

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion.mockResolvedValueOnce(JSON.stringify(regeneratedL1));

    const updatedLessons = await regenerateLesson('Source', plan, 0, existingLessons, mockSettingsStructured);

    expect(updatedLessons).toHaveLength(2);
    expect(updatedLessons[0].title).toBe('L1 (Better)');
    expect(updatedLessons[0].metadata.difficulty).toBe('intermediate');
    expect(updatedLessons[1].title).toBe('L2');
    expect(updatedLessons[1].content.markdown).toBe('# Original L2');
    expect(mockGenerateRawCompletion).toHaveBeenCalledTimes(1);
  });

  it('throws on invalid lesson index', async () => {
    const plan: CoursePlan = {
      title: 'Test',
      description: 'Test',
      lessons: [{ id: 'lesson-1', title: 'L1', suggestedDifficulty: 'beginner', keyPoints: ['k1'], widgetSuggestions: [] }],
    };

    const existingLessons: GeneratedLesson[] = [
      {
        id: 'lesson-1',
        title: 'L1',
        metadata: { difficulty: 'beginner', estimatedMinutes: 10, tags: [], version: '1.0.0' },
        prerequisites: [],
        content: { markdown: '# L1', widgets: [] },
      },
    ];

    await expect(
      regenerateLesson('Source', plan, 5, existingLessons, mockSettingsStructured)
    ).rejects.toThrow('Invalid lesson index');
  });
});

// ───────────────────────────────────────────────────────────────
// Focused mode tests (two-pass: markdown → parser)
// ───────────────────────────────────────────────────────────────

describe('courseGenerator with focused mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses markdown with widget markers into structured lesson', async () => {
    const plan = {
      title: 'Test Course',
      description: 'A test course',
      lessons: [
        { id: 'lesson-1', title: 'Lesson 1', suggestedDifficulty: 'beginner', keyPoints: ['Point 1'], widgetSuggestions: [] },
      ],
    };

    // Focused mode: model returns markdown with widget markers
    const markdownResponse = `Every time you open an app, a backend server handles your request.

## What Is a Backend?

A backend is like a restaurant kitchen — you don't see it, but nothing works without it.

:::widget sandbox
label: Try a request
inputType: text
outputType: text
initialState: Type: GET /users
processFunction: input.startsWith("GET") ? "200 OK" : "400 Bad Request"
:::

## Key Takeaways

- Backends process requests
- They return responses`;

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(plan))
      .mockResolvedValueOnce(markdownResponse);

    const course = await generateCourse('Source content', mockSettingsFocused);

    expect(course.lessons).toHaveLength(1);
    expect(course.lessons[0].id).toBe('lesson-1');
    expect(course.lessons[0].content.widgets).toHaveLength(1);
    const w = course.lessons[0].content.widgets[0];
    expect(w.type).toBe('sandbox');
    if (w.type === 'sandbox') {
      expect(w.props.label).toBe('Try a request');
    }
    expect(course.lessons[0].content.markdown).toContain('## What Is a Backend?');
    expect(course.lessons[0].content.markdown).toContain('<widget id="lesson-1-widget-1" />');
  });

  it('uses FOCUSED_SYSTEM_PROMPT for lesson generation', async () => {
    const plan = {
      title: 'Test',
      description: 'Test',
      lessons: [
        { id: 'lesson-1', title: 'L1', suggestedDifficulty: 'beginner', keyPoints: ['p1'], widgetSuggestions: [] },
      ],
    };

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(plan))
      .mockResolvedValueOnce('Some lesson content without widgets.');

    await generateCourse('Source', mockSettingsFocused);

    // The lesson call should use the focused system prompt
    const lessonCall = mockGenerateRawCompletion.mock.calls[1];
    expect(lessonCall[0]).toContain('educational content writer');
    expect(lessonCall[0]).toContain('markdown');
    expect(lessonCall[0]).not.toContain('JSON API');
  });

  it('handles lesson with no widgets gracefully', async () => {
    const plan = {
      title: 'Test',
      description: 'Test',
      lessons: [
        { id: 'lesson-1', title: 'L1', suggestedDifficulty: 'beginner', keyPoints: ['p1'], widgetSuggestions: [] },
      ],
    };

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(plan))
      .mockResolvedValueOnce('Just some text content without any widget markers.');

    const course = await generateCourse('Source', mockSettingsFocused);

    expect(course.lessons).toHaveLength(1);
    expect(course.lessons[0].content.widgets).toHaveLength(0);
    expect(course.lessons[0].content.markdown).toBe('Just some text content without any widget markers.');
  });

  it('skips invalid widgets but keeps the lesson', async () => {
    const plan = {
      title: 'Test',
      description: 'Test',
      lessons: [
        { id: 'lesson-1', title: 'L1', suggestedDifficulty: 'beginner', keyPoints: ['p1'], widgetSuggestions: [] },
      ],
    };

    // Widget with empty props — will fail validation
    const markdownWithBadWidget = `Some content.

:::widget sandbox
:::

More content.`;

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(plan))
      .mockResolvedValueOnce(markdownWithBadWidget);

    const course = await generateCourse('Source', mockSettingsFocused);

    expect(course.lessons).toHaveLength(1);
    expect(course.lessons[0].content.widgets).toHaveLength(0);
    expect(course.lessons[0].content.markdown).toContain('Some content.');
    expect(course.lessons[0].content.markdown).toContain('More content.');
  });

  it('retries focused mode lesson on empty response', async () => {
    const plan = {
      title: 'Test',
      description: 'Test',
      lessons: [
        { id: 'lesson-1', title: 'L1', suggestedDifficulty: 'beginner', keyPoints: ['p1'], widgetSuggestions: [] },
      ],
    };

    const goodResponse = `## What Is This?

This is a concept explained from scratch.

:::widget sandbox
inputType: text
outputType: text
initialState: Try it
:::

## Key Takeaways

- Point one`;

    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion
      .mockResolvedValueOnce(JSON.stringify(plan))
      .mockResolvedValueOnce('')  // Empty first attempt
      .mockResolvedValueOnce(goodResponse);  // Good second attempt

    const course = await generateCourse('Source', mockSettingsFocused, { maxRetries: 2 });

    expect(course.lessons).toHaveLength(1);
    expect(course.lessons[0].content.widgets).toHaveLength(1);
    expect(mockGenerateRawCompletion).toHaveBeenCalledTimes(3);
  });
});
