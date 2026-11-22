import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { SandboxProps } from '@/curriculum/schema';
import {
  Play, Code2, FileText, Monitor, AlertTriangle, Zap,
  Trash2, Copy, Check, GitCompare, Eye, EyeOff,
  ChevronRight, ChevronDown, Settings, X
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { countTokens } from '@/lib/tokenCounter';

// ─── Types ──────────────────────────────────────────────────────────────────

interface JsonNodeProps {
  data: unknown;
  name?: string;
  depth?: number;
  defaultExpanded?: boolean;
}

// ─── JSON Viewer Component ──────────────────────────────────────────────────

function JsonNode({ data, name, depth = 0, defaultExpanded = false }: JsonNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 2);

  const isObject = data !== null && typeof data === 'object';
  const isArray = Array.isArray(data);
  const entries = isObject ? Object.entries(data as Record<string, unknown>) : [];

  if (!isObject) {
    const valueClass =
      typeof data === 'string'
        ? 'text-green-600 dark:text-green-400'
        : typeof data === 'number'
        ? 'text-blue-600 dark:text-blue-400'
        : typeof data === 'boolean'
        ? 'text-purple-600 dark:text-purple-400'
        : 'text-gray-500';

    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {name !== undefined && (
          <>
            <span className="text-rose-600 dark:text-rose-400">"{name}"</span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <span className={valueClass}>
          {typeof data === 'string' ? `"${data}"` : String(data)}
        </span>
      </div>
    );
  }

  const bracket = isArray ? ['[', ']'] : ['{', '}'];
  const count = entries.length;

  if (count === 0) {
    return (
      <div className="py-0.5" style={{ paddingLeft: depth * 16 }}>
        {name !== undefined && (
          <>
            <span className="text-rose-600 dark:text-rose-400">"{name}"</span>
            <span className="text-muted-foreground">: </span>
          </>
        )}
        <span className="text-muted-foreground">{bracket[0]}{bracket[1]}</span>
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-muted/30 rounded"
        style={{ paddingLeft: depth * 16 }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground shrink-0" />
        )}
        {name !== undefined && (
          <>
            <span className="text-rose-600 dark:text-rose-400">"{name}"</span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <span className="text-muted-foreground">
          {bracket[0]}
          {!expanded && (
            <span className="text-xs text-muted-foreground/70 ml-1">
              {count} {isArray ? 'items' : 'keys'}
            </span>
          )}
          {!expanded && bracket[1]}
        </span>
      </div>
      {expanded && (
        <>
          {entries.map(([key, value]) => (
            <JsonNode
              key={key}
              data={value}
              name={isArray ? undefined : key}
              depth={depth + 1}
              defaultExpanded={depth < 1}
            />
          ))}
          <div className="py-0.5" style={{ paddingLeft: depth * 16 }}>
            <span className="text-muted-foreground">{bracket[1]}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Sandbox Component ─────────────────────────────────────────────────

export function Sandbox({
  inputType,
  outputType,
  initialState,
  processFunction,
  label = 'Sandbox',
  placeholder = 'Type here...',
  tokenLimit,
  widgetId,
}: SandboxProps) {
  // ─── State ────────────────────────────────────────────────────────────────
  const storageKey = widgetId ? `sandbox-state-${widgetId}` : null;

  const [input, setInput] = useState(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved !== null) return saved;
      } catch {
        // localStorage not available
      }
    }
    return initialState;
  });

  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState<'input' | 'output' | null>(null);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const [compareOutput, setCompareOutput] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Compute output ───────────────────────────────────────────────────────

  const computeOutput = useCallback(
    (inputVal: string): { out: string; err: string | null } => {
      if (!processFunction) return { out: inputVal, err: null };
      try {
        // eslint-disable-next-line no-new-func
        const executor = new Function(
          'input',
          `"use strict";\n${processFunction}\nif (typeof process !== "function") { throw new Error("Your code must define a function called process(input)"); }\nreturn process(input);`
        );
        const result = executor(inputVal);
        return { out: result == null ? '' : String(result), err: null };
      } catch (e) {
        return { out: '', err: e instanceof Error ? e.message : String(e) };
      }
    },
    [processFunction]
  );

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Detect mobile viewport
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    handler(mq);
    mq.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
    return () => mq.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
  }, []);

  // Detect dark mode
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setIsDarkMode(document.documentElement.classList.contains('dark'));
    return () => observer.disconnect();
  }, []);

  // Persist input to localStorage
  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, input);
      } catch {
        // localStorage full or not available
      }
    }
  }, [input, storageKey]);

  // Debounced output computation
  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setIsProcessing(true);
      const result = computeOutput(input);
      setOutput(result.out);
      setError(result.err);
      setIsProcessing(false);
    }, 300);

    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [input, computeOutput]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current && inputType === 'text') {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 400)}px`;
    }
  }, [input, inputType]);

  // ─── Derived values ───────────────────────────────────────────────────────

  const tokenCount = useMemo(() => countTokens(input), [input]);
  const charCount = input.length;
  const tokenExceeded = tokenLimit !== undefined && tokenCount > tokenLimit;
  const tokenPercentage = tokenLimit ? Math.min((tokenCount / tokenLimit) * 100, 100) : 0;

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleClear = () => {
    setInput('');
    setCompareOutput(null);
  };

  const handleCopy = async (text: string, target: 'input' | 'output') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard not available
    }
  };

  const handleCompare = () => {
    setCompareOutput(output);
  };

  const handleClearSavedState = () => {
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
    setInput(initialState);
    setShowSettings(false);
  };

  const handleReset = () => setInput(initialState);

  // ─── Render helpers ───────────────────────────────────────────────────────

  const InputIcon = inputType === 'code' ? Code2 : FileText;
  const OutputIcon = outputType === 'html' ? Monitor : outputType === 'json' ? Code2 : FileText;

  const htmlDoc = useMemo(
    () =>
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;color:#111;line-height:1.6}h1,h2,h3{margin-top:0}img{max-width:100%}</style></head><body>${output}</body></html>`,
    [output]
  );

  // Try to parse JSON for json output type
  const parsedJson = useMemo(() => {
    if (outputType !== 'json') return null;
    try {
      return JSON.parse(output);
    } catch {
      return null;
    }
  }, [output, outputType]);

  // Detect if text output looks like code
  const looksLikeCode = useMemo(() => {
    if (outputType !== 'text') return false;
    const codePatterns = [/^{/, /^\[/, /function\s+\w+/, /=>\s*{/, /<\w+/, /^\s*import\s/, /export\s+(default|const|function)/];
    return codePatterns.some((p) => p.test(output.trim()));
  }, [output, outputType]);

  // ─── Render ───────────────────────────────────────────────────────────────

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

      {/* Main content */}
      <div className={cn('grid divide-border', isMobile ? 'grid-cols-1 divide-y' : 'grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x')}>
        {/* ─── Input Pane ──────────────────────────────────────────── */}
        <div className="flex flex-col">
          {/* Input toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/20 border-b border-border">
            <span>Input</span>
            <div className="flex items-center gap-2">
              {/* Token counter */}
              <span className="normal-case tracking-normal text-[0.65rem]">
                {tokenLimit ? (
                  <>
                    Tokens: <span className={cn('font-mono', tokenExceeded && 'text-red-500 font-bold')}>{tokenCount}/{tokenLimit}</span>
                  </>
                ) : (
                  <>
                    Tokens: <span className="font-mono">{tokenCount}</span>
                  </>
                )}
              </span>
              <button
                onClick={handleReset}
                className="text-[0.65rem] font-medium normal-case tracking-normal text-primary/70 hover:text-primary transition-colors"
                type="button"
                aria-label="Reset to initial state"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Token limit progress bar */}
          {tokenLimit && (
            <div className="h-1 bg-muted/30">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  tokenExceeded ? 'bg-red-500' : tokenPercentage > 80 ? 'bg-amber-500' : 'bg-primary'
                )}
                style={{ width: `${tokenPercentage}%` }}
              />
            </div>
          )}

          {/* Input area */}
          <div className="relative flex-1">
            {inputType === 'code' && !isMobile ? (
              <Editor
                height="220px"
                language="javascript"
                theme={isDarkMode ? 'vs-dark' : 'light'}
                value={input}
                onChange={(val) => setInput(val ?? '')}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  tabSize: 2,
                  wordWrap: 'on',
                  padding: { top: 12, bottom: 12 },
                }}
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={placeholder}
                spellCheck={inputType !== 'code'}
                className={cn(
                  'flex-1 min-h-[220px] w-full p-4 text-sm resize-none',
                  'focus:outline-none focus:ring-1 focus:ring-primary/30',
                  'border-0',
                  inputType === 'code'
                    ? 'bg-[#1e1e2e] text-[#cdd6f4] font-mono leading-relaxed selection:bg-primary/30'
                    : 'bg-background text-foreground leading-relaxed'
                )}
                style={inputType === 'code' ? { tabSize: 2 } : undefined}
              />
            )}

            {/* Character count */}
            <div className="absolute bottom-1 right-2 text-[0.6rem] text-muted-foreground/60 font-mono bg-background/80 px-1 rounded">
              {charCount} characters
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 px-3 py-2 border-t border-border bg-muted/10">
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
              type="button"
              aria-label="Clear input"
              title="Clear input"
            >
              <Trash2 className="size-3" />
              {!isMobile && <span>Clear</span>}
            </button>
            <button
              onClick={() => handleCopy(input, 'input')}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
              type="button"
              aria-label="Copy to clipboard"
              title="Copy input"
            >
              {copied === 'input' ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
              {!isMobile && <span>{copied === 'input' ? 'Copied!' : 'Copy'}</span>}
            </button>
            <button
              onClick={handleCompare}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                compareOutput !== null
                  ? 'text-primary bg-primary/10 hover:bg-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              type="button"
              aria-label="Compare outputs"
              title="Save output for A/B comparison"
            >
              <GitCompare className="size-3" />
              {!isMobile && <span>{compareOutput !== null ? 'Saved' : 'Compare'}</span>}
            </button>

            <div className="ml-auto relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
                type="button"
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="size-3" />
              </button>
              {showSettings && (
                <div className="absolute right-0 bottom-full mb-1 bg-card border border-border rounded-lg shadow-lg p-2 z-10 min-w-[180px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">Settings</span>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="text-muted-foreground hover:text-foreground"
                      type="button"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                  {storageKey && (
                    <button
                      onClick={handleClearSavedState}
                      className="w-full text-left px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded transition-colors"
                      type="button"
                    >
                      Clear Saved State
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Output Pane ─────────────────────────────────────────── */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/20 border-b border-border">
            <span className="flex items-center gap-2">
              Output
              {compareOutput !== null && (
                <span className="normal-case tracking-normal text-[0.6rem] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                  Comparing
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {outputType === 'html' && (
                <button
                  onClick={() => setShowHtmlSource(!showHtmlSource)}
                  className="inline-flex items-center gap-1 text-[0.65rem] font-medium normal-case tracking-normal text-primary/70 hover:text-primary transition-colors"
                  type="button"
                  aria-label="View source"
                >
                  {showHtmlSource ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  {showHtmlSource ? 'Preview' : 'Source'}
                </button>
              )}
              <button
                onClick={() => handleCopy(output, 'output')}
                className="inline-flex items-center gap-1 text-[0.65rem] font-medium normal-case tracking-normal text-primary/70 hover:text-primary transition-colors"
                type="button"
              >
                {copied === 'output' ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                {copied === 'output' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Error display */}
          {error ? (
            <div className="flex-1 min-h-[220px] p-4 bg-red-50/50 dark:bg-red-950/20 overflow-auto">
              <div className="flex items-start gap-2 text-sm font-mono text-red-700 dark:text-red-400">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <pre className="whitespace-pre-wrap break-words">{error}</pre>
              </div>
            </div>
          ) : compareOutput !== null ? (
            /* Compare view: side by side */
            <div className="grid grid-cols-2 divide-x divide-border flex-1 min-h-[220px]">
              <div className="flex flex-col">
                <div className="px-2 py-1 text-[0.6rem] font-medium text-muted-foreground bg-amber-50/50 dark:bg-amber-950/10 border-b border-border">
                  Previous Output
                </div>
                <OutputContent
                  outputType={outputType}
                  output={compareOutput}
                  htmlDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;color:#111;line-height:1.6}h1,h2,h3{margin-top:0}img{max-width:100%}</style></head><body>${compareOutput}</body></html>`}
                  showHtmlSource={showHtmlSource}
                  looksLikeCode={looksLikeCode}
                  parsedJson={(() => { try { return JSON.parse(compareOutput); } catch { return null; } })()}
                  inputType={inputType}
                />
              </div>
              <div className="flex flex-col">
                <div className="px-2 py-1 text-[0.6rem] font-medium text-muted-foreground bg-green-50/50 dark:bg-green-950/10 border-b border-border">
                  Current Output
                </div>
                <OutputContent
                  outputType={outputType}
                  output={output}
                  htmlDoc={htmlDoc}
                  showHtmlSource={showHtmlSource}
                  looksLikeCode={looksLikeCode}
                  parsedJson={parsedJson}
                  inputType={inputType}
                />
              </div>
            </div>
          ) : (
            /* Normal output */
            <OutputContent
              outputType={outputType}
              output={output}
              htmlDoc={htmlDoc}
              showHtmlSource={showHtmlSource}
              looksLikeCode={looksLikeCode}
              parsedJson={parsedJson}
              inputType={inputType}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Output Content Sub-component ───────────────────────────────────────────

interface OutputContentProps {
  outputType: 'text' | 'html' | 'json';
  output: string;
  htmlDoc: string;
  showHtmlSource: boolean;
  looksLikeCode: boolean;
  parsedJson: unknown;
  inputType: 'text' | 'code';
}

function OutputContent({
  outputType,
  output,
  htmlDoc,
  showHtmlSource,
  looksLikeCode,
  parsedJson,
  inputType,
}: OutputContentProps) {
  if (outputType === 'json') {
    if (parsedJson === null) {
      return (
        <div className="flex-1 min-h-[220px] p-4 bg-amber-50/30 dark:bg-amber-950/10 overflow-auto">
          <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Invalid JSON</p>
              <pre className="text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground">{output}</pre>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 min-h-[220px] p-4 overflow-auto bg-[#1e1e2e] dark:bg-[#181825] font-mono text-sm">
        <JsonNode data={parsedJson} defaultExpanded />
      </div>
    );
  }

  if (outputType === 'html') {
    if (showHtmlSource) {
      return (
        <pre className="flex-1 min-h-[220px] p-4 text-sm overflow-auto bg-[#1e1e2e] text-[#cdd6f4] font-mono leading-relaxed whitespace-pre-wrap break-words">
          {output || <span className="text-muted-foreground italic">Output will appear here...</span>}
        </pre>
      );
    }
    return (
      <iframe
        srcDoc={htmlDoc}
        className="flex-1 min-h-[220px] w-full bg-white"
        sandbox=""
        title="HTML Output"
      />
    );
  }

  // Text output
  return (
    <pre
      className={cn(
        'flex-1 min-h-[220px] w-full p-4 text-sm overflow-auto m-0',
        'whitespace-pre-wrap break-words',
        looksLikeCode || inputType === 'code'
          ? 'bg-[#181825] text-green-300 font-mono leading-relaxed'
          : 'bg-muted/10 text-foreground font-mono leading-relaxed'
      )}
    >
      {output || (
        <span className="text-muted-foreground italic">Output will appear here...</span>
      )}
    </pre>
  );
}
