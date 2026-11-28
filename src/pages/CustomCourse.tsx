import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCustomCourseById } from '@/engine/localCourses';
import { useProgressStore } from '@/engine/progress';
import type { CustomCourse } from '@/engine/localCourses';
import { MarkdownRenderer } from '@/components/core/MarkdownRenderer';
import type { WidgetConfig } from '@/curriculum/schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

export function CustomCourse() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CustomCourse | null>(null);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);
  const { completedLessons, markComplete, markIncomplete } = useProgressStore();

  const loadCourse = async (id: string) => {
    try {
      const foundCourse = await getCustomCourseById(id);
      if (!aliveRef.current) return;
      if (foundCourse) {
        setCourse(foundCourse);
      } else {
        navigate('/my-courses');
      }
    } catch (err) {
      console.error('Failed to load course:', err);
      if (aliveRef.current) navigate('/my-courses');
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    if (courseId) {
      loadCourse(courseId);
    }
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + course change
  }, [courseId]);

  // Course titles come from IndexedDB, so the head can only be set once loaded —
  // this is why Layout does not own document titles.
  usePageMeta({
    title: course ? `${course.title} · Interactive Roadmaps` : 'Course · Interactive Roadmaps',
    description:
      course?.description ??
      'A generated, self-paced course stored locally in your browser with interactive widgets.',
    type: 'article',
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-muted-foreground">Loading course...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Course not found</h2>
          <Button onClick={() => navigate('/my-courses')}>
            <ArrowLeft size={16} className="mr-2" />
            Back to My Courses
          </Button>
        </div>
      </div>
    );
  }

  const currentLesson = course.lessons[currentLessonIndex];
  const isFirstLesson = currentLessonIndex === 0;
  const isLastLesson = currentLessonIndex === course.lessons.length - 1;

  // Generated lessons are also id 'lesson-1', 'lesson-2'… which would collide with
  // static curriculum lessons in the shared progress store, so keys are namespaced
  // by course. Without this, finishing a generated course marked static lessons done.
  const lessonKey = (index: number) => `custom:${courseId}:${course.lessons[index].id}`;
  const isCompleted = completedLessons.includes(lessonKey(currentLessonIndex));

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Course Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/my-courses')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to My Courses
        </button>

        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <BookOpen size={14} />
          <span>Custom Course</span>
        </div>

        <h1 className="text-4xl font-bold mb-2">{course.title}</h1>
        {course.description && (
          <p className="text-muted-foreground">{course.description}</p>
        )}
      </div>

      {/* Lesson Navigation */}
      <div className="mb-6 p-4 bg-muted rounded-lg">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentLessonIndex(Math.max(0, currentLessonIndex - 1))}
            disabled={isFirstLesson}
          >
            <ArrowLeft size={16} className="mr-1" />
            Previous
          </Button>

          <div className="text-center">
            <div className="text-sm font-medium">
              Lesson {currentLessonIndex + 1} of {course.lessons.length}
            </div>
            <div className="text-xs text-muted-foreground">{currentLesson.title}</div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentLessonIndex(Math.min(course.lessons.length - 1, currentLessonIndex + 1))
            }
            disabled={isLastLesson}
          >
            Next
            <ArrowRight size={16} className="ml-1" />
          </Button>
        </div>

        {/* Lesson Progress Bar — reflects real completion, not just position */}
        <div className="mt-3 flex gap-1">
          {course.lessons.map((_, index) => (
            <div
              key={lessonKey(index)}
              title={`Lesson ${index + 1}${completedLessons.includes(lessonKey(index)) ? ' (complete)' : ''}`}
              className={`h-1 flex-1 rounded-full transition-colors ${
                index === currentLessonIndex
                  ? 'bg-primary'
                  : completedLessons.includes(lessonKey(index))
                    ? 'bg-green-500/70'
                    : 'bg-muted-foreground/20'
              }`}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {course.lessons.filter((_, i) => completedLessons.includes(lessonKey(i))).length} of{' '}
            {course.lessons.length} lessons complete
          </p>
          <Button
            type="button"
            size="sm"
            variant={isCompleted ? 'outline' : 'default'}
            onClick={() =>
              isCompleted ? markIncomplete(lessonKey(currentLessonIndex)) : markComplete(lessonKey(currentLessonIndex))
            }
          >
            {isCompleted ? 'Mark incomplete' : 'Mark complete'}
          </Button>
        </div>
      </div>

      {/* Lesson Content */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-6">{currentLesson.title}</h2>
        <MarkdownRenderer
          markdown={currentLesson.content.markdown}
          widgets={currentLesson.content.widgets as WidgetConfig[]}
        />
      </div>

      {/* Lesson Navigation Footer */}
      <div className="flex items-center justify-between pt-6 border-t border-border">
        <Button
          variant="outline"
          onClick={() => setCurrentLessonIndex(Math.max(0, currentLessonIndex - 1))}
          disabled={isFirstLesson}
        >
          <ArrowLeft size={16} className="mr-2" />
          Previous Lesson
        </Button>

        <Button
          onClick={() =>
            setCurrentLessonIndex(Math.min(course.lessons.length - 1, currentLessonIndex + 1))
          }
          disabled={isLastLesson}
        >
          Next Lesson
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </div>
  );
}
