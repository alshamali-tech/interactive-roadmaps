import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Coins,
  Gauge,
  Layers,
  Network,
  Lightbulb,
  HelpCircle,
  ArrowRightLeft,
  Loader2,
  MessageSquare,
  Send,
  Check,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { TradeOffProps } from '@/curriculum/schema';
import { generateChatCompletion } from '@/engine/aiService';
import { useSettingsStore } from '@/engine/settings';
import {
  METRIC_KEYS,
  METRIC_LABELS,
  WHAT_IF_SCENARIOS,
  applyWhatIf,
  getConsequence,
  getMetricBucket,
  countSentences,
  isJustificationValid,
  MIN_JUSTIFICATION_SENTENCES,
  buildJustificationMessages,
  parseJustificationFeedback,
  offlineJustificationFeedback,
  pickCounterOption,
  buildCounterArgumentMessages,
  offlineCounterArgument,
  type MetricKey,
  type JustificationFeedback,
  type MetricBucket,
} from '@/lib/tradeOffScenarios';

// ─── Visual maps ─────────────────────────────────────────────────────────────

const METRIC_ICONS: Record<MetricKey, LucideIcon> = {
  cost: Coins,
  performance: Gauge,
  complexity: Layers,
  scalability: Network,
};

const BUCKET_BAR: Record<MetricBucket, string> = {
  good: 'bg-green-500',
  mid: 'bg-amber-500',
  poor: 'bg-red-500',
};

const BUCKET_TEXT: Record<MetricBucket, string> = {
  good: 'text-green-700 dark:text-green-300',
  mid: 'text-amber-700 dark:text-amber-300',
  poor: 'text-red-700 dark:text-red-300',
};

const QUALITY_BADGE: Record<JustificationFeedback['quality'], string> = {
  strong: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  adequate: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  weak: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * TradeOff Widget (W3.3) — scenario-based decision matrix.
 *
 * Selecting an option reveals four animated "Consequence Cards" (one per
 * metric) with concrete scenarios and real-world analogies — no radar chart.
 * Optional `requireJustification` gates the consequences behind a written
 * justification (≥ 2 sentences) that the AI grades when connected.
 * "What if" buttons re-compute the cards under stress conditions, a full
 * comparison table highlights the selected column, and "Change My Mind"
 * asks the AI (or an offline fallback) to argue for the strongest alternative.
 */
export function TradeOff({
  scenario,
  options: rawOptions,
  explanation,
  requireJustification = false,
}: TradeOffProps) {
  const options = rawOptions.slice(0, 5);

  const aiSettings = useSettingsStore((s) => s.aiSettings);
  const isAIConnected = useSettingsStore((s) => s.isAIConnected);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [justificationSubmitted, setJustificationSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<JustificationFeedback | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [activeWhatIf, setActiveWhatIf] = useState<string | null>(null);
  const [counter, setCounter] = useState<{ optionId: string; text: string } | null>(null);
  const [counterLoading, setCounterLoading] = useState(false);

  /** Select a (different) option and reset all downstream state. */
  const selectOption = useCallback((id: string) => {
    setSelectedOptionId(id);
    setJustification('');
    setJustificationSubmitted(false);
    setFeedback(null);
    setFeedbackLoading(false);
    setActiveWhatIf(null);
    setCounter(null);
    setCounterLoading(false);
  }, []);

  /** Clicking the same option again toggles it off. */
  const handleSelect = useCallback(
    (id: string) => {
      if (selectedOptionId === id) {
        setSelectedOptionId(null);
        setJustification('');
        setJustificationSubmitted(false);
        setFeedback(null);
        setActiveWhatIf(null);
        setCounter(null);
      } else {
        selectOption(id);
      }
    },
    [selectedOptionId, selectOption]
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
  const sentenceCount = countSentences(justification);
  const justificationOk = isJustificationValid(justification);
  const showConsequences =
    selectedOption !== undefined && (!requireJustification || justificationSubmitted);

  const handleSubmitJustification = useCallback(async () => {
    if (!selectedOption || !isJustificationValid(justification)) return;
    const option = selectedOption;
    setJustificationSubmitted(true);
    if (isAIConnected) {
      setFeedbackLoading(true);
      try {
        const raw = await generateChatCompletion(
          buildJustificationMessages(scenario, option, justification),
          aiSettings
        );
        setFeedback(parseJustificationFeedback(raw) ?? offlineJustificationFeedback(justification, option));
      } catch {
        setFeedback(offlineJustificationFeedback(justification, option));
      } finally {
        setFeedbackLoading(false);
      }
    } else {
      setFeedback(offlineJustificationFeedback(justification, option));
    }
  }, [selectedOption, justification, isAIConnected, aiSettings, scenario]);

  const handleWhatIf = useCallback((id: string) => {
    setActiveWhatIf((prev) => (prev === id ? null : id));
  }, []);

  const handleChangeMyMind = useCallback(async () => {
    if (!selectedOption) return;
    const alternative = pickCounterOption(options, selectedOption.id);
    if (!alternative) return;
    if (isAIConnected) {
      setCounterLoading(true);
      try {
        const raw = await generateChatCompletion(
          buildCounterArgumentMessages(scenario, selectedOption, alternative),
          aiSettings
        );
        setCounter({ optionId: alternative.id, text: raw.trim() || offlineCounterArgument(selectedOption, alternative) });
      } catch {
        setCounter({ optionId: alternative.id, text: offlineCounterArgument(selectedOption, alternative) });
      } finally {
        setCounterLoading(false);
      }
    } else {
      setCounter({ optionId: alternative.id, text: offlineCounterArgument(selectedOption, alternative) });
    }
  }, [selectedOption, options, isAIConnected, aiSettings, scenario]);

  // ── Edge-case: fewer than 2 options ────────────────────────────────────
  if (rawOptions.length < 2) {
    return (
      <div className="my-5 rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 p-4 text-sm text-yellow-800 dark:text-yellow-300">
        ⚠️ <strong>TradeOff widget:</strong> At least 2 options are required.
      </div>
    );
  }

  const effectiveMetrics = selectedOption
    ? applyWhatIf(selectedOption.metrics, activeWhatIf)
    : null;
  const counterOption = counter ? options.find((o) => o.id === counter.optionId) : null;
  const activeScenario = WHAT_IF_SCENARIOS.find((s) => s.id === activeWhatIf);

  return (
    <div className="my-5 space-y-5">
      <style>{`
        @keyframes tradeoff-card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .tradeoff-anim { animation: none !important; } }
      `}</style>

      {/* ─── Section A: Scenario Header ─────────────────────────────── */}
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-foreground">{scenario}</h3>
        <p className="text-sm text-muted-foreground">
          Select an option to see the trade-offs.
        </p>
      </div>

      {/* ─── Section B: Option Cards (stack vertically on mobile) ───── */}
      <div data-testid="options-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    isSelected ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {String.fromCharCode(65 + index)}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="font-semibold text-foreground leading-tight">{option.name}</div>
                  <div className="text-xs text-muted-foreground leading-snug">{option.description}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Section C: Justification gate ──────────────────────────── */}
      {selectedOption && requireJustification && !justificationSubmitted && (
        <div
          data-testid="justification-panel"
          className="rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-2"
        >
          <label htmlFor="tradeoff-justification" className="block text-sm font-semibold text-foreground">
            Why did you choose {selectedOption.name}?
          </label>
          <textarea
            id="tradeoff-justification"
            aria-label="Justification input"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
            placeholder="Explain your reasoning — weigh at least one alternative and one concrete constraint..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
          />
          <div className="flex items-center justify-between gap-2">
            <span data-testid="sentence-count" className="text-xs text-muted-foreground">
              {sentenceCount}/{MIN_JUSTIFICATION_SENTENCES} sentences (minimum {MIN_JUSTIFICATION_SENTENCES})
            </span>
            <button
              type="button"
              onClick={handleSubmitJustification}
              disabled={!justificationOk}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              Submit Justification
              <Send className="size-3" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Section D: Justification feedback ──────────────────────── */}
      {justificationSubmitted && (feedbackLoading || feedback) && (
        <div
          data-testid="justification-feedback"
          className="rounded-lg border border-border bg-card p-4 space-y-2"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquare className="size-4 text-blue-500" />
            Feedback on your reasoning
            {feedback && (
              <span className={cn('ml-auto text-xs font-bold px-2 py-0.5 rounded-full capitalize', QUALITY_BADGE[feedback.quality])}>
                {feedback.quality}
              </span>
            )}
          </div>
          {feedbackLoading ? (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Evaluating your justification…
            </span>
          ) : (
            feedback && <p className="text-sm text-foreground leading-relaxed">{feedback.comment}</p>
          )}
        </div>
      )}

      {/* ─── Section E: Consequence Cards ───────────────────────────── */}
      {showConsequences && selectedOption && effectiveMetrics && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-foreground">
              Consequences of choosing {selectedOption.name}
              {activeScenario && (
                <span className="ml-2 text-xs font-medium text-purple-600 dark:text-purple-400">
                  — {activeScenario.label}
                </span>
              )}
            </h4>
          </div>
          <div data-testid="consequence-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {METRIC_KEYS.map((key, i) => {
              const score = effectiveMetrics[key];
              const bucket = getMetricBucket(key, score);
              const consequence = getConsequence(key, score, selectedOption.name);
              const Icon = METRIC_ICONS[key];
              return (
                <div
                  key={`${selectedOption.id}-${activeWhatIf ?? 'base'}-${key}`}
                  data-testid="consequence-card"
                  className="tradeoff-anim rounded-lg border border-border bg-card p-4 space-y-2 shadow-sm"
                  style={{ animation: 'tradeoff-card-in 0.4s ease-out both', animationDelay: `${i * 120}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-blue-500 shrink-0" />
                    <span className="text-sm font-semibold text-foreground">{METRIC_LABELS[key]}</span>
                    <span data-testid={`score-${key}`} className={cn('ml-auto text-sm font-mono font-bold', BUCKET_TEXT[bucket])}>
                      {score}/10
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', BUCKET_BAR[bucket])}
                      style={{ width: `${score * 10}%` }}
                    />
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{consequence.scenario}</p>
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground leading-snug">
                    <Lightbulb className="size-3 shrink-0 mt-0.5 text-amber-500" />
                    {consequence.example}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Section F: What-if scenarios ───────────────────────────── */}
      {showConsequences && (
        <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HelpCircle className="size-4 text-purple-500" />
            What if…
          </div>
          <div className="flex flex-wrap gap-2">
            {WHAT_IF_SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid={`what-if-${s.id}`}
                aria-pressed={activeWhatIf === s.id}
                title={s.hint}
                onClick={() => handleWhatIf(s.id)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-full border transition-colors',
                  activeWhatIf === s.id
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40'
                )}
              >
                {s.label}
              </button>
            ))}
            {activeWhatIf && (
              <button
                type="button"
                onClick={() => setActiveWhatIf(null)}
                className="px-3 py-1.5 text-xs rounded-full border border-slate-300 dark:border-slate-600 text-muted-foreground hover:bg-muted transition-colors"
              >
                Baseline
              </button>
            )}
          </div>
          {activeScenario && (
            <p className="text-xs text-muted-foreground">{activeScenario.hint}</p>
          )}
        </div>
      )}

      {/* ─── Section G: Change My Mind ──────────────────────────────── */}
      {showConsequences && (
        <div className="space-y-3">
          <button
            type="button"
            aria-label="Change My Mind"
            onClick={handleChangeMyMind}
            disabled={counterLoading}
            className="px-4 py-2 rounded-lg border-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors inline-flex items-center gap-2 disabled:opacity-50"
          >
            {counterLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
            {counterLoading ? 'Thinking…' : 'Change My Mind'}
          </button>

          {counter && counterOption && (
            <div
              data-testid="counter-argument"
              className="rounded-lg border-2 border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-foreground">
                Devil&apos;s advocate: the case for {counterOption.name}
              </div>
              <p className="text-sm text-foreground leading-relaxed">{counter.text}</p>
              <button
                type="button"
                onClick={() => selectOption(counterOption.id)}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <ArrowRightLeft className="size-3" />
                Switch to {counterOption.name}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Section H: Full comparison table (all options) ─────────── */}
      {showConsequences && selectedOption && (
        <div data-testid="comparison-table-wrapper" className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">
                  Metric
                </th>
                {options.map((opt) => {
                  const isSelected = opt.id === selectedOption.id;
                  return (
                    <th
                      key={opt.id}
                      data-selected={isSelected}
                      className={cn(
                        'text-center px-3 py-2 text-xs font-semibold',
                        isSelected
                          ? 'text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/30'
                          : 'text-muted-foreground'
                      )}
                    >
                      {opt.name}
                      {isSelected && <span className="block text-[0.6rem] font-normal">(selected)</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {METRIC_KEYS.map((key) => (
                <tr key={key} className="border-b border-border/50">
                  <td className="px-4 py-1.5 text-xs text-muted-foreground">{METRIC_LABELS[key]}</td>
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
              <tr className="border-b border-border/50 align-top">
                <td className="px-4 py-2 text-xs font-semibold text-green-600 dark:text-green-400">Pros</td>
                {options.map((opt) => (
                  <td key={opt.id} className={cn('px-3 py-2', opt.id === selectedOption.id && 'bg-blue-50/30 dark:bg-blue-950/10')}>
                    <ul className="space-y-1 text-left">
                      {opt.pros.map((pro, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-green-700 dark:text-green-300">
                          <Check className="size-3 shrink-0 mt-0.5" />
                          {pro}
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
              <tr className="align-top">
                <td className="px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400">Cons</td>
                {options.map((opt) => (
                  <td key={opt.id} className={cn('px-3 py-2', opt.id === selectedOption.id && 'bg-blue-50/30 dark:bg-blue-950/10')}>
                    <ul className="space-y-1 text-left">
                      {opt.cons.map((con, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-red-700 dark:text-red-300">
                          <X className="size-3 shrink-0 mt-0.5" />
                          {con}
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Section I: Explanation ─────────────────────────────────── */}
      {showConsequences && explanation && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-foreground">
          <span className="font-semibold">💡 Explanation: </span>
          {explanation}
        </div>
      )}
    </div>
  );
}
