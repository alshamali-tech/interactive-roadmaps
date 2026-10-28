import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeOff } from './TradeOff';
import type { TradeOffOption } from '@/curriculum/schema';

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TradeOff Widget', () => {
  it('renders scenario text and all option cards', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);

    // Assert the scenario text is visible
    expect(screen.getByText(mockScenario)).toBeInTheDocument();

    // Assert all 3 option names are visible
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Cassandra')).toBeInTheDocument();
    expect(screen.getByText('MongoDB')).toBeInTheDocument();
  });

  it('clicking an option reveals the consequence section', async () => {
    const user = userEvent.setup();
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);

    // Click the first option (PostgreSQL)
    const postgresCard = screen.getByText('PostgreSQL').closest('[role="button"]');
    expect(postgresCard).not.toBeNull();
    await user.click(postgresCard!);

    // Assert that the pros/cons section becomes visible
    expect(screen.getByText('ACID compliant')).toBeInTheDocument();
    expect(screen.getByText('Rich querying')).toBeInTheDocument();
    expect(screen.getByText('Harder to scale horizontally')).toBeInTheDocument();

    // Assert that the radar chart container is present
    expect(screen.getByTestId('radar-chart-container')).toBeInTheDocument();
  });

  it('clicking the same option again deselects it', async () => {
    const user = userEvent.setup();
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);

    const postgresCard = screen.getByText('PostgreSQL').closest('[role="button"]');
    expect(postgresCard).not.toBeNull();

    // First click — selects
    await user.click(postgresCard!);
    expect(screen.getByText('ACID compliant')).toBeInTheDocument();

    // Second click — deselects
    await user.click(postgresCard!);

    // Assert that the consequence section is hidden
    expect(screen.queryByText('ACID compliant')).not.toBeInTheDocument();
    expect(screen.queryByTestId('radar-chart-container')).not.toBeInTheDocument();
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

    // Assert the warning message is visible
    expect(
      screen.getByText(/At least 2 options are required/i)
    ).toBeInTheDocument();
  });
});
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeOff } from './TradeOff';
import type { TradeOffOption } from '@/curriculum/schema';

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TradeOff Widget', () => {
  it('renders scenario text and all option cards', () => {
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);

    // Assert the scenario text is visible
    expect(screen.getByText(mockScenario)).toBeInTheDocument();

    // Assert all 3 option names are visible
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Cassandra')).toBeInTheDocument();
    expect(screen.getByText('MongoDB')).toBeInTheDocument();
  });

  it('clicking an option reveals the consequence section', async () => {
    const user = userEvent.setup();
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);

    // Click the first option (PostgreSQL)
    const postgresCard = screen.getByText('PostgreSQL').closest('[role="button"]');
    expect(postgresCard).not.toBeNull();
    await user.click(postgresCard!);

    // Assert that the pros/cons section becomes visible
    expect(screen.getByText('ACID compliant')).toBeInTheDocument();
    expect(screen.getByText('Rich querying')).toBeInTheDocument();
    expect(screen.getByText('Harder to scale horizontally')).toBeInTheDocument();

    // Assert that the radar chart container is present
    expect(screen.getByTestId('radar-chart-container')).toBeInTheDocument();
  });

  it('clicking the same option again deselects it', async () => {
    const user = userEvent.setup();
    render(<TradeOff scenario={mockScenario} options={mockOptions} />);

    const postgresCard = screen.getByText('PostgreSQL').closest('[role="button"]');
    expect(postgresCard).not.toBeNull();

    // First click — selects
    await user.click(postgresCard!);
    expect(screen.getByText('ACID compliant')).toBeInTheDocument();

    // Second click — deselects
    await user.click(postgresCard!);

    // Assert that the consequence section is hidden
    expect(screen.queryByText('ACID compliant')).not.toBeInTheDocument();
    expect(screen.queryByTestId('radar-chart-container')).not.toBeInTheDocument();
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

    // Assert the warning message is visible
    expect(
      screen.getByText(/At least 2 options are required/i)
    ).toBeInTheDocument();
  });
});
