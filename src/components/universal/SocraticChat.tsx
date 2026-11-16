import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Square, Trash2, Clock, CheckCircle2, XCircle, RotateCcw, ArrowRight, Award, Pause, Play, SkipForward, Flag, Download, Star, AlertCircle, BookOpen } from 'lucide-react';
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
import {
  buildChallengeEvaluationPrompt,
  parseChallengeEvaluation,
  type ChallengeEvaluation,
} from '@/engine/challengePrompts';


interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  metadata?: MessageMetadata;
}

export interface ChallengeQuestion {
  question: string;
  modelAnswer: string;
}

/** Interview-specific metadata for tracking progress and scores */
export interface InterviewState {
  currentQuestion: number;
  scores: number[];
  totalQuestions: number;
  isComplete: boolean;
  finalEvaluation?: {
    overallScore: number;
    strongestAreas: string[];
    areasForImprovement: string[];
    recommendedTopics: string[];
    hiringRecommendation: string;
    justification: string;
  };
}

/** Extended metadata for interview mode */
export interface InterviewMetadata {
  score: number;
  justification?: string;
  strengths?: string[];
  gaps?: string[];
  followUp?: string;
  hint?: string | null;
  isFinalEvaluation?: boolean;
  overallScore?: number;
  strongestAreas?: string[];
  areasForImprovement?: string[];
  recommendedTopics?: string[];
  hiringRecommendation?: string;
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
  /** Array of challenge questions for challenge mode */
  challengeQuestions?: ChallengeQuestion[];
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
      
      // Check for final evaluation (interview mode)
      if (mode === 'interview' && typeof parsed.overallScore === 'number' && parsed.hiringRecommendation) {
        return {
          isFinalEvaluation: true,
          overallScore: parsed.overallScore,
          strongestAreas: parsed.strongestAreas || [],
          areasForImprovement: parsed.areasForImprovement || [],
          recommendedTopics: parsed.recommendedTopics || [],
          hiringRecommendation: parsed.hiringRecommendation,
          justification: parsed.justification || '',
        };
      }
      
      // Validate structure based on mode
      if (mode === 'interview' && typeof parsed.score === 'number') {
        return {
          score: parsed.score,
          feedback: {
            strengths: parsed.strengths?.join?.('. ') || parsed.feedback?.strengths,
            improvements: parsed.gaps?.join?.('. ') || parsed.feedback?.improvements,
            correct: parsed.feedback?.correct,
            followUp: parsed.followUp,
          },
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
  challengeQuestions,
}: SocraticChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  // Track whether we've loaded persisted conversation for this lesson
  const loadedRef = useRef(false);

  // ── Challenge Mode State ──────────────────────────────────────────────
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeRetries, setChallengeRetries] = useState(0);
  const [challengeSubmitted, setChallengeSubmitted] = useState(false);
  const [challengeEvaluating, setChallengeEvaluating] = useState(false);
  const [challengeEvaluation, setChallengeEvaluation] = useState<ChallengeEvaluation | null>(null);
  const [challengeInput, setChallengeInput] = useState('');
  const MAX_CHALLENGE_RETRIES = 2;

  // ── Interview Mode State ──────────────────────────────────────────────
  const [interviewState, setInterviewState] = useState<InterviewState>({
    currentQuestion: 1,
    scores: [],
    totalQuestions: maxQuestions,
    isComplete: false,
  });
  const [timerPaused, setTimerPaused] = useState(false);

  // Get persona configuration for current mode
  const persona = useMemo(() => getPersonaConfig(mode), [mode]);

  // Timer state for interview/challenge modes
  const [timeRemaining, setTimeRemaining] = useState<number | null>(
    timeLimit ? timeLimit * 60 : null
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aiConnected = useSettingsStore((s) => s.isAIConnected);
  const aiSettings = useSettingsStore((s) => s.aiSettings);
  const { streamingText, isLoading, error, startStream, abortStream } = useAIStream();

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Start countdown timer when in interview/challenge mode with timeLimit
  useEffect(() => {
    if (timeLimit && (mode === 'interview' || mode === 'challenge') && !timerPaused) {
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
  }, [timeLimit, mode, timerPaused]);

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
          
          // Update interview state based on metadata
          if (mode === 'interview' && metadata) {
            // Track score for regular question responses
            if (metadata.score !== undefined && !metadata.isFinalEvaluation) {
              setInterviewState((prevState) => ({
                ...prevState,
                scores: [...prevState.scores, metadata.score!],
                currentQuestion: prevState.currentQuestion + 1,
              }));
            }
            // Track final evaluation when interview is complete
            if (metadata.isFinalEvaluation) {
              setInterviewState((prevState) => ({
                ...prevState,
                isComplete: true,
                finalEvaluation: {
                  overallScore: metadata.overallScore || 0,
                  strongestAreas: metadata.strongestAreas || [],
                  areasForImprovement: metadata.areasForImprovement || [],
                  recommendedTopics: metadata.recommendedTopics || [],
                  hiringRecommendation: metadata.hiringRecommendation || '',
                  justification: metadata.justification || '',
                },
              }));
            }
          }
          
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
    // Reset interview state
    if (mode === 'interview') {
      setInterviewState({
        currentQuestion: 1,
        scores: [],
        totalQuestions: maxQuestions,
        isComplete: false,
      });
      setTimerPaused(false);
    }
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

  // ── Interview Mode Functions ──────────────────────────────────────────
  const handleSkipQuestion = () => {
    // Add a score of 1 for skipped question and move to next
    setInterviewState((prev) => ({
      ...prev,
      scores: [...prev.scores, 1],
      currentQuestion: prev.currentQuestion + 1,
    }));
    setInput("I don't know the answer to this question.");
    textareaRef.current?.focus();
  };

  const handleEndInterviewEarly = async () => {
    // Trigger final evaluation with current scores
    setInterviewState((prev) => ({
      ...prev,
      isComplete: true,
    }));
    // Send a message requesting final evaluation
    setInput('Please provide the final evaluation based on the questions answered so far.');
    setTimeout(() => sendMessage(), 100);
  };

  const handleToggleTimer = () => {
    setTimerPaused((prev) => !prev);
  };

  const handleDownloadEvaluation = () => {
    if (!interviewState.finalEvaluation) return;

    const eval_ = interviewState.finalEvaluation;
    const avgScore = interviewState.scores.length > 0
      ? (interviewState.scores.reduce((a, b) => a + b, 0) / interviewState.scores.length).toFixed(1)
      : 'N/A';

    const markdown = `# Interview Evaluation Report

**Topic:** ${topic || 'General Software Engineering'}
**Difficulty:** ${difficulty}
**Date:** ${new Date().toLocaleDateString()}

---

## Overall Score: ${eval_.overallScore}/100

**Hiring Recommendation:** ${eval_.hiringRecommendation}

${eval_.justification}

---

## Question Scores

Average Score: ${avgScore}/5

Individual Scores: ${interviewState.scores.join(', ') || 'None'}

---

## Strongest Areas

${eval_.strongestAreas.map((area) => `- ${area}`).join('\n')}

---

## Areas for Improvement

${eval_.areasForImprovement.map((area) => `- ${area}`).join('\n')}

---

## Recommended Topics for Study

${eval_.recommendedTopics.map((topic) => `- ${topic}`).join('\n')}

---

*Generated by EngineerAcademy Interview Mode*
`;

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-evaluation-${topic?.toLowerCase().replace(/\s+/g, '-') || 'report'}-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Challenge Mode Functions ──────────────────────────────────────────
  const currentChallenge = challengeQuestions?.[challengeIndex];
  const hasMultipleChallenges = (challengeQuestions?.length ?? 0) > 1;
  const isLastChallenge = challengeIndex === (challengeQuestions?.length ?? 1) - 1;

  const submitChallengeAnswer = async () => {
    if (!challengeInput.trim() || challengeEvaluating || !currentChallenge) return;

    setChallengeSubmitted(true);
    setChallengeEvaluating(true);

    const userAnswer = challengeInput.trim();
    const evaluationPrompt = buildChallengeEvaluationPrompt(difficulty);

    const aiMessages: AIServiceMessage[] = [
      { role: 'system', content: evaluationPrompt },
      {
        role: 'user',
        content: `Question: ${currentChallenge.question}\n\nMy answer: ${userAnswer}\n\nModel answer (for your reference, do not reveal): ${currentChallenge.modelAnswer}\n\nPlease evaluate my answer.`,
      },
    ];

    // Fallback: demo evaluation when AI not connected
    if (!aiConnected) {
      setTimeout(() => {
        const isCorrect = Math.random() > 0.5;
        setChallengeEvaluation({
          correct: isCorrect,
          score: isCorrect ? 85 : 35,
          explanation: isCorrect
            ? 'Your answer demonstrates good understanding! (Demo evaluation — connect AI for real feedback)'
            : 'Your answer is partially correct but missing key details. (Demo evaluation — connect AI for real feedback)',
          modelAnswer: currentChallenge.modelAnswer,
        });
        setChallengeEvaluating(false);
      }, 1000);
      return;
    }

    // Use AI service for real evaluation
    try {
      const { generateChatCompletion } = await import('@/engine/aiService');
      const response = await generateChatCompletion(aiMessages, aiSettings);
      const evaluation = parseChallengeEvaluation(response);

      if (evaluation) {
        setChallengeEvaluation(evaluation);
      } else {
        // Fallback if parsing fails
        setChallengeEvaluation({
          correct: false,
          score: 50,
          explanation: 'Could not parse evaluation. Your answer has been received.',
          modelAnswer: currentChallenge.modelAnswer,
        });
      }
    } catch {
      setChallengeEvaluation({
        correct: false,
        score: 0,
        explanation: 'Evaluation failed. Please try again.',
        modelAnswer: currentChallenge.modelAnswer,
      });
    }

    setChallengeEvaluating(false);
  };

  const handleTryAgain = () => {
    if (challengeRetries < MAX_CHALLENGE_RETRIES) {
      setChallengeRetries((prev) => prev + 1);
      setChallengeSubmitted(false);
      setChallengeEvaluation(null);
      setChallengeInput('');
    }
  };

  const handleNextChallenge = () => {
    if (!isLastChallenge && challengeQuestions) {
      setChallengeIndex((prev) => prev + 1);
      setChallengeRetries(0);
      setChallengeSubmitted(false);
      setChallengeEvaluation(null);
      setChallengeInput('');
    }
  };

  const handleChallengeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !challengeSubmitted) {
      e.preventDefault();
      submitChallengeAnswer();
    }
  };

  // ── Challenge Mode UI ─────────────────────────────────────────────────
  if (mode === 'challenge' && challengeQuestions && challengeQuestions.length > 0) {
    return (
      <div
        className={cn(
          'my-6 rounded-lg border-2 border-purple-300 dark:border-purple-700 overflow-hidden bg-card shadow-md',
          variant === 'panel' && 'h-full flex flex-col'
        )}
      >
        {/* Challenge Header */}
        <div className="flex items-center gap-2 bg-purple-50 dark:bg-purple-950/40 px-4 py-3 border-b-2 border-purple-200 dark:border-purple-800">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-600 text-white text-xs font-bold">
            <Award className="size-3" />
            CHALLENGE
          </span>
          <span className="text-sm font-semibold text-foreground">
            Question {challengeIndex + 1} of {challengeQuestions.length}
          </span>
          {persona.behavior.showTimer && timeRemaining !== null && (
            <span className="flex items-center gap-1 text-xs font-mono text-purple-700 dark:text-purple-300 ml-auto">
              <Clock className="size-3" />
              {formatTime(timeRemaining)}
            </span>
          )}
        </div>

        {/* Challenge Question Card */}
        <div className="p-4 bg-background">
          <div className="rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-4">
            <p className="text-sm font-medium text-foreground leading-relaxed">
              {currentChallenge?.question}
            </p>
          </div>

          {/* Answer Input */}
          {!challengeSubmitted && (
            <div className="mt-4 flex flex-col gap-2">
              <textarea
                value={challengeInput}
                onChange={(e) => setChallengeInput(e.target.value)}
                onKeyDown={handleChallengeKeyDown}
                rows={3}
                placeholder="Type your answer here..."
                aria-label="Challenge answer input"
                disabled={challengeEvaluating || !aiConnected}
                className="w-full rounded-lg border border-purple-300 dark:border-purple-700 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 bg-background text-foreground disabled:opacity-60"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {challengeRetries > 0 && `Attempt ${challengeRetries + 1}/${MAX_CHALLENGE_RETRIES + 1}`}
                </span>
                <button
                  type="button"
                  onClick={submitChallengeAnswer}
                  disabled={!challengeInput.trim() || challengeEvaluating || !aiConnected}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {challengeEvaluating ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Evaluating...
                    </>
                  ) : (
                    <>
                      Submit Answer
                      <Send className="size-3" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Evaluation Results */}
          {challengeSubmitted && challengeEvaluation && (
            <div className="mt-4 space-y-3">
              {/* User's Answer */}
              <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                  Your Answer:
                </div>
                <p className="text-sm text-blue-900 dark:text-blue-100">{challengeInput}</p>
              </div>

              {/* Score and Correctness */}
              <div
                className={cn(
                  'rounded-lg p-4 border-2',
                  challengeEvaluation.correct
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-700'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  {challengeEvaluation.correct ? (
                    <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="size-5 text-red-600 dark:text-red-400" />
                  )}
                  <span
                    className={cn(
                      'font-bold text-lg',
                      challengeEvaluation.correct
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    )}
                  >
                    {challengeEvaluation.correct ? 'Correct!' : 'Incorrect'}
                  </span>
                  <span
                    className={cn(
                      'ml-auto text-sm font-mono font-bold px-2 py-0.5 rounded',
                      challengeEvaluation.correct
                        ? 'bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200'
                        : 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-200'
                    )}
                  >
                    {challengeEvaluation.score}/100
                  </span>
                </div>
                <p
                  className={cn(
                    'text-sm leading-relaxed',
                    challengeEvaluation.correct
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-red-800 dark:text-red-200'
                  )}
                >
                  {challengeEvaluation.explanation}
                </p>
              </div>

              {/* Model Answer */}
              <div className="rounded-lg p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Model Answer:
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                  {challengeEvaluation.modelAnswer}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                {!challengeEvaluation.correct && challengeRetries < MAX_CHALLENGE_RETRIES && (
                  <button
                    type="button"
                    onClick={handleTryAgain}
                    className="px-4 py-2 rounded-lg border-2 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 text-sm font-medium hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors inline-flex items-center gap-2"
                  >
                    <RotateCcw className="size-3" />
                    Try Again ({MAX_CHALLENGE_RETRIES - challengeRetries} left)
                  </button>
                )}
                {hasMultipleChallenges && !isLastChallenge && (
                  <button
                    type="button"
                    onClick={handleNextChallenge}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
                  >
                    Next Challenge
                    <ArrowRight className="size-3" />
                  </button>
                )}
                {isLastChallenge && (
                  <span className="text-sm text-muted-foreground italic">
                    ✓ All challenges complete!
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Evaluating State */}
          {challengeSubmitted && challengeEvaluating && !challengeEvaluation && (
            <div className="mt-4 flex items-center justify-center py-8">
              <div className="flex items-center gap-3 text-purple-600 dark:text-purple-400">
                <span className="inline-block w-4 h-4 border-2 border-purple-600 dark:border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Evaluating your answer...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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
          {mode === 'interview' && difficulty && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              {difficulty}
            </span>
          )}
          {persona.behavior.showTimer && timeRemaining !== null && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-mono',
                timeRemaining < 120 && mode === 'interview'
                  ? 'text-red-600 dark:text-red-400 animate-pulse'
                  : 'text-muted-foreground'
              )}
            >
              <Clock className="size-3" />
              {formatTime(timeRemaining)}
              {mode === 'interview' && (
                <button
                  type="button"
                  onClick={handleToggleTimer}
                  aria-label={timerPaused ? 'Resume timer' : 'Pause timer'}
                  className="ml-1 p-0.5 rounded hover:bg-muted transition-colors"
                >
                  {timerPaused ? <Play className="size-3" /> : <Pause className="size-3" />}
                </button>
              )}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {mode === 'interview' && messages.length > 0 && !interviewState.isComplete && (
              <>
                <button
                  onClick={handleSkipQuestion}
                  disabled={isLoading}
                  aria-label="Skip question"
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300
                             transition-colors inline-flex items-center gap-1
                             px-2 py-1 rounded hover:bg-purple-50 dark:hover:bg-purple-950/30 disabled:opacity-50"
                >
                  <SkipForward className="size-3" />
                  Skip
                </button>
                <button
                  onClick={handleEndInterviewEarly}
                  disabled={isLoading}
                  aria-label="End interview early"
                  className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300
                             transition-colors inline-flex items-center gap-1
                             px-2 py-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50"
                >
                  <Flag className="size-3" />
                  End Early
                </button>
              </>
            )}
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

      {/* Interview Progress Bar */}
      {mode === 'interview' && messages.length > 0 && (
        <div className="px-4 py-2 bg-purple-50 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
              Question {Math.min(interviewState.currentQuestion, interviewState.totalQuestions)} of {interviewState.totalQuestions}
            </span>
            <span className="text-xs text-purple-600 dark:text-purple-400">
              Avg: {interviewState.scores.length > 0 ? (interviewState.scores.reduce((a, b) => a + b, 0) / interviewState.scores.length).toFixed(1) : '—'}/5
            </span>
          </div>
          <div className="w-full h-2 bg-purple-200 dark:bg-purple-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-500"
              style={{ width: `${(interviewState.scores.length / interviewState.totalQuestions) * 100}%` }}
            />
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
                    <div className="ml-2 mt-2 w-full max-w-[85%] space-y-2">
                      {/* Score Badge */}
                      <div
                        className={cn(
                          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold',
                          msg.metadata.score >= 4
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                            : msg.metadata.score >= 3
                            ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                            : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                        )}
                      >
                        <Star className="size-4 fill-current" />
                        {msg.metadata.score}/5
                      </div>

                      {/* Feedback Card */}
                      {msg.metadata.feedback && (
                        <div className="rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 p-4 space-y-3">
                          {msg.metadata.feedback.strengths && (
                            <div className="flex gap-2">
                              <span className="text-lg flex-shrink-0">💪</span>
                              <div>
                                <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">
                                  Strengths
                                </div>
                                <p className="text-sm text-foreground mt-0.5">
                                  {msg.metadata.feedback.strengths}
                                </p>
                              </div>
                            </div>
                          )}
                          {msg.metadata.feedback.improvements && (
                            <div className="flex gap-2">
                              <span className="text-lg flex-shrink-0">🔍</span>
                              <div>
                                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                                  Areas to Improve
                                </div>
                                <p className="text-sm text-foreground mt-0.5">
                                  {msg.metadata.feedback.improvements}
                                </p>
                              </div>
                            </div>
                          )}
                          {msg.metadata.feedback.followUp && (
                            <div className="flex gap-2 pt-2 border-t border-purple-200 dark:border-purple-800">
                              <span className="text-lg flex-shrink-0">➡️</span>
                              <div>
                                <div className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide">
                                  Next Question
                                </div>
                                <p className="text-sm text-foreground mt-0.5">
                                  {msg.metadata.feedback.followUp}
                                </p>
                              </div>
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
        
        {/* Final Evaluation Card (Interview Mode) */}
        {mode === 'interview' && interviewState.isComplete && interviewState.finalEvaluation && (
          <div className="rounded-lg border-2 border-purple-300 dark:border-purple-700 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/20 p-6 space-y-4 shadow-lg my-4">
            <div className="flex items-center gap-3">
              <Award className="size-6 text-purple-600 dark:text-purple-400" />
              <h3 className="text-lg font-bold text-purple-900 dark:text-purple-100">
                Interview Complete
              </h3>
            </div>
            
            {/* Overall Score */}
            <div className="text-center py-4">
              <div className="text-5xl font-bold text-purple-700 dark:text-purple-300">
                {interviewState.finalEvaluation.overallScore}
              </div>
              <div className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                / 100
              </div>
            </div>
            
            {/* Hiring Recommendation Badge */}
            <div className="flex justify-center">
              <span
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-bold',
                  interviewState.finalEvaluation.hiringRecommendation === 'Strong Hire'
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                    : interviewState.finalEvaluation.hiringRecommendation === 'Hire'
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : interviewState.finalEvaluation.hiringRecommendation === 'Borderline'
                    ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                    : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                )}
              >
                {interviewState.finalEvaluation.hiringRecommendation}
              </span>
            </div>
            
            {/* Justification */}
            {interviewState.finalEvaluation.justification && (
              <p className="text-sm text-foreground text-center italic">
                {interviewState.finalEvaluation.justification}
              </p>
            )}
            
            {/* Strongest Areas */}
            {interviewState.finalEvaluation.strongestAreas.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-2">
                  💪 Strongest Areas
                </h4>
                <ul className="space-y-1">
                  {interviewState.finalEvaluation.strongestAreas.map((area, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-green-500 flex-shrink-0 mt-0.5" />
                      {area}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Areas for Improvement */}
            {interviewState.finalEvaluation.areasForImprovement.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">
                  🔍 Areas for Improvement
                </h4>
                <ul className="space-y-1">
                  {interviewState.finalEvaluation.areasForImprovement.map((area, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <AlertCircle className="size-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      {area}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Recommended Topics */}
            {interviewState.finalEvaluation.recommendedTopics.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide mb-2">
                  📚 Recommended Topics
                </h4>
                <ul className="space-y-1">
                  {interviewState.finalEvaluation.recommendedTopics.map((topic, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <BookOpen className="size-4 text-purple-500 flex-shrink-0 mt-0.5" />
                      {topic}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-purple-200 dark:border-purple-800">
              <button
                type="button"
                onClick={handleDownloadEvaluation}
                className="flex-1 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
              >
                <Download className="size-4" />
                Download Report
              </button>
              <button
                type="button"
                onClick={doClear}
                className="flex-1 px-4 py-2 rounded-lg border-2 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 text-sm font-medium hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors inline-flex items-center justify-center gap-2"
              >
                <RotateCcw className="size-4" />
                Retry Interview
              </button>
            </div>
          </div>
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
