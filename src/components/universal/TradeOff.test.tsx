import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TradeOff } from './TradeOff';
import type { TradeOffOption } from '@/curriculum/schema';
import { generateChatCompletion } from '@/engine/aiService';
import { useSettingsStore } from '@/engine/settings';

// Mock the AI service so no real network calls happen. The component only
// calls it when the settings store reports a connected provider.
vi.mock('@/engine/aiService', () => ({
  generateChatCompletion: vi.fn(),
}));

const mockGenerate = vi.mocked(generateChatCompletion);

// ─── Mock Data ───────────────────────────────────────────────────────────────

const mockOptions: TradeOffOption[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Relational database with strong consistency',
    pros: ['ACID compliant', 'Rich querying', 'Mature ecosystem'],
    cons: ['Harder to scale horizontally', 'Slower writes at scale'],
    metrics: { cost: 3, performance: 6, complexity: 5, scalability: 5 },
  },
  {
    id: 'cassandra',
    name: 'Cassandra',
    description: 'Wide-column NoSQL for high write throughput',
    pros: ['Linear scalability', 'High write throughput', 'Fault tolerant'],
    cons: ['Limited query flexibility', 'Eventual consistency', 'Complex operations'],
    metrics: { cost: 5, performance: 9, complexity: 7, scalability: 9 },
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Document database with flexible schema',
    pros: ['Flexible schema', 'Easy to use', 'Good developer experience'],
    cons: ['Weaker consistency guarantees', 'Higher storage overhead'],
    metrics: { cost: 4, performance: 7, complexity: 4, scalability: 7 },
  },
];

const mockScenario = 'You need a database for 100k writes/sec. Choose wisely.';

function selectOption(name: string) {
  const card = screen.getByText(name).closest('[role="button"]');
  expect(card).not.toBeNull();
  fireEvent.click(card!);
  return card!;
}

function resetSettings() {
  useSettingsStore.setState({
    aiSettings: {
      provider: 'none',
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1',
      model: '',
      generationMode: 'focused',
    },
    isAIConnected: false,
  });
}

function connectAI() {
  useSettingsStore.setState({
    aiSettings: {
      provider: 'groq',
      apiKey: 'test-key',
      baseUrl: '',
      model: 'test-model',
      generationMode: 'focused',
    },
    isAIConnected: true,
  });
}

const validJustification =
  'PostgreSQL fits because our data is relational. Cassandra scales better but the operational cost is not justified.';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TradeOff Widget', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    resetSettings();
  });

  afterEach(() => {
    resetSettings();
  });

  it('renders scenario text and all option cards', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    expect(screen.getByText(mockScenario)).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Cassandra')).toBeInTheDocument();
    expect(screen.getByText('MongoDB')).toBeInTheDocument();
  });

  it('clicking an option reveals consequence cards (no radar chart)', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    selectOption('PostgreSQL');

    // Four consequence cards, one per metric
    expect(screen.getAllByTestId('consequence-card')).toHaveLength(4);
    // Concrete scenario text is present
    expect(screen.getByText(/10,000 requests\/second/)).toBeInTheDocument();
    // Scores shown as x/10
    expect(screen.getByTestId('score-performance')).toHaveTextContent('6/10');
    // Radar chart is gone
    expect(screen.queryByTestId('radar-chart-container')).not.toBeInTheDocument();
    // Pros/cons still visible (now in the comparison table)
    expect(screen.getByText('ACID compliant')).toBeInTheDocument();
    expect(screen.getByText('Harder to scale horizontally')).toBeInTheDocument();
  });

  it('clicking the same option again deselects it', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    const card = selectOption('PostgreSQL');
    expect(screen.getAllByTestId('consequence-card')).toHaveLength(4);

    fireEvent.click(card);
    expect(screen.queryAllByTestId('consequence-card')).toHaveLength(0);
    expect(screen.queryByText('ACID compliant')).not.toBeInTheDocument();
  });

  it('shows warning if fewer than 2 options provided', () => {
    render(
      <TradeOff
        scenario="Test scenario"
        options={[
          {
            id: 'only-one',
            name: 'Only Option',
            description: 'This is the only option',
            pros: ['Good'],
            cons: ['Bad'],
            metrics: { cost: 5, performance: 5, complexity: 5, scalability: 5 },
          },
        ]}
      />
    );
    expect(screen.getByText(/At least 2 options are required/i)).toBeInTheDocument();
  });

  // ─── Comparison table ───────────────────────────────────────────────

  it('comparison table shows all options and highlights the selected column', () => {
    const { container } = render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    selectOption('PostgreSQL');

    // Pros/cons of ALL options are in the table, not just the selected one
    expect(screen.getByText('Linear scalability')).toBeInTheDocument();
    expect(screen.getByText('Flexible schema')).toBeInTheDocument();
    expect(screen.getByText('Weaker consistency guarantees')).toBeInTheDocument();

    const selectedHeaders = container.querySelectorAll('th[data-selected="true"]');
    expect(selectedHeaders).toHaveLength(1);
    expect(selectedHeaders[0].textContent).toContain('PostgreSQL');
  });

  // ─── Justification requirement ──────────────────────────────────────

  it('gates consequences behind a 2-sentence justification when required', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} requireJustification />);
    selectOption('PostgreSQL');

    // Justification panel visible, consequences hidden
    expect(screen.getByTestId('justification-panel')).toBeInTheDocument();
    expect(screen.queryAllByTestId('consequence-card')).toHaveLength(0);

    const textarea = screen.getByLabelText('Justification input');
    const submit = screen.getByText('Submit Justification').closest('button')!;
    expect(submit).toBeDisabled();

    // One sentence is not enough
    fireEvent.change(textarea, { target: { value: 'It is a solid relational database.' } });
    expect(screen.getByTestId('sentence-count')).toHaveTextContent('1/2');
    expect(submit).toBeDisabled();

    // Two sentences unlock the button
    fireEvent.change(textarea, { target: { value: validJustification } });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    // Consequences + offline feedback appear
    expect(screen.getAllByTestId('consequence-card')).toHaveLength(4);
    expect(screen.getByTestId('justification-feedback')).toBeInTheDocument();
    expect(screen.queryByTestId('justification-panel')).not.toBeInTheDocument();
  });

  it('does not require justification by default', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    selectOption('PostgreSQL');
    expect(screen.queryByTestId('justification-panel')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('consequence-card')).toHaveLength(4);
  });

  // ─── What-if scenarios ──────────────────────────────────────────────

  it('traffic-10x what-if updates the consequence scores, Baseline restores them', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    selectOption('PostgreSQL');
    expect(screen.getByTestId('score-performance')).toHaveTextContent('6/10');

    const trafficBtn = screen.getByTestId('what-if-traffic-10x');
    fireEvent.click(trafficBtn);
    expect(trafficBtn).toHaveAttribute('aria-pressed', 'true');
    // performance 6 - 3 = 3, cost 3 + 2 = 5
    expect(screen.getByTestId('score-performance')).toHaveTextContent('3/10');
    expect(screen.getByTestId('score-cost')).toHaveTextContent('5/10');

    fireEvent.click(screen.getByText('Baseline'));
    expect(screen.getByTestId('score-performance')).toHaveTextContent('6/10');
    expect(trafficBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('team-two what-if raises complexity', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    selectOption('PostgreSQL');
    fireEvent.click(screen.getByTestId('what-if-team-two'));
    // complexity 5 + 3 = 8
    expect(screen.getByTestId('score-complexity')).toHaveTextContent('8/10');
  });

  // ─── Change My Mind ─────────────────────────────────────────────────

  it('shows an offline counter-argument and allows switching the selection', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    const pgCard = selectOption('PostgreSQL');

    fireEvent.click(screen.getByLabelText('Change My Mind'));

    const counterCard = screen.getByTestId('counter-argument');
    expect(counterCard).toBeInTheDocument();
    // Strongest alternative by goodness ranking is Cassandra
    expect(counterCard.textContent).toContain('Cassandra');

    fireEvent.click(screen.getByText('Switch to Cassandra'));

    // Selection switched, counter cleared, consequences updated
    expect(screen.queryByTestId('counter-argument')).not.toBeInTheDocument();
    expect(pgCard).toHaveAttribute('aria-pressed', 'false');
    const cassCard = within(screen.getByTestId('options-grid'))
      .getByText('Cassandra')
      .closest('[role="button"]')!;
    expect(cassCard).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('score-performance')).toHaveTextContent('9/10');
  });

  it('re-gates justification after switching when requireJustification is set', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} requireJustification />);
    selectOption('PostgreSQL');
    fireEvent.change(screen.getByLabelText('Justification input'), {
      target: { value: validJustification },
    });
    fireEvent.click(screen.getByText('Submit Justification').closest('button')!);
    expect(screen.getAllByTestId('consequence-card')).toHaveLength(4);

    fireEvent.click(screen.getByLabelText('Change My Mind'));
    fireEvent.click(screen.getByText('Switch to Cassandra'));

    // New selection must be justified again
    expect(screen.getByTestId('justification-panel')).toBeInTheDocument();
    expect(screen.queryAllByTestId('consequence-card')).toHaveLength(0);
  });

  // ─── AI integration ─────────────────────────────────────────────────

  it('sends justification to the AI and displays parsed feedback when connected', async () => {
    connectAI();
    mockGenerate.mockResolvedValue(
      '```json\n{"quality":"strong","comment":"Excellent trade-off analysis of write paths."}\n```'
    );

    render(<TradeOff scenario={mockScenario} options={mockOptions} requireJustification />);
    selectOption('PostgreSQL');
    fireEvent.change(screen.getByLabelText('Justification input'), {
      target: { value: validJustification },
    });
    fireEvent.click(screen.getByText('Submit Justification').closest('button')!);

    await waitFor(() => {
      expect(
        screen.getByText('Excellent trade-off analysis of write paths.')
      ).toBeInTheDocument();
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('strong')).toBeInTheDocument();
  });

  it('falls back to offline feedback when the AI call fails', async () => {
    connectAI();
    mockGenerate.mockRejectedValue(new Error('provider down'));

    render(<TradeOff scenario={mockScenario} options={mockOptions} requireJustification />);
    selectOption('PostgreSQL');
    fireEvent.change(screen.getByLabelText('Justification input'), {
      target: { value: validJustification },
    });
    fireEvent.click(screen.getByText('Submit Justification').closest('button')!);

    await waitFor(() => {
      expect(screen.getByTestId('justification-feedback')).toBeInTheDocument();
    });
    // Offline fallback still rendered a quality badge
    expect(screen.getByTestId('justification-feedback').textContent).toMatch(
      /strong|adequate|weak/
    );
  });

  it('uses the AI counter-argument when connected', async () => {
    connectAI();
    mockGenerate.mockResolvedValue('Cassandra eats write-heavy workloads for breakfast.');

    render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    selectOption('PostgreSQL');
    fireEvent.click(screen.getByLabelText('Change My Mind'));

    await waitFor(() => {
      expect(
        screen.getByText('Cassandra eats write-heavy workloads for breakfast.')
      ).toBeInTheDocument();
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  // ─── Mobile layout ──────────────────────────────────────────────────

  it('uses mobile-friendly responsive classes (stacked cards, scrollable table)', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);
    selectOption('PostgreSQL');

    // Option cards stack vertically on mobile
    expect(screen.getByTestId('options-grid').className).toContain('grid-cols-1');
    // Consequence cards are full-width on mobile, 2-col on desktop
    const consequenceGrid = screen.getByTestId('consequence-grid');
    expect(consequenceGrid.className).toContain('grid-cols-1');
    expect(consequenceGrid.className).toContain('md:grid-cols-2');
    // Comparison table scrolls horizontally on small screens
    expect(screen.getByTestId('comparison-table-wrapper').className).toContain('overflow-x-auto');
  });

  // ─── Explanation prop ───────────────────────────────────────────────

  it('still renders the explanation after selection', () => {
    render(
      <TradeOff
        scenario={mockScenario}
        options={mockOptions}
        explanation="For write-heavy workloads, Cassandra is typically the best choice."
      />
    );
    selectOption('PostgreSQL');
    expect(
      screen.getByText(/For write-heavy workloads, Cassandra is typically the best choice/)
    ).toBeInTheDocument();
  });
});
