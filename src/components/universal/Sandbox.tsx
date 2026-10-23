import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { SandboxProps } from '@/curriculum/schema';
import { Play, Code2, FileText, Monitor, AlertTriangle, Zap } from 'lucide-react';

/**
 * Sandbox — the universal Input → Process → Output primitive.
 *
 * A split-screen widget where the user types in the input pane and sees the
 * transformed result in the output pane in real-time.
 *
 * - `inputType: 'text'`  → plain textarea with proportional font
 * - `inputType: 'code'`  → monospace dark-themed code editor
 * - `outputType: 'text'` → read-only pre-formatted output
 * - `outputType: 'html'` → rendered sandboxed iframe (srcDoc)
 *
 * The optional `processFunction` is a string of JavaScript that must define a
 * function `process(input)` returning the output value. If omitted, the sandbox
 * runs in "echo" mode (output mirrors input verbatim).
 *
 * The process function is re-evaluated on every input change, debounced at
 * 300ms to avoid thrashing on expensive transformations.
 */
export function Sandbox({
  inputType,
  outputType,
  initialState,
  processFunction,
  label = 'Sandbox',
  placeholder = 'Type here...',
}: SandboxProps) {
  const [input, setInput] = useState(initialState);
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-compute output whenever input or processFunction changes (debounced).
  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setIsProcessing(true);

      if (!processFunction) {
        // Echo mode — output mirrors input verbatim.
        setOutput(input);
        setError(null);
        setIsProcessing(false);
        return;
      }

      try {
        // Build a safe executor. The user-supplied string must define a function
        // called `process(input)` that returns the transformed output.
        // eslint-disable-next-line no-new-func
        const executor = new Function(
          'input',
          `
          "use strict";
          ${processFunction}
          if (typeof process !== "function") {
            throw new Error("Your code must define a function called process(input)");
          }
          return process(input);
          `
        );

        const result = executor(input);
        setOutput(result == null ? '' : String(result));
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setOutput('');
      } finally {
        setIsProcessing(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [input, processFunction]);

  // Reset to initial state
  const handleReset = () => {
    setInput(initialState);
  };

  const InputIcon = inputType === 'code' ? Code2 : FileText;
  const OutputIcon = outputType === 'html' ? Monitor : FileText;

  return (
    <div className="my-5 rounded-lg border border-border overflow-hidden bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
        <Zap className="size-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <InputIcon className="size-3" />
            <span className="capitalize">{inputType}</span>
          </span>
          <Play className="size-3 text-primary" />
          <span className="inline-flex items-center gap-1">
            <OutputIcon className="size-3" />
            <span className="capitalize">{outputType}</span>
          </span>
          {isProcessing && (
            <span className="inline-block size-1.5 rounded-full bg-primary/80 animate-pulse" />
          )}
        </div>
      </div>

      {/* Split panes — side-by-side on md+, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* ─── Input pane ─── */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/20 border-b border-border">
            <span>Input</span>
            <button
              onClick={handleReset}
              className="text-[0.65rem] font-medium normal-case tracking-normal text-primary/70 hover:text-primary transition-colors"
              type="button"
            >
              Reset
            </button>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            spellCheck={inputType !== 'code'}
            className={cn(
              'flex-1 min-h-[220px] w-full p-4 text-sm resize-y',
              'focus:outline-none focus:ring-1 focus:ring-primary/30',
              'border-0',
              inputType === 'code'
                ? 'bg-[#1e1e2e] text-[#cdd6f4] font-mono leading-relaxed selection:bg-primary/30'
                : 'bg-background text-foreground leading-relaxed'
            )}
            style={inputType === 'code' ? { tabSize: 2 } : undefined}
          />
        </div>

        {/* ─── Output pane ─── */}
        <div className="flex flex-col">
          <div className="px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/20 border-b border-border">
            Output
          </div>

          {error ? (
            <div className="flex-1 min-h-[220px] p-4 bg-red-50/50 dark:bg-red-950/20 overflow-auto">
              <div className="flex items-start gap-2 text-sm font-mono text-red-700 dark:text-red-400">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <pre className="whitespace-pre-wrap break-words">{error}</pre>
              </div>
            </div>
          ) : outputType === 'html' ? (
            <iframe
              srcDoc={`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: system-ui, -apple-system, sans-serif;
    margin: 0;
    padding: 16px;
    color: #111;
    line-height: 1.6;
  }
  h1, h2, h3 { margin-top: 0; }
  img { max-width: 100%; }
</style>
</head>
<body>${output}</body>
</html>`}
              className="flex-1 min-h-[220px] w-full bg-white"
              sandbox="allow-scripts"
              title={`${label} output`}
            />
          ) : (
            <pre
              className={cn(
                'flex-1 min-h-[220px] w-full p-4 text-sm overflow-auto m-0',
                'whitespace-pre-wrap break-words',
                inputType === 'code'
                  ? 'bg-[#181825] text-green-300 font-mono leading-relaxed'
                  : 'bg-muted/10 text-foreground font-mono leading-relaxed'
              )}
            >
              {output || (
                <span className="text-muted-foreground italic">
                  Output will appear here...
                </span>
              )}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
