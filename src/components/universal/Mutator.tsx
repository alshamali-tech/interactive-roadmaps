import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MutatorProps } from '@/curriculum/schema';
import {
  Bug,
  Play,
  RotateCcw,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  FlaskConical,
  Code2,
  FileWarning,
} from 'lucide-react';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TestCaseResult {
  /** The raw test case string */
  testCase: string;
  /** The parsed function call expression */
  call: string;
  /** The expected output */
  expected: string;
  /** The actual output produced by the user's code */
  actual: string;
  /** Whether the test passed */
  passed: boolean;
  /** Error message if the test threw */
  error: string | null;
}

type RunState = 'idle' | 'running' | 'done';

// â”€â”€â”€ Test Case Parser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Parses a test case string of the form:
 *   "functionCall(arg1, arg2) => expected"
 * or:
 *   "functionCall(arg1, arg2) => { key: value }"
 */
function parseTestCase(raw: string): { call: string; expected: string } | null {
  const arrowIndex = raw.lastIndexOf('=>');
  if (arrowIndex === -1) return null;
  const call = raw.slice(0, arrowIndex).trim();
  const expected = raw.slice(arrowIndex + 2).trim();
  if (!call || !expected) return null;
  return { call, expected };
}

/**
 * Normalizes an expected value string for comparison.
 * Handles numbers, strings, booleans, null, undefined, arrays, and objects.
 */
function parseExpected(raw: string): unknown {
  const trimmed = raw.trim();

  // null / undefined / boolean
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Numbers
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

  // Quoted strings
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Arrays or objects â€” use Function to parse JSON-like
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${trimmed})`)();
  } catch {
    return trimmed;
  }
}

/**
 * Deep equality check for test comparison.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  );
}

/**
 * Formats a value for display in the test results.
 */
function formatValue(val: unknown): string {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// â”€â”€â”€ Mutator Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * The Mutator Widget â€” a code fixer challenge.
 *
 * Presents a broken code snippet in a Monaco editor with hidden deterministic tests.
 * The user must identify and fix the bug(s) to make all tests pass.
 *
 * Test cases use the format: `functionCall(args) => expected`
 */
export function Mutator({
  language = 'javascript',
  brokenCode,
  testCases,
  hint,
  title = 'Fix the Bug',
}: MutatorProps) {
  const [code, setCode] = useState(brokenCode);
  const [results, setResults] = useState<TestCaseResult[] | null>(null);
  const [runState, setRunState] = useState<RunState>('idle');
  const [hintExpanded, setHintExpanded] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allPassed = useMemo(
    () => results !== null && results.every((r) => r.passed),
    [results]
  );

  const passCount = useMemo(
    () => results?.filter((r) => r.passed).length ?? 0,
    [results]
  );

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const runTests = useCallback(() => {
    if (runState === 'running') return;

    setRunState('running');
    setResults(null);

    // Clear any pending timeout from a previous run
    if (testTimeoutRef.current !== null) {
      clearTimeout(testTimeoutRef.current);
    }

    // Simulate a brief delay to show the loading state
    testTimeoutRef.current = setTimeout(() => {
      const currentCode = editorRef.current?.getValue() ?? code;
      const testResults: TestCaseResult[] = [];

      for (const rawTC of testCases) {
        const parsed = parseTestCase(rawTC);
        if (!parsed) {
          testResults.push({
            testCase: rawTC,
            call: rawTC,
            expected: '(unparseable)',
            actual: '',
            passed: false,
            error: 'Invalid test case format',
          });
          continue;
        }

        const { call, expected } = parsed;
        let actual: unknown = undefined;
        let error: string | null = null;

        try {
          // Build a function that defines the user's code, then evaluates the test call
          const wrappedCode = `
            "use strict";
            ${currentCode}
            return (${call});
          `;
          // eslint-disable-next-line no-new-func
          const fn = new Function(wrappedCode);
          actual = fn();
        } catch (e: unknown) {
          error = e instanceof Error ? e.message : String(e);
        }

        const expectedVal = parseExpected(expected);
        const passed = error === null && deepEqual(actual, expectedVal);

        testResults.push({
          testCase: rawTC,
          call,
          expected,
          actual: error ?? formatValue(actual),
          passed,
          error,
        });
      }

      setResults(testResults);
      setRunState('done');
      testTimeoutRef.current = null;
    }, 1200);
  }, [code, testCases, runState]);

  const resetCode = useCallback(() => {
    if (testTimeoutRef.current !== null) {
      clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }
    setCode(brokenCode);
    if (editorRef.current) {
      editorRef.current.setValue(brokenCode);
    }
    setResults(null);
    setRunState('idle');
  }, [brokenCode]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (testTimeoutRef.current !== null) {
        clearTimeout(testTimeoutRef.current);
      }
    };
  }, []);

  const handleCodeChange = useCallback((value: string | undefined) => {
    setCode(value ?? '');
  }, []);

  return (
    <div className="my-6 rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-rose-50 to-amber-50 dark:from-rose-950/30 dark:to-amber-950/20 px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center size-8 rounded-lg bg-rose-100 dark:bg-rose-900/40">
            <Bug className="size-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            <p className="text-[0.65rem] text-muted-foreground">
              Find and fix the bug to pass all tests
            </p>
          </div>
        </div>

        {results && (
          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                'text-xs font-semibold px-2.5 py-1 rounded-full',
                allPassed
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
              )}
            >
              {passCount}/{testCases.length} passed
            </span>
          </div>
        )}
      </div>

      {/* Split-screen: Editor + Test Panel */}
      <div className="flex flex-col lg:flex-row">
        {/* Left: Monaco Editor */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 px-4 py-2 bg-[#1e1e2e] border-b border-[#313244]">
            <Code2 className="size-3.5 text-[#cba6f7]" />
            <span className="text-xs font-medium text-[#cdd6f4]">
              Editor
            </span>
            <span className="text-[0.6rem] text-[#6c7086] ml-auto">
              {language}
            </span>
          </div>
          <div className="bg-[#1e1e2e]">
            <Editor
              height="320px"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: 'line',
                bracketPairColorization: { enabled: true },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
              }}
            />
          </div>
        </div>

        {/* Right: Test Panel */}
        <div className="lg:w-[380px] border-t lg:border-t-0 lg:border-l border-border flex flex-col">
          {/* Test panel header */}
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
            <FlaskConical className="size-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Test Cases
            </span>
            <span className="text-[0.6rem] text-muted-foreground ml-auto">
              {testCases.length} test{testCases.length > 1 ? 's' : ''}
            </span>
          </div>

          {/* Test case cards */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[180px] max-h-[260px]">
            {runState === 'idle' && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <FileWarning className="size-8 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Click <strong>Run Tests</strong> to check your fix
                </p>
              </div>
            )}

            {runState === 'running' && (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <Loader2 className="size-8 text-primary animate-spin mb-2" />
                <p className="text-xs text-muted-foreground">
                  Running tests...
                </p>
              </div>
            )}

            {runState === 'done' && results && (
              <>
                {results.map((result, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg border p-3 transition-all',
                      result.passed
                        ? 'bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                        : 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                    )}
                  >
                    {/* Status line */}
                    <div className="flex items-center gap-1.5 mb-2">
                      {result.passed ? (
                        <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="size-3.5 text-red-500 shrink-0" />
                      )}
                      <span
                        className={cn(
                          'text-[0.65rem] font-bold uppercase tracking-wider',
                          result.passed
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-red-700 dark:text-red-400'
                        )}
                      >
                        Test {i + 1}: {result.passed ? 'Pass' : 'Fail'}
                      </span>
                    </div>

                    {/* Call expression */}
                    <div className="font-mono text-[0.7rem] bg-white/50 dark:bg-black/20 rounded px-2 py-1 mb-2">
                      <span className="text-muted-foreground">call: </span>
                      <span className="text-foreground">{result.call}</span>
                    </div>

                    {/* Expected vs Actual */}
                    {!result.passed && (
                      <div className="space-y-1 text-[0.65rem] font-mono ml-5">
                        <div>
                          <span className="text-muted-foreground">expected </span>
                          <span className="text-green-600 dark:text-green-400 font-semibold">
                            {result.expected}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">actual&nbsp;&nbsp; </span>
                          <span className="text-red-600 dark:text-red-400 font-semibold">
                            {result.actual}
                          </span>
                        </div>
                        {result.error && (
                          <div className="text-red-500 dark:text-red-400 mt-1">
                            âš  {result.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Toolbar */}
          <div className="border-t border-border p-3 space-y-2 bg-muted/20">
            <Button
              onClick={runTests}
              disabled={runState === 'running'}
              className="w-full"
              size="sm"
            >
              {runState === 'running' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Running Tests...
                </>
              ) : runState === 'done' ? (
                <>
                  <Play className="size-3.5" />
                  Run Tests Again
                </>
              ) : (
                <>
                  <Play className="size-3.5" />
                  Run Tests
                </>
              )}
            </Button>

            <div className="flex gap-2">
              <Button
                onClick={resetCode}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <RotateCcw className="size-3.5" />
                Reset Code
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* All passed celebration */}
      {allPassed && (
        <div className="bg-green-50 dark:bg-green-950/30 border-t border-green-200 dark:border-green-800 px-5 py-4 flex items-center gap-3">
          <Sparkles className="size-6 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-green-700 dark:text-green-400">
              ðŸŽ‰ All tests passed! Bug squashed!
            </p>
            <p className="text-xs text-green-600 dark:text-green-500/80">
              Great debugging work. You&apos;ve successfully identified and fixed the issue.
            </p>
          </div>
        </div>
      )}

      {/* Hint Section */}
      {hint && (
        <div className="border-t border-border">
          <button
            onClick={() => setHintExpanded(!hintExpanded)}
            className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-muted/30 transition-colors"
          >
            <Lightbulb
              className={cn(
                'size-4 shrink-0 transition-colors',
                hintExpanded
                  ? 'text-amber-500'
                  : 'text-muted-foreground'
              )}
            />
            <span className="text-sm font-medium text-foreground">
              {hintExpanded ? 'Hide Hint' : 'Need a Hint?'}
            </span>
            {hintExpanded ? (
              <ChevronDown className="size-4 ml-auto text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 ml-auto text-muted-foreground" />
            )}
          </button>
          {hintExpanded && (
            <div className="px-5 pb-4 -mt-1">
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                ðŸ’¡ {hint}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

