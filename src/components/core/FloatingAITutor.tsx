import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X, Minimize2, Maximize2, Sparkles } from 'lucide-react';
import { useSettingsStore } from '@/engine/settings';
import { SocraticChat } from '@/components/universal/SocraticChat';

export interface FloatingAITutorProps {
  /** Controlled open state (owned by parent Lesson page) */
  open: boolean;
  /** Callback when the user opens/closes the panel */
  onOpenChange: (open: boolean) => void;
  lessonId: string;
  lessonTitle: string;
  lessonDescription?: string;
  lessonContent?: string;
  moduleName: string;
  tags: string[];
  /** Current H2 section title the user is viewing (from IntersectionObserver) */
  currentSection?: string;
  /** All H2 section titles in the lesson (for roadmap prompt) */
  sectionTitles?: string[];
  /** Pre-fill the chat input (e.g., when user clicks contextual "Ask AI") */
  prefilledMessage?: string;
}

/**
 * Floating AI Tutor — a slide-in chat panel anchored to the bottom-right
 * of the screen. Always discoverable via a FAB + Ctrl+K shortcut.
 *
 * Rendering: uses React Portal so parent CSS (transforms, filters,
 * fixed layouts) never interferes with positioning.
 *
 * State is controlled from the parent (Lesson page) so contextual
 * "Ask AI" prompts in the lesson content can open the panel.
 */
export function FloatingAITutor({
  open,
  onOpenChange,
  lessonId,
  lessonTitle,
  lessonDescription,
  lessonContent,
  moduleName,
  tags,
  currentSection,
  sectionTitles,
  prefilledMessage,
}: FloatingAITutorProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  // `closing` is true during the exit animation, so the panel stays mounted
  // while it slides out. After the animation we call onOpenChange(false).
  const [closing, setClosing] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isAIConnected = useSettingsStore((s) => s.isAIConnected);

  // ── Global keyboard shortcut: Ctrl+K / Cmd+K ────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in other inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === 'Escape' && open && !closing) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, closing, onOpenChange]);

  // ── Focus management ────────────────────────────────────────────────────
  useEffect(() => {
    if (open && !closing) {
      // Focus the textarea after the slide-in animation starts
      const timer = setTimeout(() => {
        const textarea = panelRef.current?.querySelector('textarea');
        if (textarea instanceof HTMLTextAreaElement) textarea.focus();
      }, 180);
      return () => clearTimeout(timer);
    } else if (!open && !closing) {
      // Return focus to FAB when fully closed
      fabRef.current?.focus();
    }
  }, [open, closing]);

  // Reset maximized state when panel closes
  useEffect(() => {
    if (!open) setIsMaximized(false);
  }, [open]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onOpenChange(false);
    }, 300);
  };

  // ── Visibility decisions ────────────────────────────────────────────────
  const showFab = !open || closing; // hide FAB while panel is fully open
  const showPanel = open || closing; // keep panel mounted during exit animation

  const panelTranslate = open && !closing ? 'translate-x-0' : 'translate-x-full';
  const backdropOpacity = open && !closing ? 'opacity-100' : 'opacity-0';

  const fab = showFab ? (
    <button
      ref={fabRef}
      onClick={() => onOpenChange(true)}
      className="fixed bottom-6 right-6 z-50 group"
      aria-label="Open AI Tutor (Ctrl+K)"
      title="Open AI Tutor (Ctrl+K)"
    >
      <div className="relative">
        <div
          className="w-14 h-14 bg-primary hover:bg-primary/90 rounded-full shadow-lg
                     flex items-center justify-center transition-all
                     hover:scale-110 active:scale-95"
        >
          <MessageCircle className="size-6 text-primary-foreground" />
        </div>
        {isAIConnected && (
          <div
            className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full
                       border-2 border-background animate-pulse"
          />
        )}
        <div
          className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100
                     transition-opacity pointer-events-none"
        >
          <div
            className="bg-card border border-border rounded-lg px-3 py-2
                       text-xs text-foreground whitespace-nowrap shadow-lg"
          >
            <div className="font-medium">AI Tutor</div>
            <div className="text-muted-foreground text-[0.65rem]">
              Press Ctrl+K to open
            </div>
          </div>
        </div>
      </div>
    </button>
  ) : null;

  const panel = showPanel
    ? createPortal(
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm
                        transition-opacity duration-300 pointer-events-auto
                        ${backdropOpacity}`}
            onClick={handleClose}
            aria-hidden="true"
          />
          {/* Panel */}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`AI Tutor for ${lessonTitle}`}
            className={`absolute inset-y-0 right-0 flex flex-col bg-background
                        border-l border-border shadow-2xl
                        transition-transform duration-300 ease-in-out
                        pointer-events-auto
                        w-full sm:w-[450px] md:w-[500px]
                        ${panelTranslate}
                        ${isMaximized ? 'sm:w-full md:w-full' : ''}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="size-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">
                    AI Tutor
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {lessonTitle}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-2 hover:bg-muted rounded-md transition-colors"
                  aria-label={isMaximized ? 'Minimize' : 'Maximize'}
                  title={isMaximized ? 'Minimize' : 'Maximize'}
                >
                  {isMaximized ? (
                    <Minimize2 className="size-4 text-muted-foreground" />
                  ) : (
                    <Maximize2 className="size-4 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={handleClose}
                  className="p-2 hover:bg-muted rounded-md transition-colors"
                  aria-label="Close AI Tutor (Esc)"
                  title="Close (Esc)"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Current section pill */}
            {currentSection && (
              <div
                className="px-4 py-1.5 bg-primary/5 border-b border-border
                           text-xs text-muted-foreground flex items-center gap-2"
              >
                <span className="text-primary">📍</span>
                <span className="truncate">
                  Viewing:{' '}
                  <span className="text-foreground font-medium">
                    {currentSection}
                  </span>
                </span>
              </div>
            )}

            {/* Chat */}
            <div className="flex-1 overflow-hidden">
              <SocraticChat
                context="global"
                lessonId={lessonId}
                lessonTitle={lessonTitle}
                lessonDescription={lessonDescription}
                lessonContent={lessonContent}
                moduleName={moduleName}
                tags={tags}
                currentSection={currentSection}
                sectionTitles={sectionTitles}
                prefilledMessage={prefilledMessage}
                placeholder="Ask about this lesson..."
                variant="panel"
              />
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {fab}
      {panel}
    </>
  );
}
