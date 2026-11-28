/**
 * S7 — Generation progress UI tests.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GenerationProgress } from './GenerationProgress';
import { reduceStageStatuses, type StageEvent } from './progressStages';

const KNOWN_STAGES = [
  { type: 'introduction', name: 'Introduction' },
  { type: 'explanation', name: 'Explanation' },
  { type: 'quiz', name: 'Knowledge Check' },
];

describe('reduceStageStatuses', () => {
  it('marks unseen stages pending and the active stage in-progress', () => {
    const stages = reduceStageStatuses(KNOWN_STAGES, [
      { stage: 'introduction', status: 'completed', message: 'done' },
      { stage: 'explanation', status: 'started', message: 'writing' },
    ]);

    expect(stages.find((s) => s.name === 'Introduction')?.status).toBe('complete');
    expect(stages.find((s) => s.name === 'Explanation')?.status).toBe('in-progress');
    expect(stages.find((s) => s.name === 'Knowledge Check')?.status).toBe('pending');
  });

  it('treats a resumed stage as complete and a failed one as reduced', () => {
    expect(
      reduceStageStatuses(KNOWN_STAGES, [
        { stage: 'quiz', status: 'skipped', message: 'restored' },
      ])[2].status
    ).toBe('complete');
    expect(
      reduceStageStatuses(KNOWN_STAGES, [
        { stage: 'quiz', status: 'failed', message: 'reduced' },
      ])[2].status
    ).toBe('error');
  });

  it('keeps the last event for a stage', () => {
    const events: StageEvent[] = [
      { stage: 'introduction', status: 'started', message: 'a' },
      { stage: 'introduction', status: 'retried', message: 'b' },
      { stage: 'introduction', status: 'completed', message: 'c' },
    ];
    const [intro] = reduceStageStatuses(KNOWN_STAGES, events);
    expect(intro.status).toBe('complete');
    expect(intro.description).toBe('c');
  });
});

describe('GenerationProgress', () => {
  it('lists every stage with its label and status', () => {
    render(
      <GenerationProgress
        stages={[
          { name: 'Introduction', status: 'complete' },
          { name: 'Explanation', status: 'in-progress', description: 'Writing the core...' },
          { name: 'Knowledge Check', status: 'pending' },
        ]}
        currentStage="Explanation"
        percent={55}
        lessonTitle="Vector Stores"
      />
    );

    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.getByText('Explanation')).toBeInTheDocument();
    expect(screen.getByText('Writing the core...')).toBeInTheDocument();
    expect(screen.getByText('Vector Stores')).toBeInTheDocument();
    expect(screen.getByText('Working on: Explanation')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
  });

  it('exposes an accessible progressbar with a clamped value', () => {
    render(
      <GenerationProgress stages={[{ name: 'Intro', status: 'complete' }]} currentStage="" percent={140} />
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('marks the active step for assistive tech', () => {
    render(
      <GenerationProgress
        stages={[
          { name: 'Intro', status: 'complete' },
          { name: 'Explain', status: 'in-progress' },
        ]}
        currentStage="Explain"
        percent={40}
      />
    );
    expect(screen.getByText('Explain').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Intro').closest('li')).not.toHaveAttribute('aria-current');
  });

  it('renders an empty stage list without crashing', () => {
    render(<GenerationProgress stages={[]} currentStage="" percent={0} />);
    expect(screen.getByText('Preparing stages')).toBeInTheDocument();
  });
});
