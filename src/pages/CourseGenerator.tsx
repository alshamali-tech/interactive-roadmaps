import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { extractContentFromUrl, extractContentFromText } from '@/engine/extractor';
import { saveGeneratedCourse } from '@/engine/localCourses';
import { useSettingsStore } from '@/engine/settings';
import {
  generateCoursePlan,
  generateLessonsFromPlan,
  regenerateLesson,
  type GenerationProgress,
} from '@/engine/courseGenerator';
import type { CoursePlan, GeneratedLesson, GeneratedCourse } from '@/engine/generatorSchema';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Globe,
  FileText,
  PenLine,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Eye,
  Play,
  X,
  Pencil,
} from 'lucide-react';

type GenState = 'idle' | 'extracting' | 'planning' | 'review-plan' | 'generating-lessons' | 'review-lessons' | 'saving' | 'success' | 'error';

interface GenerationError {
  message: string;
  rawResponse?: string;
}

export function CourseGenerator() {
  const navigate = useNavigate();
  const aiSettings = useSettingsStore((state) => state.aiSettings);
  const isAIConnected = useSettingsStore((state) => state.isAIConnected);

  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [numLessons, setNumLessons] = useState(3);
  const [state, setState] = useState<GenState>('idle');
  const [error, setError] = useState<GenerationError | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);

  // New state for plan review and lesson regeneration
  const [sourceContent, setSourceContent] = useState<string>('');
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [generatedLessons, setGeneratedLessons] = useState<GeneratedLesson[]>([]);
  const [editingTitleIndex, setEditingTitleIndex] = useState<number | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  const handleGenerate = async () => {
    setError(null);
    setProgress(null);

    if (!isAIConnected) {
      setError({
        message:
          'Please configure an AI provider in Settings before generating courses.',
      });
      return;
    }

    try {
      // Stage 1: Extract
      setState('extracting');
      const content =
        mode === 'url'
          ? await extractContentFromUrl(url)
          : await extractContentFromText(text);

      setSourceContent(content);

      // Stage 2: Generate Plan
      setState('planning');
      const newPlan = await generateCoursePlan(content, numLessons, aiSettings, {
        onProgress: setProgress,
      });

      setPlan(newPlan);
      setState('review-plan');
    } catch (err: unknown) {
      setState('error');
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError({ message });
    }
  };

  const handleRegeneratePlan = async () => {
    if (!sourceContent) return;
    setError(null);
    setProgress(null);

    try {
      setState('planning');
      const newPlan = await generateCoursePlan(sourceContent, numLessons, aiSettings, {
        onProgress: setProgress,
      });
      setPlan(newPlan);
      setState('review-plan');
    } catch (err: unknown) {
      setState('review-plan');
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError({ message });
    }
  };

  const handleContinueToLessons = async () => {
    if (!plan || !sourceContent) return;
    setError(null);

    try {
      setState('generating-lessons');
      const course = await generateLessonsFromPlan(sourceContent, plan, aiSettings, {
        onProgress: setProgress,
      });

      setGeneratedLessons(course.lessons);
      setState('review-lessons');
    } catch (err: unknown) {
      setState('error');
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError({ message });
    }
  };

  const handleRegenerateSingleLesson = async (lessonIndex: number) => {
    if (!plan || !sourceContent) return;

    setRegeneratingIndex(lessonIndex);
    setError(null);

    try {
      const updatedLessons = await regenerateLesson(
        sourceContent,
        plan,
        lessonIndex,
        generatedLessons,
        aiSettings,
        {
          onProgress: setProgress,
        }
      );

      setGeneratedLessons(updatedLessons);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError({ message });
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const handleSaveAndNavigate = async () => {
    if (!plan) return;

    try {
      setState('saving');
      const course: GeneratedCourse = {
        title: plan.title,
        description: plan.description,
        lessons: generatedLessons.map((lesson, index) => ({
          ...lesson,
          prerequisites: index > 0 ? [generatedLessons[index - 1].id] : [],
        })),
      };

      const courseId = await saveGeneratedCourse(course);
      setState('success');
      setTimeout(() => navigate(`/course/${courseId}`), 1500);
    } catch (err: unknown) {
      setState('review-lessons');
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError({ message });
    }
  };

  const handleMoveLesson = (index: number, direction: 'up' | 'down') => {
    if (!plan) return;
    const lessons = [...plan.lessons];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= lessons.length) return;
    [lessons[index], lessons[swapIndex]] = [lessons[swapIndex], lessons[index]];
    // Re-number IDs to maintain sequential ordering
    const renumbered = lessons.map((l, i) => ({
      ...l,
      id: `lesson-${i + 1}`,
    }));
    setPlan({ ...plan, lessons: renumbered });
  };

  const handleEditTitle = (index: number) => {
    if (!plan) return;
    setEditingTitleIndex(index);
    setEditingTitleValue(plan.lessons[index].title);
  };

  const handleSaveTitle = () => {
    if (!plan || editingTitleIndex === null || !editingTitleValue.trim()) return;
    const lessons = [...plan.lessons];
    lessons[editingTitleIndex] = { ...lessons[editingTitleIndex], title: editingTitleValue.trim() };
    setPlan({ ...plan, lessons });
    setEditingTitleIndex(null);
    setEditingTitleValue('');
  };

  const handleCancelEditTitle = () => {
    setEditingTitleIndex(null);
    setEditingTitleValue('');
  };

  const handleDeleteLesson = (index: number) => {
    if (!plan) return;
    const lessons = plan.lessons.filter((_, i) => i !== index);
    // Re-number IDs
    const renumbered = lessons.map((l, i) => ({
      ...l,
      id: `lesson-${i + 1}`,
    }));
    setPlan({ ...plan, lessons: renumbered });
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Generate Interactive Course</h1>
        <p className="text-muted-foreground">
          Transform any article, blog post, or documentation into an interactive
          learning experience
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="mb-6">
        <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setMode('url')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              mode === 'url'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Globe size={16} />
            From URL
          </button>
          <button
            onClick={() => setMode('text')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              mode === 'text'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText size={16} />
            From Text
          </button>
        </div>
      </div>

      {/* Input Fields */}
      <div className="space-y-4 mb-6">
        {mode === 'url' ? (
          <div>
            <label htmlFor="url-input" className="block text-sm font-medium mb-2">
              Article or Blog Post URL
            </label>
            <input
              id="url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={state !== 'idle'}
            />
            <p className="text-xs text-muted-foreground mt-1">
              We'll extract clean text from the page, bypassing ads and navigation
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="text-input" className="block text-sm font-medium mb-2">
              Paste Your Content
            </label>
            <textarea
              id="text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your article, documentation, or notes here..."
              rows={12}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm resize-y"
              disabled={state !== 'idle'}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Minimum 100 characters recommended for meaningful course generation
            </p>
          </div>
        )}

        {/* Number of lessons */}
        <div>
          <label htmlFor="num-lessons" className="block text-sm font-medium mb-2">
            Number of lessons: <span className="font-bold">{numLessons}</span>
          </label>
          <input
            id="num-lessons"
            type="range"
            min={1}
            max={8}
            value={numLessons}
            onChange={(e) => setNumLessons(parseInt(e.target.value))}
            className="w-full accent-primary"
            disabled={state !== 'idle'}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1 (quick)</span>
            <span>8 (comprehensive)</span>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      {state === 'idle' && (
        <button
          onClick={handleGenerate}
          disabled={mode === 'url' ? !url.trim() : !text.trim()}
          className="w-full py-3 px-6 bg-primary text-primary-foreground rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Sparkles size={20} />
          Generate Interactive Course
        </button>
      )}

      {/* Extracting */}
      {state === 'extracting' && (
        <div className="p-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-3">
          <Loader2 className="animate-spin text-blue-600 dark:text-blue-400" size={24} />
          <div>
            <p className="font-semibold text-blue-900 dark:text-blue-100">Reading content from source...</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">Extracting clean text from the provided source</p>
          </div>
        </div>
      )}

      {/* Planning (Stage 1 running) */}
      {state === 'planning' && progress && (
        <div className="p-6 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg flex items-center gap-3">
          <Loader2 className="animate-spin text-purple-600 dark:text-purple-400" size={24} />
          <div>
            <p className="font-semibold text-purple-900 dark:text-purple-100">Creating lesson plan...</p>
            <p className="text-sm text-purple-700 dark:text-purple-300">{progress.message}</p>
          </div>
        </div>
      )}

      {/* ─── Plan Review Checkpoint ─── */}
      {state === 'review-plan' && plan && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setState('idle'); setError(null); setPlan(null); }}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              ← Change source & start over
            </button>
          </div>

          <div className="p-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-2 mb-4">
              <Eye size={20} className="text-amber-600 dark:text-amber-400" />
              <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100">Review Your Course Plan</h2>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
              Review and adjust the lesson outline before generating content. You can edit titles, reorder lessons, or regenerate the plan.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">Course Title</label>
              <input
                type="text"
                value={plan.title}
                onChange={(e) => setPlan({ ...plan, title: e.target.value })}
                className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">Description</label>
              <input
                type="text"
                value={plan.description}
                onChange={(e) => setPlan({ ...plan, description: e.target.value })}
                className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Lesson list with edit/reorder controls */}
          <div className="space-y-3">
            {plan.lessons.map((lesson, index) => (
              <div
                key={`${lesson.id}-${index}`}
                className="p-4 bg-background border border-border rounded-lg shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    {editingTitleIndex === index ? (
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={editingTitleValue}
                          onChange={(e) => setEditingTitleValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTitle();
                            if (e.key === 'Escape') handleCancelEditTitle();
                          }}
                          autoFocus
                          className="flex-1 px-2 py-1 border border-border rounded bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <button
                          onClick={handleSaveTitle}
                          className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-950 rounded"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button
                          onClick={handleCancelEditTitle}
                          className="p-1 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-foreground">{lesson.title}</h3>
                        <button
                          onClick={() => handleEditTitle(index)}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                          title="Edit title"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    )}

                    <ul className="text-sm text-muted-foreground space-y-0.5">
                      {lesson.keyPoints.map((kp, ki) => (
                        <li key={ki}>• {kp}</li>
                      ))}
                    </ul>

                    {lesson.widgetSuggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lesson.widgetSuggestions.map((ws, wi) => (
                          <span
                            key={wi}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                          >
                            {ws.type === 'sandbox' ? '🧪' : ws.type === 'mutator' ? '🔧' : '⚖️'}{' '}
                            {ws.type}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reorder + delete controls */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleMoveLesson(index, 'up')}
                      disabled={index === 0}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      onClick={() => handleMoveLesson(index, 'down')}
                      disabled={index === plan.lessons.length - 1}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      <ArrowDown size={16} />
                    </button>
                    {plan.lessons.length > 1 && (
                      <button
                        onClick={() => handleDeleteLesson(index)}
                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors"
                        title="Remove lesson"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Error display within plan review */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleRegeneratePlan}
              className="flex-1 py-3 px-4 border-2 border-primary text-primary rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-primary/10 transition-colors"
            >
              <RefreshCw size={18} />
              Regenerate Plan
            </button>
            <button
              onClick={handleContinueToLessons}
              disabled={plan.lessons.length === 0}
              className="flex-1 py-3 px-6 bg-primary text-primary-foreground rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Play size={18} />
              Generate Lessons
            </button>
          </div>
        </div>
      )}

      {/* Generating Lessons (Stage 2 running) */}
      {state === 'generating-lessons' && progress && (
        <div className="p-6 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg space-y-4">
          <ProgressStep
            label={`Write lessons (${progress.currentLesson ?? 0}/${progress.totalLessons ?? '?'})`}
            description={progress.message}
            icon={<PenLine size={18} />}
            status="active"
          />
        </div>
      )}

      {/* ─── Lesson Review (after generation) ─── */}
      {state === 'review-lessons' && plan && generatedLessons.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setState('review-plan')}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              ← Back to plan editor
            </button>
          </div>

          <div className="p-6 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={20} className="text-green-600 dark:text-green-400" />
              <h2 className="text-xl font-bold text-green-900 dark:text-green-100">Lessons Generated!</h2>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300">
              Review your lessons below. If any lesson isn't quite right, you can regenerate it individually.
            </p>
          </div>

          {/* Lesson cards */}
          <div className="space-y-3">
            {generatedLessons.map((lesson, index) => (
              <div
                key={lesson.id}
                className="p-4 bg-background border border-border rounded-lg shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <h3 className="font-semibold text-foreground">{lesson.title}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="px-2 py-0.5 bg-muted rounded">{lesson.metadata.difficulty}</span>
                      <span className="px-2 py-0.5 bg-muted rounded">~{lesson.metadata.estimatedMinutes} min</span>
                      {lesson.content.widgets.length > 0 && (
                        <span className="px-2 py-0.5 bg-primary/10 text-primary rounded">
                          {lesson.content.widgets.length} widget{lesson.content.widgets.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {lesson.content.markdown.slice(0, 150).replace(/#+ /g, '').replace(/\{\{widget:.*?\}\}/g, '[widget]')}...
                    </p>
                  </div>

                  <button
                    onClick={() => handleRegenerateSingleLesson(index)}
                    disabled={regeneratingIndex === index}
                    className="flex-shrink-0 px-3 py-2 border border-border text-sm rounded-lg hover:bg-muted disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                    title="Regenerate this lesson"
                  >
                    {regeneratingIndex === index ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    {regeneratingIndex === index ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Error display within lesson review */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
            </div>
          )}

          <button
            onClick={handleSaveAndNavigate}
            className="w-full py-3 px-6 bg-primary text-primary-foreground rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
          >
            <CheckCircle2 size={20} />
            Save & Open Course
          </button>
        </div>
      )}

      {/* Saving */}
      {state === 'saving' && (
        <div className="p-6 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
          <Loader2 className="animate-spin text-green-600 dark:text-green-400" size={24} />
          <div>
            <p className="font-semibold text-green-900 dark:text-green-100">Saving your course...</p>
            <p className="text-sm text-green-700 dark:text-green-300">Storing in local browser storage</p>
          </div>
        </div>
      )}

      {/* Success */}
      {state === 'success' && (
        <div className="p-6 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="text-green-600 dark:text-green-400" size={24} />
          <div>
            <p className="font-semibold text-green-900 dark:text-green-100">Course generated successfully!</p>
            <p className="text-sm text-green-700 dark:text-green-300">Redirecting to your course in a moment...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {state === 'error' && error && (
        <div className="space-y-4">
          <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={24} />
              <div className="flex-1">
                <p className="font-semibold text-red-900 dark:text-red-100 mb-1">Generation Failed</p>
                <p className="text-sm text-red-700 dark:text-red-300 mb-4 whitespace-pre-wrap break-words">{error.message}</p>

                <button
                  onClick={() => {
                    setState(sourceContent ? 'review-plan' : 'idle');
                    setError(null);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  {sourceContent ? 'Back to Plan' : 'Try Again'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Progress step sub-component
// ───────────────────────────────────────────────────────────────

function ProgressStep({
  label,
  description,
  icon,
  status,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'active' | 'complete';
}) {
  const colors = {
    pending: 'text-purple-300 dark:text-purple-700',
    active: 'text-purple-600 dark:text-purple-300',
    complete: 'text-purple-800 dark:text-purple-200',
  };

  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 ${colors[status]}`}>
        {status === 'active' ? (
          <Loader2 className="animate-spin" size={18} />
        ) : status === 'complete' ? (
          <CheckCircle2 size={18} />
        ) : (
          icon
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`font-medium ${
            status === 'active'
              ? 'text-purple-900 dark:text-purple-100'
              : status === 'complete'
              ? 'text-purple-800 dark:text-purple-200'
              : 'text-purple-400 dark:text-purple-600'
          }`}
        >
          {label}
        </p>
        {description && (
          <p
            className={`text-sm truncate ${
              status === 'active'
                ? 'text-purple-700 dark:text-purple-300'
                : 'text-purple-500 dark:text-purple-500'
            }`}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
