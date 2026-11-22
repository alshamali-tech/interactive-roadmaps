/**
 * TradeOff Scenarios — pure, deterministic logic for the TradeOff widget (W3.3)
 *
 * No React, no network. Everything here is regex/parsing/calculation so it can
 * be unit-tested in isolation and always produces the same output for the same
 * input.
 *
 * Metric semantics (from curriculum/schema.ts):
 *   cost        1 = cheap,      10 = expensive   (lower is better)
 *   performance 1 = slow,       10 = fast        (higher is better)
 *   complexity  1 = simple,     10 = complex     (lower is better)
 *   scalability 1 = limited,    10 = scalable    (higher is better)
 */
import type { TradeOffOption } from '@/curriculum/schema';
import type { ChatMessage } from '@/engine/aiService';

// ─── Metrics ─────────────────────────────────────────────────────────────────

export type MetricKey = 'cost' | 'performance' | 'complexity' | 'scalability';
export type Metrics = TradeOffOption['metrics'];

export const METRIC_KEYS: readonly MetricKey[] = [
  'cost',
  'performance',
  'complexity',
  'scalability',
] as const;

export const METRIC_LABELS: Record<MetricKey, string> = {
  cost: 'Cost',
  performance: 'Performance',
  complexity: 'Complexity',
  scalability: 'Scalability',
};

/** true when a LOW score is the desirable outcome */
export const LOWER_IS_BETTER: Record<MetricKey, boolean> = {
  cost: true,
  performance: false,
  complexity: true,
  scalability: false,
};

export function clampScore(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

export type MetricBucket = 'good' | 'mid' | 'poor';

/** Classify a score into good / mid / poor, respecting metric direction. */
export function getMetricBucket(metric: MetricKey, score: number): MetricBucket {
  const s = clampScore(score);
  if (LOWER_IS_BETTER[metric]) {
    return s <= 3 ? 'good' : s <= 6 ? 'mid' : 'poor';
  }
  return s >= 7 ? 'good' : s >= 4 ? 'mid' : 'poor';
}

// ─── "What if" scenarios ─────────────────────────────────────────────────────

export interface WhatIfScenario {
  id: string;
  label: string;
  hint: string;
  /** Deterministically transform metrics to model the new condition. */
  adjust: (m: Metrics) => Metrics;
}

export const WHAT_IF_SCENARIOS: readonly WhatIfScenario[] = [
  {
    id: 'traffic-10x',
    label: "What if traffic 10x'd?",
    hint: 'Load spikes consume performance and scalability headroom, and inflate the bill.',
    adjust: (m) => ({
      cost: clampScore(m.cost + 2),
      performance: clampScore(m.performance - 3),
      complexity: clampScore(m.complexity + 1),
      scalability: clampScore(m.scalability - 3),
    }),
  },
  {
    id: 'budget-half',
    label: 'What if budget was cut in half?',
    hint: 'With half the budget, every dollar hurts twice as much.',
    adjust: (m) => ({ ...m, cost: clampScore(m.cost + 3) }),
  },
  {
    id: 'team-two',
    label: 'What if the team was only 2 people?',
    hint: 'Operational complexity is paid in human hours — a tiny team feels it 3x.',
    adjust: (m) => ({ ...m, complexity: clampScore(m.complexity + 3) }),
  },
] as const;

/** Apply a what-if scenario (or return a copy of the baseline when null). */
export function applyWhatIf(metrics: Metrics, scenarioId: string | null): Metrics {
  const scenario = WHAT_IF_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) return { ...metrics };
  return scenario.adjust({ ...metrics });
}

// ─── Consequence cards ───────────────────────────────────────────────────────

export interface Consequence {
  /** Concrete, numbers-driven scenario sentence */
  scenario: string;
  /** Real-world example or analogy */
  example: string;
}

type ConsequenceTable = Record<
  MetricKey,
  Record<MetricBucket, { scenario: (name: string) => string; example: string }>
>;

const CONSEQUENCES: ConsequenceTable = {
  performance: {
    good: {
      scenario: (n) =>
        `At 10,000 requests/second, ${n} keeps p95 latency around 50ms — users never notice a wait.`,
      example: 'Like Redis serving cached sessions — answers arrive before the spinner appears.',
    },
    mid: {
      scenario: (n) =>
        `At 10,000 requests/second, ${n} hovers near 200ms p95 — fine for dashboards, but you will add caching before checkout traffic.`,
      example: 'Like a well-indexed Postgres under moderate load: solid, until the hot path grows.',
    },
    poor: {
      scenario: (n) =>
        `At 10,000 requests/second, ${n} starts queueing requests: p95 climbs past 2 seconds and timeouts appear at peak hours.`,
      example: 'Like an unindexed table scan on every request — fast in demos, slow in production.',
    },
  },
  scalability: {
    good: {
      scenario: (n) =>
        `When traffic grows 10x overnight, ${n} absorbs it by adding nodes — no re-architecture, no 3 a.m. migration.`,
      example: 'Like Cassandra rings: add a node and capacity grows almost linearly.',
    },
    mid: {
      scenario: (n) =>
        `When traffic grows 10x, ${n} can grow with it — but each doubling needs a planning sprint and careful resharding.`,
      example: 'Like read replicas: effective, but every step is a project, not a config change.',
    },
    poor: {
      scenario: (n) =>
        `When traffic grows 10x, ${n} hits a hard ceiling — growth means a painful rewrite or ever-bigger machines.`,
      example: 'Like a single-writer database: scale-up or bust.',
    },
  },
  cost: {
    good: {
      scenario: (n) =>
        `Running ${n} for a year fits a startup budget — roughly the cost of one engineer-week, not one engineer-year.`,
      example: 'Like SQLite or a small VPS: nearly free to run.',
    },
    mid: {
      scenario: (n) =>
        `Running ${n} is manageable but visible — expect the bill to become a line item your manager asks about each quarter.`,
      example: 'Like a mid-tier managed database instance: reasonable, but never invisible.',
    },
    poor: {
      scenario: (n) =>
        `At scale, running ${n} rivals an engineer's salary — finance will ask you to justify every node.`,
      example: 'Like a multi-region provisioned-capacity cluster: powerful, and priced that way.',
    },
  },
  complexity: {
    good: {
      scenario: (n) =>
        `A team of two can run ${n} in production — onboarding takes days, and most incidents are fixable straight from the runbook.`,
      example: 'Like a managed service with sane defaults: boring, in the best way.',
    },
    mid: {
      scenario: (n) =>
        `Running ${n} needs one dedicated owner who knows its quirks — expect a ramp-up of a few weeks before the team is comfortable.`,
      example: 'Like Kubernetes-lite: fine once someone climbs the learning curve.',
    },
    poor: {
      scenario: (n) =>
        `Running ${n} requires specialists — a 2 a.m. misconfiguration can turn a small incident into an all-hands outage.`,
      example: 'Like hand-rolled consensus: expert-level failure modes when it breaks.',
    },
  },
};

/** Concrete scenario + real-world example for one metric of one option. */
export function getConsequence(
  metric: MetricKey,
  score: number,
  optionName: string
): Consequence {
  const bucket = getMetricBucket(metric, score);
  const entry = CONSEQUENCES[metric][bucket];
  return { scenario: entry.scenario(optionName), example: entry.example };
}

// ─── Justification ───────────────────────────────────────────────────────────

export const MIN_JUSTIFICATION_SENTENCES = 2;

/**
 * Count sentences: split on . ! ? and count non-empty segments with >= 3 words.
 * "It is cheap. It is fast." → 2. "cheap and fast" → 0 (no terminator needed,
 * but a bare fragment under 3 words never counts).
 */
export function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 3).length;
}

export function isJustificationValid(text: string): boolean {
  return countSentences(text) >= MIN_JUSTIFICATION_SENTENCES;
}

export interface JustificationFeedback {
  quality: 'strong' | 'adequate' | 'weak';
  comment: string;
}

/**
 * Parse the AI's JSON feedback. Accepts a ```json fenced block or a bare
 * {...} object. Returns null on malformed JSON or unexpected shape.
 */
export function parseJustificationFeedback(raw: string): JustificationFeedback | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    const obj = JSON.parse(candidate.trim()) as Record<string, unknown>;
    const q = obj.quality;
    const c = obj.comment;
    if (
      (q === 'strong' || q === 'adequate' || q === 'weak') &&
      typeof c === 'string' &&
      c.trim() !== ''
    ) {
      return { quality: q, comment: c.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

/** Deterministic offline feedback used when no AI provider is connected. */
export function offlineJustificationFeedback(
  justification: string,
  option: TradeOffOption
): JustificationFeedback {
  const words = justification.trim().split(/\s+/).filter(Boolean).length;
  const mentionsTradeOff =
    /\b(because|trade-?off|however|although|whereas|instead|risk|scale|cost|latency|complex)/i.test(
      justification
    );
  if (words >= 40 && mentionsTradeOff) {
    return {
      quality: 'strong',
      comment: `Solid reasoning — you weighed concrete factors for ${option.name}. To go further, quantify one claim (e.g., expected request rate or budget).`,
    };
  }
  if (words >= 20) {
    return {
      quality: 'adequate',
      comment: `Reasonable start. Strengthen it by naming one concrete weakness of ${option.name} and explaining why it is acceptable here.`,
    };
  }
  return {
    quality: 'weak',
    comment: `Your justification is brief. Compare ${option.name} against one rejected option and explain the deciding factor.`,
  };
}

/** Messages asking the AI to grade the student's justification. */
export function buildJustificationMessages(
  scenario: string,
  option: TradeOffOption,
  justification: string
): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are an engineering mentor evaluating a student\'s trade-off justification. ' +
        'Judge whether they weighed alternatives, named concrete constraints, and acknowledged weaknesses. ' +
        'Be constructive; never rewrite their answer for them. ' +
        'Respond ONLY with a JSON code block in this exact shape:\n' +
        '```json\n{"quality": "strong" | "adequate" | "weak", "comment": "1-3 sentences of specific feedback"}\n```',
    },
    {
      role: 'user',
      content:
        `Scenario: ${scenario}\n` +
        `Chosen option: ${option.name} — ${option.description}\n` +
        `Known pros: ${option.pros.join('; ') || 'n/a'}\n` +
        `Known cons: ${option.cons.join('; ') || 'n/a'}\n\n` +
        `Student justification:\n${justification}`,
    },
  ];
}

// ─── "Change My Mind" counter-argument ───────────────────────────────────────

/** Overall "goodness": strengths minus burdens. Used only for ranking. */
export function optionGoodness(o: TradeOffOption): number {
  const m = o.metrics;
  return m.performance + m.scalability - m.cost - m.complexity;
}

/**
 * Pick the strongest alternative to argue for. Deterministic: highest
 * goodness wins; ties resolve to the first option in array order.
 */
export function pickCounterOption(
  options: TradeOffOption[],
  selectedId: string
): TradeOffOption | null {
  let best: TradeOffOption | null = null;
  let bestScore = -Infinity;
  for (const o of options) {
    if (o.id === selectedId) continue;
    const g = optionGoodness(o);
    if (g > bestScore) {
      best = o;
      bestScore = g;
    }
  }
  return best;
}

/** Messages asking the AI to argue for the alternative option. */
export function buildCounterArgumentMessages(
  scenario: string,
  selected: TradeOffOption,
  alternative: TradeOffOption
): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        "You are a senior engineer playing devil's advocate in a design review. " +
        'Argue for the alternative option in 3-5 sentences of plain text (no JSON, no markdown headings). ' +
        'Reference the scenario, one concrete weakness of the current choice, and one concrete strength ' +
        "of the alternative. End by inviting the student to reconsider — but respect their final decision.",
    },
    {
      role: 'user',
      content:
        `Scenario: ${scenario}\n` +
        `Current choice: ${selected.name} (cons: ${selected.cons.join('; ') || 'n/a'})\n` +
        `Alternative to argue for: ${alternative.name} (pros: ${alternative.pros.join('; ') || 'n/a'})`,
    },
  ];
}

/** Deterministic offline counter-argument (no AI connected). */
export function offlineCounterArgument(
  selected: TradeOffOption,
  alternative: TradeOffOption
): string {
  const strengths = alternative.pros.slice(0, 2).join(' and ') || 'it covers the basics well';
  const weakness = selected.cons[0] ?? 'it is not free of trade-offs';
  return (
    `Consider ${alternative.name} instead: ${strengths}. ` +
    `Your current pick, ${selected.name}, has a real cost — ${weakness}. ` +
    `If that weakness matters more than you assumed in this scenario, ${alternative.name} deserves a second look.`
  );
}
