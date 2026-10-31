import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCustomCourseById } from '@/engine/localCourses';
import type { CustomCourse } from '@/engine/localCourses';
import { MarkdownRenderer } from '@/components/core/MarkdownRenderer';
import type { WidgetConfig } from '@/curriculum/schema';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';

export function CustomCourse() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CustomCourse | null>(null);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (courseId) {
      loadCourse(courseId);
    }
  }, [courseId]);

  const loadCourse = async (id: string) => {
    try {
      const foundCourse = await getCustomCourseById(id);
      if (foundCourse) {
        setCourse(foundCourse);
      } else {
        navigate('/my-courses');
      }
    } catch (err) {
      console.error('Failed to load course:', err);
      navigate('/my-courses');
    } finally {
      setLoading(false);
    }
  };

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

        {/* Lesson Progress Bar */}
        <div className="mt-3 flex gap-1">
          {course.lessons.map((_, index) => (
            <div
              key={index}
              className={`h-1 flex-1 rounded-full transition-colors ${
                index === currentLessonIndex
                  ? 'bg-primary'
                  : index < currentLessonIndex
                  ? 'bg-primary/50'
                  : 'bg-muted-foreground/20'
              }`}
            />
          ))}
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
