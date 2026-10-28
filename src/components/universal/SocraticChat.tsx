import { useState, useRef, useEffect } from 'react';
import { Send, GraduationCap, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPromptsByContext, type PromptStarter } from '@/data/promptLibrary';
import { useSettingsStore } from '@/engine/settings';
import { streamChatCompletion, type ChatMessage as AIServiceMessage } from '@/engine/aiService';

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
}: SocraticChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { aiSettings } = useSettingsStore();
  const aiConnected = useSettingsStore((s) => s.isAIConnected);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const prompts = getPromptsByContext(context);

  // Auto-scroll only when a NEW message is added (by length)
  const lastCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > lastCountRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      lastCountRef.current = messages.length;
    } else if (messages.length > 0) {
      // Still scroll on streaming content update
      chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const clearConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
    setInput('');
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

    // Real AI call
    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Build lesson context for the AI
      const lessonContext = lessonTitle
        ? {
            title: lessonTitle,
            description: lessonDescription,
            content: lessonContent,
            module: moduleName,
            tags: tags,
            id: lessonId,
          }
        : undefined;

      // Convert chat messages to AI service format
      const aiMessages: AIServiceMessage[] = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await streamChatCompletion(
        aiMessages,
        aiSettings,
        controller.signal,
        lessonContext
      );

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;
          const data = trimmedLine.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullContent } : m
                )
              );
            }
          } catch {
            // ignore malformed SSE chunks
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, isStreaming: false } : m
        )
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User navigated away — do nothing
        return;
      }
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `❌ Error: ${errorMsg}. Please check your settings and try again.`,
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
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
        <div className="bg-yellow-50 dark:bg-yellow-950/30 border-b border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 text-xs p-2 px-4">
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
                onClick={clearConversation}
                disabled={isLoading}
                aria-label="Clear conversation"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted disabled:opacity-50"
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
                    : 'bg-slate-100 dark:bg-slate-800 text-foreground'
                )}
              >
                {msg.content ||
                  (msg.isStreaming ? (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Thinking...
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
            onClick={clearConversation}
            disabled={isLoading}
            aria-label="Clear conversation"
            className="mb-2 text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-muted disabled:opacity-50"
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
              disabled={isLoading}
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
            disabled={isLoading}
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
            onClick={sendMessage}
            aria-label="Send message"
            disabled={!input.trim() || isLoading}
            className={cn(
              'bg-blue-500 hover:bg-blue-600 text-white rounded-lg p-3 transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
