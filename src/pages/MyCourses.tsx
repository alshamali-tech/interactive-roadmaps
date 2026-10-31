import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllCustomCourses, deleteCustomCourse } from '@/engine/localCourses';
import type { CustomCourse } from '@/engine/localCourses';
import { BookOpen, Clock, Trash2, Plus } from 'lucide-react';

export function MyCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CustomCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const allCourses = await getAllCustomCourses();
      setCourses(allCourses);
    } catch (err) {
      console.error('Failed to load courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    try {
      await deleteCustomCourse(id);
      setCourses(courses.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Failed to delete course:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading your courses...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">My Custom Courses</h1>
          <p className="text-muted-foreground">
            Courses you've generated from articles, documentation, and notes
          </p>
        </div>
        <button
          onClick={() => navigate('/generate')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={18} />
          Generate New Course
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="mx-auto mb-4 text-muted-foreground" size={64} />
          <h2 className="text-2xl font-semibold mb-2">No courses yet</h2>
          <p className="text-muted-foreground mb-6">
            Generate your first interactive course from any article or documentation
          </p>
          <button
            onClick={() => navigate('/generate')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus size={20} />
            Generate Your First Course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-2 line-clamp-2">{course.title}</h3>
                {course.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {course.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <BookOpen size={14} />
                    <span>{course.lessons.length} lessons</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={14} />
                    <span>{new Date(course.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/course/${course.id}`)}
                    className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                  >
                    Open Course
                  </button>
                  <button
                    onClick={() => handleDelete(course.id, course.title)}
                    className="py-2 px-3 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                    title="Delete course"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
