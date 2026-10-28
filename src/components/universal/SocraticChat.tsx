import { useState, useRef, useEffect } from 'react';
import { Send, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPromptsByContext, type PromptStarter } from '@/data/promptLibrary';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface SocraticChatProps {
  context?: string;
  lessonId?: string;
  placeholder?: string;
}

export function SocraticChat({ context = 'global', placeholder }: SocraticChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAiConnected] = useState(false); // Phase 2: always false
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const prompts = getPromptsByContext(context);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Phase 2: simulated AI response
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          "I'm the Socratic Tutor. I'll help guide you to the answer, but I won't give it away! (Note: Connect your AI provider in Settings to enable real responses.)",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    }, 1000);
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
    <div className="my-6 rounded-lg border border-border overflow-hidden bg-card shadow-sm">
      {/* No AI Connected Banner */}
      {!isAiConnected && (
        <div className="bg-yellow-50 dark:bg-yellow-950/30 border-b border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 text-xs p-2 px-4">
          ⚠️ AI not connected. Showing demo responses. Go to Settings to connect your API key or local Ollama.
        </div>
      )}

      {/* Section A: Chat Header */}
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 border-b border-border">
        <GraduationCap className="size-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">AI Tutor</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-yellow-400" />
          Connect AI in Settings to enable
        </span>
      </div>

      {/* Section B: Chat Message History */}
      <div
        role="log"
        aria-live="polite"
        className="h-[300px] overflow-y-auto p-4 flex flex-col gap-3 bg-background"
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
            <span className="text-3xl">💬</span>
            <p className="text-sm italic">
              Ask me anything about this lesson. I'll guide you, not give you answers.
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'rounded-lg p-3 max-w-[80%] text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-foreground'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Section C: Prompt Pills + Input Area */}
      <div className="border-t border-border p-3 bg-card">
        {/* Prompt Pills Row */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
          {prompts.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePromptClick(p)}
              aria-label={p.template}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border cursor-pointer whitespace-nowrap transition-colors',
                'border-slate-200 dark:border-slate-700',
                'hover:bg-slate-100 dark:hover:bg-slate-800',
                'text-foreground'
              )}
            >
              {p.icon && <span className="mr-1">{p.icon}</span>}
              {p.label}
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={placeholder || 'Ask a question or click a prompt starter above...'}
            aria-label="Chat message input"
            className={cn(
              'flex-1 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm',
              'resize-none focus:outline-none focus:ring-2 focus:ring-blue-500',
              'bg-background text-foreground',
              'max-h-[120px]'
            )}
          />
          <button
            type="button"
            onClick={sendMessage}
            aria-label="Send message"
            disabled={!input.trim()}
            className={cn(
              'bg-blue-500 hover:bg-blue-600 text-white rounded-lg p-3 transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
