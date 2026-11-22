import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CodeEditorProps } from '@/curriculum/schema';
import {
  Code2,
  Play,
  RotateCcw,
  Eye,
  EyeOff,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

/**
 * Interactive code editor widget — lets users edit code, run it in a
 * sandboxed JS environment, see console output, compare against test cases,
 * and reveal the solution.
 */
export function CodeEditorWidget({
  language,
  initialCode,
  solution,
  testCases,
}: CodeEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState<string[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    { passed: boolean; expected: string; actual: string }[] | null
  >(null);
  const [showSolution, setShowSolution] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runCode = useCallback(() => {
    setOutput([]);
    setError(null);
    setTestResults(null);
    setHasRun(true);

    // Only JavaScript can be executed client-side
    if (language !== 'javascript' && language !== 'js') {
      setError(
        `Code execution for "${language}" requires a backend runtime. ` +
          `Only JavaScript can be run in the browser sandbox.`
      );
      return;
    }

    // Capture console.log output
    const logs: string[] = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const capture = (...args: unknown[]) => {
      logs.push(
        args
          .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
          .join(' ')
      );
    };

    console.log = capture;
    console.warn = capture;
    console.error = capture;

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(code);
      fn();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setError(errMsg);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }

    setOutput(logs);

    // Run test cases if provided
    if (testCases && testCases.length > 0) {
      const results = testCases.map((tc) => {
        const actual = logs.join('\n');
        return {
          passed: actual.trim() === tc.expected.trim(),
          expected: tc.expected,
          actual,
        };
      });
      setTestResults(results);
    }
  }, [code, language, testCases]);

  const resetCode = useCallback(() => {
    setCode(initialCode);
    setOutput([]);
    setError(null);
    setTestResults(null);
    setHasRun(false);
    setShowSolution(false);
  }, [initialCode]);

  const applySolution = useCallback(() => {
    if (solution) {
      setCode(solution);
      setShowSolution(true);
    }
  }, [solution]);

  const allTestsPassed =
    testResults !== null && testResults.every((r) => r.passed);

  // Handle tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      // Restore cursor position after state update
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="my-5 rounded-lg border border-border overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
        <Code2 className="size-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Code Editor</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {language}
        </span>
        {testResults && (
          <span
            className={cn(
              'text-xs font-medium flex items-center gap-1',
              allTestsPassed
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {allTestsPassed ? (
              <>
                <CheckCircle2 className="size-3.5" /> All tests passed!
              </>
            ) : (
              <>
                <XCircle className="size-3.5" />
                {testResults.filter((r) => r.passed).length}/
                {testResults.length} tests passed
              </>
            )}
          </span>
        )}
      </div>

      {/* Editor area */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setShowSolution(false);
          }}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className={cn(
            'w-full min-h-[140px] p-4 font-mono text-sm leading-relaxed',
            'bg-[#1e1e2e] text-[#cdd6f4] resize-y',
            'focus:outline-none focus:ring-1 focus:ring-primary/30',
            'border-0 selection:bg-primary/30'
          )}
          style={{ tabSize: 2 }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-t border-border flex-wrap">
        <Button onClick={runCode} size="sm">
          <Play className="size-3.5" />
          Run Code
        </Button>
        <Button onClick={resetCode} variant="outline" size="sm">
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
        {solution && (
          <Button
            onClick={() => (showSolution ? resetCode() : applySolution())}
            variant="outline"
            size="sm"
          >
            {showSolution ? (
              <>
                <EyeOff className="size-3.5" />
                Hide Solution
              </>
            ) : (
              <>
                <Eye className="size-3.5" />
                Show Solution
              </>
            )}
          </Button>
        )}
        {testCases && testCases.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {testCases.length} test case{testCases.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Output panel — only shown after running */}
      {hasRun && (
        <div className="border-t border-border">
          {/* Console output */}
          <div className="px-4 py-3 bg-[#181825]">
            <div className="flex items-center gap-1.5 mb-2">
              <Terminal className="size-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Console Output
              </span>
            </div>
            {error ? (
              <div className="flex items-start gap-2 text-sm font-mono text-red-400">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <pre className="whitespace-pre-wrap break-all">{error}</pre>
              </div>
            ) : output.length > 0 ? (
              <pre className="text-sm font-mono text-green-300 whitespace-pre-wrap leading-relaxed">
                {output.join('\n')}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No output (use console.log to print)
              </p>
            )}
          </div>

          {/* Test case results */}
          {testResults && (
            <div className="px-4 py-3 bg-muted/20 border-t border-border space-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                Test Results
              </span>
              {testResults.map((result, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-md p-3 text-xs font-mono border',
                    result.passed
                      ? 'bg-green-50/50 dark:bg-green-950/20 border-green-300 dark:border-green-800'
                      : 'bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-800'
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {result.passed ? (
                      <CheckCircle2 className="size-3.5 text-green-500" />
                    ) : (
                      <XCircle className="size-3.5 text-red-500" />
                    )}
                    <span
                      className={cn(
                        'font-sans font-medium',
                        result.passed
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                      )}
                    >
                      Test {i + 1}: {result.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                  {!result.passed && (
                    <div className="space-y-1 ml-5">
                      <div className="text-foreground/70">
                        <span className="text-muted-foreground">Expected: </span>
                        <span className="text-green-600 dark:text-green-400">
                          {result.expected || '(empty)'}
                        </span>
                      </div>
                      <div className="text-foreground/70">
                        <span className="text-muted-foreground">Actual:&nbsp;&nbsp; </span>
                        <span className="text-red-600 dark:text-red-400">
                          {result.actual || '(empty)'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
