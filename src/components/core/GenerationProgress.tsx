/**
 * S7 — Generation Progress UI
 *
 * Shows which stage is running, what completed, and overall progress while a
 * staged lesson generates. Presentation only: all state comes from the pipeline's
 * progress callback via `reduceStageStatuses`, so the component stays testable.
 */
import { AlertCircle, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StageStatus, StageViewState } from './progressStages';

export type { StageStatus, StageViewState, StageEvent } from './progressStages';

export interface GenerationProgressProps {
  stages: StageViewState[];
  currentStage: string;
  percent: number;
  lessonTitle?: string;
  stageDetails?: string;
}

const STATUS_LABEL: Record<StageStatus, string> = {
  pending: 'Waiting',
  'in-progress': 'Working',
  complete: 'Done',
  error: 'Reduced',
};

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === 'complete') return <CheckCircle2 className="size-4 text-green-500 shrink-0" />;
  if (status === 'in-progress') return <Loader2 className="size-4 text-primary animate-spin shrink-0" />;
  if (status === 'error') return <AlertCircle className="size-4 text-amber-500 shrink-0" />;
  return <Circle className="size-4 text-muted-foreground/50 shrink-0" />;
}

export function GenerationProgress({
  stages,
  currentStage,
  percent,
  lessonTitle,
  stageDetails,
}: GenerationProgressProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 space-y-3"
      aria-label="Lesson generation progress"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {lessonTitle && (
            <p className="text-sm font-medium text-foreground truncate">{lessonTitle}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {currentStage ? `Working on: ${currentStage}` : 'Preparing stages'}
          </p>
        </div>
        <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
          {clamped}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>

      <ol className="space-y-1.5">
        {stages.map((stage) => (
          <li
            key={stage.name}
            aria-current={stage.status === 'in-progress' ? 'step' : undefined}
            className={cn(
              'flex items-start gap-2 text-sm rounded-md px-2 py-1.5 transition-colors',
              stage.status === 'in-progress' && 'bg-primary/5',
              stage.status === 'pending' && 'text-muted-foreground'
            )}
          >
            <span className="mt-0.5">
              <StatusIcon status={stage.status} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate',
                  stage.status === 'complete'
                    ? 'text-muted-foreground'
                    : 'text-foreground font-medium'
                )}
              >
                {stage.name}
              </span>
              {stage.description && (
                <span className="block text-xs text-muted-foreground truncate">
                  {stage.description}
                </span>
              )}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
              {STATUS_LABEL[stage.status]}
            </span>
          </li>
        ))}
      </ol>

      {stageDetails && (
        <p className="text-xs text-muted-foreground border-t border-border pt-2">
          {stageDetails}
        </p>
      )}
    </div>
  );
}
