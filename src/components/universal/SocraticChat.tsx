import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Square, Trash2, Clock } from 'lucide-react';
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
  type MessageMetadata,
} from '@/engine/chatHistory';
import {
  type ChatMode,
  type DifficultyLevel,
  getPersonaConfig,
  buildSystemPrompt,
} from '@/engine/chatPersona';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  metadata?: MessageMetadata;
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
  /** Chat mode: tutor (default), interview, or challenge */
  mode?: ChatMode;
  /** Topic for interview mode (required when mode='interview') */
  topic?: string;
  /** Difficulty level for interview/challenge modes */
  difficulty?: DifficultyLevel;
  /** Time limit in minutes for interview/challenge modes */
  timeLimit?: number;
  /** Maximum questions for interview mode (default: 5) */
  maxQuestions?: number;
}

/**
 * Parse metadata from AI response content
 * Extracts JSON from markdown code blocks and validates structure based on mode
 */
export const parseMetadataFromContent = (
  content: string,
  mode: ChatMode
): MessageMetadata | undefined => {
  if (mode === 'tutor') return undefined;

  // Try to extract JSON from markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      // Validate structure based on mode
      if (mode === 'interview' && typeof parsed.score === 'number' && parsed.feedback) {
        return {
          score: parsed.score,
          feedback: parsed.feedback,
        };
      }
      if (mode === 'challenge' && typeof parsed.correct === 'boolean' && parsed.explanation) {
        return {
          correct: parsed.correct,
          explanation: parsed.explanation,
        };
      }
    } catch {
      // JSON parsing failed, no metadata
    }
  }
  return undefined;
};

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
  mode = 'tutor',
  topic,
  difficulty = 'mid',
  timeLimit,
  maxQuestions = 5,
}: SocraticChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  // Track whether we've loaded persisted conversation for this lesson
  const loadedRef = useRef(false);

  // Get persona configuration for current mode
  const persona = useMemo(() => getPersonaConfig(mode), [mode]);

  // Timer state for interview/challenge modes
  const [timeRemaining, setTimeRemaining] = useState<number | null>(
    timeLimit ? timeLimit * 60 : null
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aiConnected = useSettingsStore((s) => s.isAIConnected);
  const { streamingText, isLoading, error, startStream, abortStream } = useAIStream();

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Start countdown timer when in interview/challenge mode with timeLimit
  useEffect(() => {
    if (timeLimit && (mode === 'interview' || mode === 'challenge')) {
      setTimeRemaining(timeLimit * 60);
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev === null || prev <= 0) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [timeLimit, mode]);

  // Format time remaining as MM:SS
  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
          metadata: m.metadata,
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
        metadata: m.metadata,
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
          // Parse metadata from the completed message
          const metadata = parseMetadataFromContent(lastMsg.content, mode);
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, isStreaming: false, metadata },
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
  }, [isLoading, error, mode]);

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

    let updatedMessages = [...messages, userMessage];

    // Add system message on first send if not already present
    if (messages.length === 0 || messages[0].role !== 'system') {
      const systemPrompt = buildSystemPrompt(mode, {
        lessonTitle,
        topic,
        difficulty,
        maxQuestions,
      });
      const systemMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: systemPrompt,
        timestamp: new Date(),
      };
      updatedMessages = [systemMessage, ...updatedMessages];
    }

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
          prev.map((m) => {
            if (m.id === assistantId) {
              let content = '';
              let metadata: MessageMetadata | undefined;

              if (mode === 'tutor') {
                content = "I'm the Socratic Tutor. I'll help guide you to the answer, but I won't give it away! (Note: Connect your AI provider in Settings to enable real responses.)";
              } else if (mode === 'interview') {
                content = "Great answer! Let me evaluate it.\n\n```json\n{\n  \"score\": 4,\n  \"feedback\": {\n    \"strengths\": \"Clear explanation\",\n    \"improvements\": \"Could add more detail\",\n    \"correct\": true\n  }\n}\n```\n\n(Note: Connect your AI provider in Settings to enable real responses.)";
                metadata = {
                  score: 4,
                  feedback: {
                    strengths: 'Clear explanation',
                    improvements: 'Could add more detail',
                    correct: true,
                  },
                };
              } else if (mode === 'challenge') {
                content = "Let me evaluate your answer.\n\n```json\n{\n  \"correct\": true,\n  \"explanation\": \"Your understanding is correct!\"\n}\n```\n\n(Note: Connect your AI provider in Settings to enable real responses.)";
                metadata = {
                  correct: true,
                  explanation: 'Your understanding is correct!',
                };
              }

              return {
                ...m,
                content,
                metadata,
                isStreaming: false,
              };
            }
            return m;
          })
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
          <span className="text-lg">{persona.icon}</span>
          <span className="text-sm font-semibold text-foreground">{persona.title}</span>
          {lessonTitle && mode === 'tutor' && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              · {lessonTitle}
            </span>
          )}
          {mode === 'interview' && topic && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              · {topic}
            </span>
          )}
          {persona.behavior.showTimer && timeRemaining !== null && (
            <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
              <Clock className="size-3" />
              {formatTime(timeRemaining)}
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
            <span className="text-3xl">{persona.icon}</span>
            <p className="text-sm italic">
              {mode === 'tutor' && 'Ask me anything about this lesson. I\'ll guide you, not give you answers.'}
              {mode === 'interview' && `Ready for your mock interview on ${topic || 'the topic'}. Answer my questions to receive scored feedback.`}
              {mode === 'challenge' && 'Test your knowledge with a focused question. Answer to receive immediate feedback.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex flex-col gap-1">
              <div
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
                      : persona.colorTheme.secondary + ' text-foreground'
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
              
              {/* Render metadata for interview/challenge modes */}
              {msg.metadata && !msg.isStreaming && (
                <div className="flex justify-start">
                  {mode === 'interview' && msg.metadata.score !== undefined && (
                    <div className="ml-2 mt-1 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-purple-700 dark:text-purple-300">
                          Score: {msg.metadata.score}/5
                        </span>
                      </div>
                      {msg.metadata.feedback && (
                        <div className="space-y-1 text-purple-900 dark:text-purple-100">
                          {msg.metadata.feedback.strengths && (
                            <div>
                              <span className="font-medium">✓ Strengths: </span>
                              {msg.metadata.feedback.strengths}
                            </div>
                          )}
                          {msg.metadata.feedback.improvements && (
                            <div>
                              <span className="font-medium">⚡ Improvements: </span>
                              {msg.metadata.feedback.improvements}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {mode === 'challenge' && msg.metadata.correct !== undefined && (
                    <div
                      className={cn(
                        'ml-2 mt-1 px-3 py-2 rounded-lg border text-xs',
                        msg.metadata.correct
                          ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                      )}
                    >
                      <div
                        className={cn(
                          'font-semibold mb-1',
                          msg.metadata.correct
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-red-700 dark:text-red-300'
                        )}
                      >
                        {msg.metadata.correct ? '✓ Correct' : '✗ Incorrect'}
                      </div>
                      {msg.metadata.explanation && (
                        <div className="text-gray-700 dark:text-gray-300">
                          {msg.metadata.explanation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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
        {/* Only show prompt pills in tutor mode */}
        {mode === 'tutor' && (
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
        )}

        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              placeholder ||
              (mode === 'tutor'
                ? 'Ask a question or click a prompt starter above...'
                : mode === 'interview'
                ? 'Type your answer to the interview question...'
                : 'Type your answer to the challenge...')
            }
            aria-label="Chat message input"
            disabled={isLoading || !aiConnected}
            className={cn(
              'flex-1 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm',
              'resize-none focus:outline-none focus:ring-2',
              mode === 'tutor'
                ? 'focus:ring-blue-500'
                : mode === 'interview'
                ? 'focus:ring-purple-500'
                : 'focus:ring-orange-500',
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
                : cn(
                    'text-white',
                    mode === 'tutor'
                      ? 'bg-blue-500 hover:bg-blue-600'
                      : mode === 'interview'
                      ? 'bg-purple-500 hover:bg-purple-600'
                      : 'bg-orange-500 hover:bg-orange-600'
                  ),
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
