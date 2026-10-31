import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCourse } from '@/engine/courseGenerator';
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
};

describe('courseGenerator', () => {
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

    const course = await generateCourse('Source content here', mockSettings);

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

    const course = await generateCourse('Source', mockSettings);

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

    const course = await generateCourse('Source', mockSettings);

    expect(course.lessons).toHaveLength(1);
    expect(mockGenerateRawCompletion).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries are exhausted', async () => {
    const mockGenerateRawCompletion = vi.mocked(aiService.generateRawCompletion);
    mockGenerateRawCompletion.mockRejectedValue(new Error('Always fails'));

    await expect(
      generateCourse('Source', mockSettings, { maxRetries: 1 })
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
    await generateCourse('Source', mockSettings, {
      onProgress: (p) => progressUpdates.push(p.stage),
    });

    expect(progressUpdates).toContain('planning');
    expect(progressUpdates).toContain('generating-lesson');
    expect(progressUpdates).toContain('merging');
  });
});
