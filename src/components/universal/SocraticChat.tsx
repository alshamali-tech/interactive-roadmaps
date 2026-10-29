import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Square, GraduationCap, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getPromptsByContext,
  getLessonPrompts,
  type PromptStarter,
} from '@/data/promptLibrary';
import { useSettingsStore } from '@/engine/settings';
import { useAIStream } from '@/hooks/useAIStream';
import type { ChatMessage as AIServiceMessage } from '@/engine/aiService';
import {
  loadConversation,
  saveConversation,
  clearConversation,
  type StoredMessage,
} from '@/engine/chatHistory';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface SocraticChatProps {
  context?: string;
  lessonId?: string;
  lessonTitle?: string;
  lessonDescription?: string;
  lessonContent?: string;
  moduleName?: string;
  tags?: string[];
  placeholder?: string;
  variant?: 'card' | 'panel';
  /** Current H2 section the user is viewing (from IntersectionObserver) */
  currentSection?: string;
  /** All H2 titles — used to show roadmap prompt when currentSection is unknown */
  sectionTitles?: string[];
  /** Pre-fill the input and focus it (e.g., from a contextual "Ask AI" click) */
  prefilledMessage?: string;
}

export function SocraticChat({
  context = 'global',
  lessonId,
  lessonTitle,
  lessonDescription,
  lessonContent,
  moduleName,
  tags,
  placeholder,
  variant = 'card',
  currentSection,
  sectionTitles,
  prefilledMessage,
}: SocraticChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  // Track whether we've loaded persisted conversation for this lesson
  const loadedRef = useRef(false);

  const aiConnected = useSettingsStore((s) => s.isAIConnected);
  const { streamingText, isLoading, error, startStream, abortStream } = useAIStream();

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Pick prompts: lesson-aware if possible, otherwise context-based ────
  const prompts: PromptStarter[] = useMemo(() => {
    if (lessonTitle || currentSection || sectionTitles) {
      return getLessonPrompts({
        lessonTitle,
        currentSection,
        sectionTitles,
      });
    }
    return getPromptsByContext(context);
  }, [lessonTitle, currentSection, sectionTitles, context]);

  // ── Load persisted conversation on mount / lesson change ───────────────
  useEffect(() => {
    if (!lessonId) {
      loadedRef.current = true;
      return;
    }
    const stored = loadConversation(lessonId);
    if (stored.length > 0) {
      setMessages(
        stored.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp),
        }))
      );
    }
    loadedRef.current = true;
  }, [lessonId]);

  // ── Persist messages whenever they change ──────────────────────────────
  useEffect(() => {
    if (!loadedRef.current || !lessonId) return;
    const toStore: StoredMessage[] = messages
      .filter((m) => m.role !== 'system' && !m.isStreaming)
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp.getTime(),
      }));
    saveConversation(lessonId, toStore);
  }, [messages, lessonId]);

  // ── Handle prefilled message from parent ──────────────────────────────
  useEffect(() => {
    if (prefilledMessage) {
      setInput(prefilledMessage);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select?.();
      }, 200);
    }
  }, [prefilledMessage]);

  // ── Auto-scroll when new messages arrive ──────────────────────────────
  const lastCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > lastCountRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      lastCountRef.current = messages.length;
    } else if (messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  // ── Auto-resize textarea ──────────────────────────────────────────────
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // ── Update streaming message content as it arrives ────────────────────
  useEffect(() => {
    if (isLoading && streamingText) {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.isStreaming) {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, content: streamingText },
          ];
        }
        return prev;
      });
    }
  }, [streamingText, isLoading]);

  // ── Finalize streaming message when done ──────────────────────────────
  useEffect(() => {
    if (!isLoading) {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.isStreaming) {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, isStreaming: false },
          ];
        }
        return prev;
      });

      // If there was an error, add it as a system message
      if (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'system',
            content: `⚠️ ${error}`,
            timestamp: new Date(),
          },
        ]);
      }
    }
  }, [isLoading, error]);

  const doClear = () => {
    abortStream();
    setMessages([]);
    setInput('');
    if (lessonId) clearConversation(lessonId);
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');

    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // Fallback: demo response when AI not connected
    if (!aiConnected) {
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "I'm the Socratic Tutor. I'll help guide you to the answer, but I won't give it away! (Note: Connect your AI provider in Settings to enable real responses.)",
                  isStreaming: false,
                }
              : m
          )
        );
      }, 1000);
      return;
    }

    // Build lesson context if available
    const lessonContext = lessonTitle
      ? {
          title: lessonTitle,
          description: lessonDescription,
          content: lessonContent,
          module: moduleName,
          tags: tags,
          id: lessonId,
          currentSection,
        }
      : undefined;

    // Convert to AI service message format
    const aiMessages: AIServiceMessage[] = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Start streaming
    await startStream(aiMessages, lessonContext);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handlePromptClick = (prompt: PromptStarter) => {
    setInput(prompt.template);
    textareaRef.current?.focus();
  };

  return (
    <div
      className={cn(
        variant === 'card'
          ? 'my-6 rounded-lg border border-border overflow-hidden bg-card shadow-sm'
          : 'h-full flex flex-col bg-card'
      )}
    >
      {/* No AI Connected Banner */}
      {!aiConnected && (
        <div
          className="bg-yellow-50 dark:bg-yellow-950/30 border-b
                     border-yellow-200 dark:border-yellow-800
                     text-yellow-800 dark:text-yellow-200 text-xs p-2 px-4"
        >
          ⚠️ AI not connected. Showing demo responses. Go to Settings to connect
          your API key or local Ollama.
        </div>
      )}

      {/* Chat Header - Only show in card variant */}
      {variant === 'card' && (
        <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
          <GraduationCap className="size-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">AI Tutor</span>
          {lessonTitle && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              · {lessonTitle}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={doClear}
                disabled={isLoading}
                aria-label="Clear conversation"
                className="text-xs text-muted-foreground hover:text-foreground
                           transition-colors inline-flex items-center gap-1
                           px-2 py-1 rounded hover:bg-muted disabled:opacity-50"
              >
                <Trash2 className="size-3" />
                Clear
              </button>
            )}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  'size-2 rounded-full',
                  aiConnected ? 'bg-green-500' : 'bg-yellow-400'
                )}
              />
              {aiConnected ? 'Connected' : 'Connect AI in Settings'}
            </span>
          </div>
        </div>
      )}

      {/* Message History */}
      <div
        role="log"
        aria-live="polite"
        className={cn(
          'overflow-y-auto p-4 flex flex-col gap-3 bg-background',
          variant === 'card' ? 'h-[300px]' : 'flex-1'
        )}
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
            <span className="text-3xl">💬</span>
            <p className="text-sm italic">
              Ask me anything about this lesson. I'll guide you, not give you
              answers.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'rounded-lg p-3 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : msg.role === 'system'
                    ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                    : 'bg-slate-100 dark:bg-slate-800 text-foreground'
                )}
              >
                {msg.content ||
                  (msg.isStreaming ? (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="inline-block w-2 h-4 bg-current animate-pulse" />
                    </span>
                  ) : (
                    ''
                  ))}
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Prompt Pills + Input */}
      <div className="border-t border-border p-3 bg-card">
        {messages.length > 0 && variant === 'panel' && (
          <button
            onClick={doClear}
            disabled={isLoading}
            aria-label="Clear conversation"
            className="mb-2 text-xs text-muted-foreground hover:text-foreground
                       transition-colors inline-flex items-center gap-1
                       px-2 py-1 rounded hover:bg-muted disabled:opacity-50"
          >
            <Trash2 className="size-3" />
            Clear conversation
          </button>
        )}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
          {prompts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePromptClick(p)}
              disabled={isLoading || !aiConnected}
              aria-label={p.template}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border cursor-pointer whitespace-nowrap transition-colors',
                'border-slate-200 dark:border-slate-700',
                'hover:bg-slate-100 dark:hover:bg-slate-800',
                'text-foreground',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {p.icon && <span className="mr-1">{p.icon}</span>}
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              placeholder || 'Ask a question or click a prompt starter above...'
            }
            aria-label="Chat message input"
            disabled={isLoading || !aiConnected}
            className={cn(
              'flex-1 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm',
              'resize-none focus:outline-none focus:ring-2 focus:ring-blue-500',
              'bg-background text-foreground',
              'max-h-[120px]',
              'disabled:opacity-60'
            )}
          />
          <button
            type="button"
            onClick={isLoading ? abortStream : sendMessage}
            aria-label={isLoading ? 'Stop generation' : 'Send message'}
            disabled={!isLoading && (!input.trim() || !aiConnected)}
            className={cn(
              'rounded-lg p-3 transition-colors',
              isLoading
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <Square className="size-4 fill-current" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
