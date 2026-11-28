import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown as the heading; defaults to a generic but honest message. */
  title?: string;
  /**
   * What failed, e.g. "this lesson" or "the sandbox widget". Rendered in the
   * body so the user knows what they lost and what is still usable.
   */
  subject?: string;
  /** Changing this value resets the boundary — used to recover on navigation. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: string | null;
}

/**
 * Catches render/lifecycle errors so one broken widget or lesson cannot blank the
 * whole SPA. Previously the only boundary in the app lived inside ContextDiagram.
 *
 * Deliberately does NOT swallow the error: it is re-logged with the component
 * stack so a production failure is still debuggable in the console.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught a render error:', error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // A route or item change should clear a previous failure, otherwise the user
    // is stuck on an error screen for content that may now render fine.
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: null });
    }
  }

  private reset = (): void => {
    this.setState({ error: null, info: null });
  };

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const subject = this.props.subject ?? 'this content';

    return (
      <div
        role="alert"
        className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 space-y-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 text-red-500 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              {this.props.title ?? "This part couldn't be displayed"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Something broke while rendering {subject}. The rest of the page still works — you can
              retry, or continue elsewhere.
            </p>
            <p className="text-xs text-muted-foreground break-words font-mono">
              {error.message || error.name}
            </p>
          </div>
        </div>

        {info && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">
              {info}
            </pre>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="button" size="sm" onClick={this.reset} className="gap-1.5">
            <RotateCcw className="size-3.5" />
            Try again
          </Button>
          <a
            href="#/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            <Home className="size-3.5" />
            Back to Home
          </a>
        </div>
      </div>
    );
  }
}
