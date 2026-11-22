import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuizProps } from '@/curriculum/schema';
import {
  HelpCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';

/**
 * Interactive quiz widget — allows users to select an answer, check it,
 * and see an explanation after answering.
 */
export function QuizWidget({ question, options, explanation }: QuizProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const selectedOption = options.find((o) => o.id === selectedId);
  const correctOption = options.find((o) => o.isCorrect);
  const isCorrect = selectedOption?.isCorrect ?? false;

  const handleSubmit = useCallback(() => {
    if (selectedId) setSubmitted(true);
  }, [selectedId]);

  const handleReset = useCallback(() => {
    setSelectedId(null);
    setSubmitted(false);
  }, []);

  return (
    <div className="my-5 rounded-lg border border-border overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 bg-blue-50/80 dark:bg-blue-950/30 px-4 py-2.5 border-b border-border">
        <HelpCircle className="size-4 text-blue-500" />
        <span className="text-sm font-semibold text-foreground">Quick Quiz</span>
        {submitted && (
          <span
            className={cn(
              'ml-auto text-xs font-medium flex items-center gap-1',
              isCorrect ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {isCorrect ? (
              <>
                <CheckCircle2 className="size-3.5" /> Correct!
              </>
            ) : (
              <>
                <XCircle className="size-3.5" /> Incorrect
              </>
            )}
          </span>
        )}
      </div>

      {/* Question */}
      <div className="p-4">
        <p className="text-sm font-medium text-foreground mb-3 leading-relaxed">
          {question}
        </p>

        {/* Options */}
        <div className="space-y-2">
          {options.map((opt) => {
            const isSelected = selectedId === opt.id;
            const isCorrectOption = opt.isCorrect;

            let optionStyle = 'border-border bg-background hover:bg-muted/50';
            if (submitted) {
              if (isCorrectOption) {
                optionStyle =
                  'border-green-400 bg-green-50/80 dark:bg-green-950/30 dark:border-green-700';
              } else if (isSelected && !isCorrectOption) {
                optionStyle =
                  'border-red-400 bg-red-50/80 dark:bg-red-950/30 dark:border-red-700';
              } else {
                optionStyle = 'border-border bg-background opacity-50';
              }
            } else if (isSelected) {
              optionStyle = 'border-primary bg-primary/5 ring-1 ring-primary/20';
            }

            return (
              <button
                key={opt.id}
                onClick={() => !submitted && setSelectedId(opt.id)}
                disabled={submitted}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-sm text-left transition-all',
                  optionStyle,
                  !submitted && 'cursor-pointer'
                )}
              >
                {/* Radio indicator */}
                <span
                  className={cn(
                    'size-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors',
                    isSelected && !submitted
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/30',
                    submitted && isCorrectOption
                      ? 'border-green-500 bg-green-500'
                      : '',
                    submitted && isSelected && !isCorrectOption
                      ? 'border-red-500 bg-red-500'
                      : ''
                  )}
                >
                  {isSelected && !submitted && (
                    <span className="size-1.5 rounded-full bg-white" />
                  )}
                  {submitted && isCorrectOption && (
                    <CheckCircle2 className="size-3 text-white" />
                  )}
                  {submitted && isSelected && !isCorrectOption && (
                    <XCircle className="size-3 text-white" />
                  )}
                </span>

                {/* Option text */}
                <span
                  className={cn(
                    'text-foreground/90 flex-1',
                    submitted && isCorrectOption && 'font-medium text-green-800 dark:text-green-300',
                    submitted && isSelected && !isCorrectOption && 'text-red-800 dark:text-red-300 line-through'
                  )}
                >
                  {opt.text}
                </span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          {!submitted ? (
            <Button
              onClick={handleSubmit}
              disabled={!selectedId}
              size="sm"
            >
              <CheckCircle2 className="size-3.5" />
              Check Answer
            </Button>
          ) : (
            <>
              <Button onClick={handleReset} variant="outline" size="sm">
                <RotateCcw className="size-3.5" />
                Try Again
              </Button>
              <span
                className={cn(
                  'text-xs font-medium ml-auto',
                  isCorrect
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {isCorrect ? '🎉 Well done!' : `Answer: ${correctOption?.text}`}
              </span>
            </>
          )}
        </div>

        {/* Explanation — shown after submission */}
        {submitted && explanation && (
          <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border text-sm text-foreground/80 flex items-start gap-2">
            <ChevronRight className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Explanation: </span>
              {explanation}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
