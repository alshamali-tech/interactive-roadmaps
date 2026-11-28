/**
 * S7 support — stage view state.
 *
 * Kept apart from GenerationProgress.tsx because that file must export only the
 * component for React Fast Refresh to work; the reducer is pure and testable here.
 */

export type StageStatus = 'pending' | 'in-progress' | 'complete' | 'error';

export interface StageViewState {
  name: string;
  status: StageStatus;
  description?: string;
}

/** One progress event from the staged pipeline (mirrors StagePipelineProgress). */
export interface StageEvent {
  stage: string;
  status: 'started' | 'completed' | 'retried' | 'failed' | 'skipped';
  message: string;
}

const STATUS_FOR_EVENT: Record<StageEvent['status'], StageStatus> = {
  started: 'in-progress',
  completed: 'complete',
  skipped: 'complete',
  retried: 'in-progress',
  failed: 'error',
};

/**
 * Folds progress events into view state. Events arrive in order, so a stage's
 * last event wins; stages passed in but never reported stay pending.
 */
export function reduceStageStatuses(
  knownStages: Array<{ type: string; name: string }>,
  events: StageEvent[]
): StageViewState[] {
  const byKey = new Map<string, StageViewState>(
    knownStages.map((stage) => [stage.type, { name: stage.name, status: 'pending' }])
  );

  for (const event of events) {
    const entry = byKey.get(event.stage) ?? {
      name: event.stage,
      status: 'pending' as StageStatus,
    };
    entry.status = STATUS_FOR_EVENT[event.status];
    entry.description = event.message;
    byKey.set(event.stage, entry);
  }

  return [...byKey.values()];
}
