import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProgressStore } from '@/engine/progress';
import { tracks } from '@/curriculum/graph';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  ArrowLeft,
  Lock,
  CheckCircle2,
  CirclePlay,
  Clock,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Tag,
  Sparkles,
  MessageCircle,
} from 'lucide-react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { LessonStatus } from '@/engine/progress';
import { FloatingAITutor } from '@/components/core/FloatingAITutor';
import { MarkdownRenderer } from '@/components/core/MarkdownRenderer';
import { extractSectionTitles } from '@/engine/prompts';

export function Lesson() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { getLessonStatus, markComplete, markIncomplete, completedLessons } =
    useProgressStore();

  // ── AI Tutor panel state (owned here so MarkdownRenderer can open it) ──
  const [aiOpen, setAiOpen] = useState(false);
  const [prefilledMessage, setPrefilledMessage] = useState<string | undefined>();
  const [currentSection, setCurrentSection] = useState<string | undefined>();

  let lesson = null;
  let moduleName = '';
  for (const track of tracks) {
    for (const mod of track.modules) {
      for (const l of mod.lessons) {
        if (l.id === lessonId) {
          lesson = l;
          moduleName = mod.title;
          break;
        }
      }
      if (lesson) break;
    }
    if (lesson) break;
  }

  // ── Derive section titles from the lesson markdown (for roadmap prompt) ─
  const sectionTitles = useMemo(
    () => (lesson ? extractSectionTitles(lesson.content.markdown) : []),
    [lesson]
  );

  if (!lesson) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" /> Back to tracks
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="size-8 text-destructive mx-auto mb-3" />
            <p className="text-muted-foreground">
              Lesson &quot;
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {lessonId}
              </code>
              &quot; was not found in the curriculum.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status: LessonStatus = getLessonStatus(lesson.id);
  const isCompleted = completedLessons.includes(lesson.id);

  const parentModule = tracks
    .flatMap((t) => t.modules)
    .find((m) => m.lessons.some((l) => l.id === lessonId));
  const lessonIndex =
    parentModule?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  const prevLesson = lessonIndex > 0 ? parentModule?.lessons[lessonIndex - 1] : undefined;
  const nextLesson = parentModule?.lessons[lessonIndex + 1];

  // Called when user clicks a contextual "Ask AI" prompt inside the lesson
  const handleAskAI = useCallback((sectionTitle: string) => {
    setPrefilledMessage(
      `I'm reading the "${sectionTitle}" section. Can you explain the key ideas using a concrete example?`
    );
    setAiOpen(true);
  }, []);

  const handleAiOpenChange = useCallback(
    (open: boolean) => {
      setAiOpen(open);
      if (!open) {
        // Clear prefilled message once the panel is closed
        setPrefilledMessage(undefined);
      }
    },
    []
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <ChevronRight className="size-3" />
        <span>{moduleName}</span>
        <ChevronRight className="size-3" />
        <span className="text-foreground font-medium">{lesson.title}</span>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={status} />
            <DifficultyBadge difficulty={lesson.metadata.difficulty} />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {lesson.metadata.estimatedMinutes} min
            </span>
            <span className="text-[0.65rem] text-muted-foreground ml-auto">
              v{lesson.metadata.version}
            </span>
          </div>
          {status !== 'locked' && (
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground
                         bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mt-2"
            >
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span>
                <span className="font-medium text-foreground">
                  AI Tutor available
                </span>{' '}
                — Click the chat button in the bottom-right corner or press{' '}
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[0.65rem] font-mono">
                  Ctrl+K
                </kbd>{' '}
                to ask questions about this lesson
              </span>
            </div>
          )}
          <CardTitle className="text-2xl">{lesson.title}</CardTitle>
          {lesson.description && (
            <CardDescription className="text-base">
              {lesson.description}
            </CardDescription>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {lesson.metadata.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[0.65rem]
                           bg-muted/60 text-muted-foreground rounded-full px-2 py-0.5"
              >
                <Tag className="size-2.5" />
                {tag}
              </span>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border bg-muted/10 p-6">
            <MarkdownRenderer
              markdown={lesson.content.markdown}
              widgets={lesson.content.widgets}
              showAITutor={status !== 'locked'}
              onAskAI={handleAskAI}
            />
            {/* IntersectionObserver lives inside this component; it watches
                rendered [data-section-title] elements and reports the
                currently visible section title up to Lesson state. */}
            <SectionObserver
              onVisibleSection={setCurrentSection}
            />
          </div>

          {lesson.prerequisites.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Prerequisites
              </h3>
              <div className="flex flex-wrap gap-2">
                {lesson.prerequisites.map((prereqId) => {
                  const prereqStatus = getLessonStatus(prereqId);
                  const prereqLesson = tracks
                    .flatMap((t) => t.modules.flatMap((m) => m.lessons))
                    .find((l) => l.id === prereqId);
                  return (
                    <Link
                      key={prereqId}
                      to={
                        prereqStatus === 'locked' ? '#' : `/lesson/${prereqId}`
                      }
                      className="inline-flex items-center gap-1.5 text-xs bg-muted
                                 hover:bg-muted/80 rounded-full px-3 py-1 transition-colors"
                      onClick={(e) => {
                        if (prereqStatus === 'locked') e.preventDefault();
                      }}
                    >
                      {prereqStatus === 'completed' && (
                        <CheckCircle2 className="size-3 text-green-500" />
                      )}
                      {prereqStatus === 'available' && (
                        <CirclePlay className="size-3 text-primary" />
                      )}
                      {prereqStatus === 'locked' && (
                        <Lock className="size-3 text-muted-foreground" />
                      )}
                      {prereqLesson?.title ?? prereqId}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* End-of-lesson CTA — helps users who scrolled to the bottom
              discover the AI tutor */}
          {status !== 'locked' && !aiOpen && (
            <button
              onClick={() => {
                setPrefilledMessage(
                  `I just finished reading "${lesson.title}". Can you quiz me on the key concepts to make sure I understood everything?`
                );
                setAiOpen(true);
              }}
              className="w-full flex items-center gap-3 p-4 rounded-lg border
                         border-dashed border-primary/40 bg-primary/5
                         hover:bg-primary/10 transition-colors text-left group"
            >
              <div
                className="w-10 h-10 rounded-full bg-primary/20 flex items-center
                           justify-center group-hover:bg-primary/30 transition-colors"
              >
                <MessageCircle className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  Review what you learned
                </div>
                <div className="text-xs text-muted-foreground">
                  Ask the AI Tutor to quiz you on "{lesson.title}"
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3 items-stretch">
          {status === 'locked' ? (
            <div
              className="flex items-center justify-center gap-2 text-sm
                         text-muted-foreground py-2"
            >
              <Lock className="size-4" />
              <span>Complete prerequisites to unlock this lesson</span>
            </div>
          ) : (
            <>
              <Button
                onClick={() =>
                  isCompleted
                    ? markIncomplete(lesson!.id)
                    : markComplete(lesson!.id)
                }
                variant={isCompleted ? 'outline' : 'default'}
                size="lg"
                className="w-full"
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="size-4 mr-1" /> Mark Incomplete
                  </>
                ) : (
                  'Mark Complete'
                )}
              </Button>

              {/* Prev / Next navigation */}
              <div className="flex gap-2 w-full">
                {prevLesson && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 justify-start"
                    onClick={() => navigate(`/lesson/${prevLesson.id}`)}
                  >
                    <ChevronLeft className="size-4 mr-1" />
                    <span className="truncate">{prevLesson.title}</span>
                  </Button>
                )}
                {isCompleted && nextLesson && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 justify-end"
                    onClick={() => navigate(`/lesson/${nextLesson.id}`)}
                  >
                    <span className="truncate">{nextLesson.title}</span>
                    <ChevronRight className="size-4 ml-1" />
                  </Button>
                )}
              </div>
            </>
          )}
        </CardFooter>
      </Card>

      {status !== 'locked' && (
        <FloatingAITutor
          open={aiOpen}
          onOpenChange={handleAiOpenChange}
          lessonId={lesson.id}
          lessonTitle={lesson.title}
          lessonDescription={lesson.description}
          lessonContent={lesson.content.markdown}
          moduleName={moduleName}
          tags={lesson.metadata.tags}
          currentSection={currentSection}
          sectionTitles={sectionTitles}
          prefilledMessage={prefilledMessage}
        />
      )}
    </div>
  );
}

// ─── Section Observer ──────────────────────────────────────────────────────

/**
 * Watches all [data-section-title] elements in the document and reports
 * the currently most-visible section title via callback.
 *
 * Uses IntersectionObserver for performance (no scroll handlers).
 * Re-observes whenever the DOM mutates (e.g., navigation to a new lesson)
 * via a MutationObserver.
 */
function SectionObserver({
  onVisibleSection,
}: {
  onVisibleSection: (section: string | undefined) => void;
}) {
  const callbackRef = useRef(onVisibleSection);
  callbackRef.current = onVisibleSection;

  useEffect(() => {
    // Track which sections are currently intersecting + their ratios
    const visibleSections = new Map<string, number>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const title =
            (entry.target as HTMLElement).dataset.sectionTitle || '';
          if (!title) continue;
          if (entry.isIntersecting) {
            visibleSections.set(title, entry.intersectionRatio);
          } else {
            visibleSections.delete(title);
          }
        }

        // Pick the section with highest ratio (or undefined if none)
        let best: string | undefined;
        let bestRatio = 0;
        visibleSections.forEach((ratio, title) => {
          if (ratio > bestRatio) {
            best = title;
            bestRatio = ratio;
          }
        });
        callbackRef.current(best);
      },
      {
        // Trigger at multiple thresholds for better "most visible" resolution
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: '-80px 0px -40% 0px', // offset for sticky header
      }
    );

    const observe = () => {
      io.disconnect();
      document
        .querySelectorAll<HTMLElement>('[data-section-title]')
        .forEach((el) => io.observe(el));
    };

    observe();

    // Re-observe when DOM changes (e.g., HMR, lazy-loaded widgets)
    const mo = new MutationObserver(() => observe());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}

function StatusBadge({ status }: { status: LessonStatus }) {
  const config = {
    completed: {
      variant: 'default' as const,
      icon: CheckCircle2,
      label: 'Completed',
      className:
        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    available: {
      variant: 'secondary' as const,
      icon: CirclePlay,
      label: 'Available',
      className: '',
    },
    locked: {
      variant: 'outline' as const,
      icon: Lock,
      label: 'Locked',
      className: '',
    },
  };
  const { variant, icon: Icon, label, className } = config[status];
  return (
    <Badge variant={variant} className={className}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

function DifficultyBadge({
  difficulty,
}: {
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}) {
  const config = {
    beginner: {
      label: 'Beginner',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    intermediate: {
      label: 'Intermediate',
      className:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    },
    advanced: {
      label: 'Advanced',
      className:
        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
  };
  const { label, className } = config[difficulty];
  return (
    <Badge variant="secondary" className={`text-[0.65rem] ${className}`}>
      {label}
    </Badge>
  );
}
