import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import type { TradeOffProps } from '@/curriculum/schema';

// ─── Colour Palette for Radar Overlay ────────────────────────────────────────

const CHART_COLORS = [
  '#3b82f6', // blue (selected)
  '#8b5cf6', // violet
  '#f97316', // orange
  '#10b981', // emerald
  '#ef4444', // red
];

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * TradeOff Widget — a decision matrix that teaches engineering trade-offs.
 *
 * The user is presented with a real-world scenario (e.g., "Choose a database
 * for 100k writes/sec") and a set of clickable option cards. Upon selecting
 * an option the consequence section reveals:
 *   - A comparison table with pros (green ✓) and cons (red ✗)
 *   - A recharts RadarChart overlaying all options (≤3) or just the selected one
 *   - An optional explanation text
 *
 * Clicking the same option again toggles it off and hides the consequence
 * section. The component gracefully handles edge cases (< 2 options → warning,
 * > 5 options → truncated to 5).
 */
export function TradeOff({
  scenario,
  options: rawOptions,
  explanation,
}: TradeOffProps) {
  // ── Edge-case: fewer than 2 options ────────────────────────────────────
  if (rawOptions.length < 2) {
    return (
      <div className="my-5 rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 p-4 text-sm text-yellow-800 dark:text-yellow-300">
        ⚠️ <strong>TradeOff widget:</strong> At least 2 options are required.
      </div>
    );
  }

  // ── Edge-case: truncate to 5 ──────────────────────────────────────────
  const options = rawOptions.slice(0, 5);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedOptionId((prev) => (prev === id ? null : id));
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect(id);
      }
    },
    [handleSelect]
  );

  const selectedOption = options.find((o) => o.id === selectedOptionId);
  const showConsequence = selectedOption !== undefined;

  // ── Radar chart data preparation ──────────────────────────────────────
  // When 3 or fewer options, overlay all of them. Otherwise just show selected.
  const shouldOverlayAll = options.length <= 3;

  const radarData = [
    { metric: 'Cost', key: 'cost' },
    { metric: 'Performance', key: 'performance' },
    { metric: 'Complexity', key: 'complexity' },
    { metric: 'Scalability', key: 'scalability' },
  ].map((entry) => {
    const point: Record<string, string | number> = { metric: entry.metric };
    if (shouldOverlayAll) {
      for (const opt of options) {
        point[opt.name] = opt.metrics[entry.key as keyof typeof opt.metrics];
      }
    } else if (selectedOption) {
      point[selectedOption.name] =
        selectedOption.metrics[entry.key as keyof typeof selectedOption.metrics];
    }
    return point;
  });

  return (
    <div className="my-5 space-y-5">
      {/* ─── Section A: Scenario Header ─────────────────────────────── */}
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-foreground">{scenario}</h3>
        <p className="text-sm text-muted-foreground">
          Select an option to see the trade-offs.
        </p>
      </div>

      {/* ─── Section B: Option Cards Grid ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {options.map((option, index) => {
          const isSelected = selectedOptionId === option.id;
          return (
            <div
              key={option.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => handleSelect(option.id)}
              onKeyDown={(e) => handleKeyDown(e, option.id)}
              className={cn(
                'rounded-lg p-4 cursor-pointer transition-all duration-200 select-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                isSelected
                  ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-md'
                  : 'border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:shadow-sm bg-card'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex items-center justify-center size-8 rounded-full shrink-0 text-sm font-bold transition-colors',
                    isSelected
                      ? 'bg-blue-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {String.fromCharCode(65 + index)}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="font-semibold text-foreground leading-tight">
                    {option.name}
                  </div>
                  <div className="text-xs text-muted-foreground leading-snug">
                    {option.description}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Section C: Consequence Reveal ─────────────────────────── */}
      <AnimatePresence mode="wait">
        {showConsequence && selectedOption && (
          <motion.div
            key="consequence"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* ── Sub-component 1: Comparison Table ──────────────────── */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/50">
                <h4 className="text-sm font-semibold text-foreground">
                  {selectedOption.name} — Pros &amp; Cons
                </h4>
              </div>
              <div className="p-4 space-y-3">
                {/* Pros */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
                    Pros
                  </div>
                  {selectedOption.pros.map((pro, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm text-green-700 dark:text-green-300"
                    >
                      <span className="shrink-0 mt-0.5">✓</span>
                      <span>{pro}</span>
                    </div>
                  ))}
                </div>
                {/* Cons */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Cons
                  </div>
                  {selectedOption.cons.map((con, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300"
                    >
                      <span className="shrink-0 mt-0.5">✗</span>
                      <span>{con}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Metrics comparison table */}
              <div className="border-t border-border">
                <div className="px-4 py-2 bg-muted/30">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Metrics Comparison (1–10)
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">
                          Metric
                        </th>
                        {options.map((opt) => (
                          <th
                            key={opt.id}
                            className={cn(
                              'text-center px-3 py-2 text-xs font-semibold',
                              opt.id === selectedOption.id
                                ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                                : 'text-muted-foreground'
                            )}
                          >
                            {opt.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ['Cost', 'cost'],
                          ['Performance', 'performance'],
                          ['Complexity', 'complexity'],
                          ['Scalability', 'scalability'],
                        ] as const
                      ).map(([label, key]) => (
                        <tr key={key} className="border-b border-border/50">
                          <td className="px-4 py-1.5 text-xs text-muted-foreground">
                            {label}
                          </td>
                          {options.map((opt) => (
                            <td
                              key={opt.id}
                              className={cn(
                                'text-center px-3 py-1.5 text-xs font-medium',
                                opt.id === selectedOption.id
                                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/10'
                                  : 'text-foreground'
                              )}
                            >
                              {opt.metrics[key]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── Sub-component 2: Radar Chart ───────────────────────── */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/50">
                <h4 className="text-sm font-semibold text-foreground">
                  Visual Comparison
                </h4>
              </div>
              <div className="p-4" data-testid="radar-chart-container">
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="var(--color-border, #e2e8f0)" />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: 'var(--color-muted-foreground, #64748b)', fontSize: 12 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 10]}
                      tick={{ fill: 'var(--color-muted-foreground, #94a3b8)', fontSize: 10 }}
                    />
                    {shouldOverlayAll ? (
                      options.map((opt, idx) => (
                        <Radar
                          key={opt.id}
                          name={opt.name}
                          dataKey={opt.name}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                          fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          fillOpacity={opt.id === selectedOptionId ? 0.35 : 0.1}
                          strokeWidth={opt.id === selectedOptionId ? 2.5 : 1.5}
                        />
                      ))
                    ) : (
                      <Radar
                        name={selectedOption.name}
                        dataKey={selectedOption.name}
                        stroke={CHART_COLORS[0]}
                        fill={CHART_COLORS[0]}
                        fillOpacity={0.3}
                        strokeWidth={2}
                      />
                    )}
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-card, #ffffff)',
                        border: '1px solid var(--color-border, #e2e8f0)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Section D: Explanation Text ───────────────────────────── */}
      <AnimatePresence>
        {showConsequence && explanation && (
          <motion.div
            key="explanation"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, delay: 0.15 }}
            className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-foreground"
          >
            <span className="font-semibold">💡 Explanation: </span>
            {explanation}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}