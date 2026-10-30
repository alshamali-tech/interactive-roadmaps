import { useState, useCallback, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import { Copy, Check, Sparkles } from 'lucide-react';
import type { WidgetConfig } from '@/curriculum/schema';
import { widgetRegistry } from '@/engine/registry';

interface MarkdownRendererProps {
  markdown: string;
  widgets: WidgetConfig[];
  showAITutor?: boolean;
  onAskAI?: (sectionTitle: string) => void;
  className?: string;
}

interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  handleCopyCode: (code: string) => Promise<void>;
  node?: unknown; // react-markdown passes this Hast node - we filter it out
}

function CodeBlock({ children, handleCopyCode, className, node: _node, ...props }: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    const codeText = preRef.current?.textContent?.trim() || '';
    if (codeText) {
      await handleCopyCode(codeText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    }
  };

  return (
    <div className="relative group mb-4">
      <pre
        ref={preRef}
        className={`bg-[#1e1e2e] rounded-lg p-4 overflow-x-auto text-sm pr-10 ${className || ''}`}
        {...props}
      >
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Copy code"
        title="Copy code"
      >
        {isCopied ? (
          <Check className="size-3.5 text-green-400" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}

type Segment = 
  | { type: 'markdown'; content: string }
  | { type: 'widget'; widget: WidgetConfig }
  | { type: 'ai-prompt'; sectionTitle: string };

export function MarkdownRenderer({
  markdown,
  widgets,
  showAITutor,
  onAskAI,
  className = '',
}: MarkdownRendererProps) {
  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // fallback silently
    }
  }, []);

  // Custom components for react-markdown
  const components: Components = useMemo(() => ({
    h1: ({ children, ...props }) => (
      <h1
        {...props}
        data-section-title={typeof children === 'string' ? children : undefined}
        className="text-2xl font-bold text-foreground mb-3 mt-2"
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => {
      const title = typeof children === 'string' ? children : undefined;
      return (
        <h2
          {...props}
          data-section-title={title}
          className="text-xl font-semibold text-foreground mb-2 mt-6"
        >
          {children}
        </h2>
      );
    },
    h3: ({ children, ...props }) => (
      <h3
        {...props}
        data-section-title={typeof children === 'string' ? children : undefined}
        className="text-lg font-semibold text-foreground mb-2 mt-4"
      >
        {children}
      </h3>
    ),
    pre: (props) => <CodeBlock {...props} handleCopyCode={handleCopyCode} />,
    code: ({ className, children, ...props }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code
            className="bg-muted/60 text-foreground/90 rounded px-1.5 py-0.5 text-[0.85em] font-mono"
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    widget: ({ node, ...props }: any) => {
      const widgetId = props.id as string | undefined;

      if (!widgetId) {
        return (
          <div className="not-prose p-4 bg-red-100 text-red-800 rounded-lg border border-red-300 text-sm">
            ⚠️ Widget Error: No <code>id</code> attribute provided on &lt;widget&gt; tag.
          </div>
        );
      }

      const widgetConfig = widgets.find((w) => w.id === widgetId);

      if (!widgetConfig) {
        return (
          <div className="not-prose p-4 bg-red-100 text-red-800 rounded-lg border border-red-300 text-sm">
            ⚠️ Widget Error: Configuration for ID <code>{widgetId}</code> not found in lesson data.
          </div>
        );
      }

      const WidgetComponent = widgetRegistry.resolve(widgetConfig);

      if (!WidgetComponent) {
        return (
          <div className="not-prose p-4 bg-yellow-100 text-yellow-800 rounded-lg border border-yellow-300 text-sm">
            ⚠️ Widget Error: Component type <code>{widgetConfig.type}</code> is not registered.
          </div>
        );
      }

      return (
        <div className="not-prose my-6 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <WidgetComponent {...widgetConfig.props} />
        </div>
      );
    },
  }), [handleCopyCode, widgets]);

  // Split markdown into segments (text, widgets, AI prompts)
  const segments = useMemo(() => {
    const result: Segment[] = [];
    const lines = markdown.split('\n');
    let currentMarkdown: string[] = [];
    let sectionCount = 0;
    let inCodeBlock = false;

    const flushMarkdown = () => {
      if (currentMarkdown.length > 0) {
        result.push({ type: 'markdown', content: currentMarkdown.join('\n') });
        currentMarkdown = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track code blocks to avoid processing widgets inside them
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        currentMarkdown.push(line);
        continue;
      }

      if (inCodeBlock) {
        currentMarkdown.push(line);
        continue;
      }

      // Handle widget syntax
      const widgetMatch = line.match(/^\{\{widget:([^}]+)\}\}$/);
      if (widgetMatch) {
        flushMarkdown();
        const widgetId = widgetMatch[1];
        const widget = widgets.find((w) => w.id === widgetId);
        if (widget) {
          result.push({ type: 'widget', widget });
        }
        continue;
      }

      // Track sections and inject AI prompts
      if (line.startsWith('## ')) {
        currentMarkdown.push(line);
        sectionCount++;

        // Inject AI prompt after every 2nd section
        if (showAITutor && sectionCount > 0 && sectionCount % 2 === 0) {
          const title = line.replace(/^## /, '');
          flushMarkdown();
          result.push({ type: 'ai-prompt', sectionTitle: title });
        }
        continue;
      }

      currentMarkdown.push(line);
    }

    flushMarkdown();
    return result;
  }, [markdown, widgets, showAITutor]);

  return (
    <div className={`prose prose-slate dark:prose-invert max-w-none ${className}`}>
      {segments.map((segment, index) => {
        if (segment.type === 'markdown') {
          return (
            <ReactMarkdown
              key={index}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeHighlight]}
              components={components}
            >
              {segment.content}
            </ReactMarkdown>
          );
        }

        if (segment.type === 'widget') {
          const RegisteredComponent = widgetRegistry.resolve(segment.widget);
          if (RegisteredComponent) {
            return (
              <div key={index} className="my-5">
                <RegisteredComponent {...segment.widget.props} />
              </div>
            );
          }
          return (
            <div
              key={index}
              className="my-5 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground"
            >
              <Sparkles className="size-4 mx-auto mb-1" />
              Unknown widget type:{' '}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {segment.widget.type}
              </code>
            </div>
          );
        }

        if (segment.type === 'ai-prompt') {
          return (
            <div
              key={index}
              className="my-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 border border-border/50 rounded-lg px-3 py-2"
            >
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span className="flex-1">
                Have questions about this section? Use the AI Tutor to get help.
              </span>
              <button
                onClick={() => onAskAI?.(segment.sectionTitle)}
                className="text-primary hover:text-primary/80 font-medium whitespace-nowrap"
              >
                Ask AI
              </button>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}