import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { extractContentFromUrl, extractContentFromText } from '@/engine/extractor';
import { saveGeneratedCourse } from '@/engine/localCourses';
import { useSettingsStore } from '@/engine/settings';
import { generateCourse, type GenerationProgress } from '@/engine/courseGenerator';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Globe,
  FileText,
  ListChecks,
  PenLine,
  PackageCheck,
} from 'lucide-react';

type GenState = 'idle' | 'extracting' | 'running' | 'saving' | 'success' | 'error';

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

      // Stage 2-4: Plan → Execute → Merge
      setState('running');
      const course = await generateCourse(content, aiSettings, {
        numLessons,
        onProgress: setProgress,
      });

      // Stage 5: Save
      setState('saving');
      const courseId = await saveGeneratedCourse(course);

      setState('success');
      setTimeout(() => navigate(`/course/${courseId}`), 1500);
    } catch (err: unknown) {
      setState('error');
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setError({ message });
    }
  };

  const handleRegenerate = () => {
    setState('idle');
    setError(null);
    setProgress(null);
    handleGenerate();
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
          <Loader2
            className="animate-spin text-blue-600 dark:text-blue-400"
            size={24}
          />
          <div>
            <p className="font-semibold text-blue-900 dark:text-blue-100">
              Reading content from source...
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Extracting clean text from the provided source
            </p>
          </div>
        </div>
      )}

      {/* Running (Plan → Execute → Merge) */}
      {state === 'running' && progress && (
        <div className="p-6 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg space-y-4">
          <ProgressStep
            label="Plan"
            description="Analyze content and design lesson outline"
            icon={<ListChecks size={18} />}
            status={
              progress.stage === 'planning' ? 'active' : 'complete'
            }
          />

          <ProgressStep
            label={`Write lessons (${progress.currentLesson ?? 0}/${progress.totalLessons ?? '?'})`}
            description={
              progress.stage === 'generating-lesson'
                ? progress.lessonTitle ?? 'Writing lesson content...'
                : progress.stage === 'merging'
                ? 'All lessons written'
                : progress.stage === 'planning'
                ? 'Waiting for plan...'
                : ''
            }
            icon={<PenLine size={18} />}
            status={
              progress.stage === 'generating-lesson'
                ? 'active'
                : progress.stage === 'merging'
                ? 'complete'
                : 'pending'
            }
          />

          <ProgressStep
            label="Assemble course"
            description={
              progress.stage === 'merging'
                ? 'Validating and wiring prerequisites...'
                : 'Waiting for lessons...'
            }
            icon={<PackageCheck size={18} />}
            status={
              progress.stage === 'merging' ? 'active' : 'pending'
            }
          />
        </div>
      )}

      {/* Saving */}
      {state === 'saving' && (
        <div className="p-6 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
          <Loader2
            className="animate-spin text-green-600 dark:text-green-400"
            size={24}
          />
          <div>
            <p className="font-semibold text-green-900 dark:text-green-100">
              Saving your course...
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Storing in local browser storage
            </p>
          </div>
        </div>
      )}

      {/* Success */}
      {state === 'success' && (
        <div className="p-6 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="text-green-600 dark:text-green-400" size={24} />
          <div>
            <p className="font-semibold text-green-900 dark:text-green-100">
              Course generated successfully!
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Redirecting to your course in a moment...
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {state === 'error' && error && (
        <div className="space-y-4">
          <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle
                className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
                size={24}
              />
              <div className="flex-1">
                <p className="font-semibold text-red-900 dark:text-red-100 mb-1">
                  Generation Failed
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mb-4 whitespace-pre-wrap break-words">
                  {error.message}
                </p>

                {error.rawResponse && (
                  <details className="mb-4">
                    <summary className="cursor-pointer text-sm font-medium text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100">
                      Show raw AI response (for debugging)
                    </summary>
                    <pre className="mt-2 p-3 bg-red-100 dark:bg-red-900/50 rounded text-xs overflow-x-auto max-h-64 text-red-900 dark:text-red-100">
                      {error.rawResponse}
                    </pre>
                  </details>
                )}

                <button
                  onClick={handleRegenerate}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  Regenerate
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
