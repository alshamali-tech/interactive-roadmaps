import type { ReactNode } from 'react';
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
  ArrowRight,
  Lock,
  CheckCircle2,
  CirclePlay,
  Clock,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Tag,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import type { LessonStatus } from '@/engine/progress';
import type { WidgetConfig } from '@/curriculum/schema';
import { widgetRegistry } from '@/engine/registry';
import { InlineMarkdown } from '@/components/utils/InlineMarkdown';
import { FloatingAITutor } from '@/components/core/FloatingAITutor';

export function Lesson() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { getLessonStatus, markComplete, markIncomplete, completedLessons } =
    useProgressStore();

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
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mt-2">
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span>
                <span className="font-medium text-foreground">AI Tutor available</span> — Click the chat button in the bottom-right corner or press{' '}
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
                className="inline-flex items-center gap-1 text-[0.65rem] bg-muted/60 text-muted-foreground rounded-full px-2 py-0.5"
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
              lessonId={lesson.id}
              lessonTitle={lesson.title}
              lessonDescription={lesson.description}
              lessonContent={lesson.content.markdown}
              moduleName={moduleName}
              tags={lesson.metadata.tags}
              showAITutor={status !== 'locked'}
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
                      className="inline-flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 rounded-full px-3 py-1 transition-colors"
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
        </CardContent>

        <CardFooter className="flex-col gap-3 items-stretch">
          {status === 'locked' ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
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
          lessonId={lesson.id}
          lessonTitle={lesson.title}
          lessonDescription={lesson.description}
          lessonContent={lesson.content.markdown}
          moduleName={moduleName}
          tags={lesson.metadata.tags}
        />
      )}
    </div>
  );
}

// ─── Copy Button for Code Blocks ───────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-colors"
      aria-label="Copy code"
      title="Copy code"
    >
      {copied ? (
        <Check className="size-3.5 text-green-400" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

// ─── Markdown Renderer ──────────────────────────────────────────────────────

function MarkdownRenderer({
  markdown,
  widgets,
  lessonId,
  lessonTitle,
  lessonDescription,
  lessonContent,
  moduleName,
  tags,
  showAITutor,
}: {
  markdown: string;
  widgets: WidgetConfig[];
  lessonId?: string;
  lessonTitle?: string;
  lessonDescription?: string;
  lessonContent?: string;
  moduleName?: string;
  tags?: string[];
  showAITutor?: boolean;
}) {
  const lines = markdown.split('\n');
  const elements: ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let paragraphLines: string[] = [];
  let blockquoteLines: string[] = [];
  let sectionCount = 0;

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const text = paragraphLines.join(' ').trim();
      if (text) {
        elements.push(
          <p
            key={`p-${elements.length}`}
            className="text-foreground leading-7 mb-4"
          >
            <InlineMarkdown text={text} />
          </p>
        );
      }
      paragraphLines = [];
    }
  };

  const flushBlockquote = () => {
    if (blockquoteLines.length > 0) {
      const text = blockquoteLines.join(' ').trim();
      if (text) {
        elements.push(
          <blockquote
            key={`bq-${elements.length}`}
            className="border-l-4 border-primary/40 pl-4 py-1 my-4 italic text-muted-foreground"
          >
            <InlineMarkdown text={text} />
          </blockquote>
        );
      }
      blockquoteLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const codeContent = codeBlockLines.join('\n');
        elements.push(
          <div key={`code-${elements.length}`} className="relative mb-4 group">
            <pre className="bg-[#1e1e2e] rounded-lg p-4 overflow-x-auto text-sm pr-10">
              <code className="font-mono text-[#cdd6f4]">{codeContent}</code>
            </pre>
            <CopyButton text={codeContent} />
          </div>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        flushParagraph();
        flushBlockquote();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    const widgetMatch = line.match(/^\{\{widget:([^}]+)\}\}$/);
    if (widgetMatch) {
      flushParagraph();
      flushBlockquote();
      const widgetId = widgetMatch[1];
      const widget = widgets.find((w) => w.id === widgetId);
      if (widget) {
        elements.push(
          <WidgetRenderer key={`widget-${elements.length}`} widget={widget} />
        );
      }
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      flushBlockquote();
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^>\s?(.*)$/);
    if (bqMatch) {
      flushParagraph();
      blockquoteLines.push(bqMatch[1]);
      continue;
    } else if (blockquoteLines.length > 0) {
      flushBlockquote();
    }

    const h3Match = line.match(/^### (.+)$/);
    const h2Match = line.match(/^## (.+)$/);
    const h1Match = line.match(/^# (.+)$/);

    if (h1Match) {
      flushParagraph();
      sectionCount++;
      elements.push(
        <h1
          key={`h1-${elements.length}`}
          className="text-2xl font-bold text-foreground mb-3 mt-2"
        >
          <InlineMarkdown text={h1Match[1]} />
        </h1>
      );
      continue;
    }
    if (h2Match) {
      flushParagraph();
      sectionCount++;
      elements.push(
        <h2
          key={`h2-${elements.length}`}
          className="text-xl font-semibold text-foreground mb-2 mt-6"
        >
          <InlineMarkdown text={h2Match[1]} />
        </h2>
      );
      // Add contextual AI prompt after every 2nd section
      if (showAITutor && sectionCount > 0 && sectionCount % 2 === 0 && lessonId) {
        elements.push(
          <div
            key={`ai-prompt-${elements.length}`}
            className="my-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 border border-border/50 rounded-lg px-3 py-2"
          >
            <Sparkles className="size-3.5 text-primary shrink-0" />
            <span className="flex-1">
              Have questions about this section? Use the AI Tutor to get help.
            </span>
            <button
              onClick={() => {
                // Trigger the floating AI tutor
                const event = new KeyboardEvent('keydown', {
                  key: 'k',
                  ctrlKey: true,
                  bubbles: true,
                });
                window.dispatchEvent(event);
              }}
              className="text-primary hover:text-primary/80 font-medium whitespace-nowrap"
            >
              Ask AI
            </button>
          </div>
        );
      }
      continue;
    }
    if (h3Match) {
      flushParagraph();
      sectionCount++;
      elements.push(
        <h3
          key={`h3-${elements.length}`}
          className="text-lg font-semibold text-foreground mb-2 mt-4"
        >
          <InlineMarkdown text={h3Match[1]} />
        </h3>
      );
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    const ulMatch = line.match(/^[-*]\s+(.+)$/);

    if (olMatch) {
      flushParagraph();
      elements.push(
        <div
          key={`ol-${elements.length}`}
          className="flex items-start gap-2 mb-1 ml-2"
        >
          <span className="text-muted-foreground font-mono text-sm mt-0.5">
            {line.match(/^(\d+)\./)?.[1]}.
          </span>
          <span className="text-foreground">
            <InlineMarkdown text={olMatch[1]} />
          </span>
        </div>
      );
      continue;
    }

    if (ulMatch) {
      flushParagraph();
      elements.push(
        <div
          key={`ul-${elements.length}`}
          className="flex items-start gap-2 mb-1 ml-2"
        >
          <span className="text-muted-foreground mt-1.5">•</span>
          <span className="text-foreground">
            <InlineMarkdown text={ulMatch[1]} />
          </span>
        </div>
      );
      continue;
    }

    if (line.startsWith('|') && line.includes('|', 1)) {
      flushParagraph();
      const tableRows: string[][] = [];
      let j = i;
      while (j < lines.length && lines[j].startsWith('|')) {
        const row = lines[j]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        if (!row.every((c) => /^[-:]+$/.test(c))) {
          tableRows.push(row);
        }
        j++;
      }
      if (tableRows.length > 0) {
        const [header, ...body] = tableRows;
        elements.push(
          <div
            key={`table-${elements.length}`}
            className="overflow-x-auto mb-4"
          >
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted/50">
                <tr>
                  {header.map((cell, ci) => (
                    <th
                      key={ci}
                      className="text-left px-3 py-2 font-semibold text-foreground border-b border-border"
                    >
                      <InlineMarkdown text={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-border last:border-0"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-2 text-foreground/90"
                      >
                        <InlineMarkdown text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      i = j - 1;
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushBlockquote();
  return <>{elements}</>;
}

function WidgetRenderer({ widget }: { widget: WidgetConfig }) {
  const RegisteredComponent = widgetRegistry.resolve(widget);
  if (RegisteredComponent) {
    return <RegisteredComponent {...widget.props} />;
  }
  return (
    <div className="my-5 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
      <Sparkles className="size-4 mx-auto mb-1" />
      Unknown widget type:{' '}
      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
        {widget.type}
      </code>
    </div>
  );
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
