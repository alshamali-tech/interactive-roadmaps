import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X, Minimize2, Maximize2, Sparkles } from 'lucide-react';
import { useSettingsStore } from '@/engine/settings';
import { SocraticChat } from '@/components/universal/SocraticChat';

interface FloatingAITutorProps {
  lessonId: string;
  lessonTitle: string;
  lessonDescription?: string;
  lessonContent?: string;
  moduleName: string;
  tags: string[];
}

export function FloatingAITutor({
  lessonId,
  lessonTitle,
  lessonDescription,
  lessonContent,
  moduleName,
  tags,
}: FloatingAITutorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const isAIConnected = useSettingsStore((s) => s.isAIConnected);

  // Keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 group"
          aria-label="Open AI Tutor (Ctrl+K)"
          title="Open AI Tutor (Ctrl+K)"
        >
          <div className="relative">
            <div className="w-14 h-14 bg-primary hover:bg-primary/90 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95">
              <MessageCircle className="size-6 text-primary-foreground" />
            </div>
            {isAIConnected && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background animate-pulse" />
            )}
            <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground whitespace-nowrap shadow-lg">
                <div className="font-medium">AI Tutor</div>
                <div className="text-muted-foreground text-[0.65rem]">
                  Press Ctrl+K to open
                </div>
              </div>
            </div>
          </div>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen &&
        createPortal(
          <div
            className={`fixed z-50 transition-all duration-300 ${
              isMaximized
                ? 'inset-0'
                : 'inset-y-0 right-0 w-full sm:w-[450px] md:w-[500px]'
            }`}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <div className="absolute inset-y-0 right-0 w-full flex flex-col bg-background border-l border-border shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      AI Tutor
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {lessonTitle}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
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
                    onClick={() => setIsOpen(false)}
                    className="p-2 hover:bg-muted rounded-md transition-colors"
                    aria-label="Close AI Tutor (Esc)"
                    title="Close (Esc)"
                  >
                    <X className="size-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Chat Content */}
              <div className="flex-1 overflow-hidden">
                <SocraticChat
                  context="global"
                  lessonId={lessonId}
                  lessonTitle={lessonTitle}
                  lessonDescription={lessonDescription}
                  lessonContent={lessonContent}
                  moduleName={moduleName}
                  tags={tags}
                  placeholder="Ask about this lesson..."
                  variant="panel"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
