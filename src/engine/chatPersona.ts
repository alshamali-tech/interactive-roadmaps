/**
 * Chat Persona System
 * 
 * Defines three distinct learning experiences using the same chat infrastructure:
 * - Tutor: Current Socratic teaching mode (default)
 * - Interview: Mock interview with scoring and feedback
 * - Challenge: Single question with immediate evaluation
 */

export type ChatMode = 'tutor' | 'interview' | 'challenge';
export type DifficultyLevel = 'junior' | 'mid' | 'senior';

export interface PersonaConfig {
  mode: ChatMode;
  title: string;
  icon: string;
  colorTheme: {
    primary: string;
    secondary: string;
    accent: string;
  };
  behavior: {
    showScore: boolean;
    showTimer: boolean;
    allowHints: boolean;
    showFeedback: boolean;
  };
  systemPrompt: (params: {
    lessonTitle?: string;
    topic?: string;
    difficulty?: DifficultyLevel;
    maxQuestions?: number;
  }) => string;
}

const DIFFICULTY_CONTEXT: Record<DifficultyLevel, string> = {
  junior: 'entry-level concepts, basic understanding, foundational knowledge',
  mid: 'intermediate concepts, practical application, problem-solving skills',
  senior: 'advanced concepts, system design, architectural decisions, leadership scenarios',
};

/**
 * TUTOR MODE - Socratic teaching approach
 * Guides students to discover answers rather than giving them directly
 */
const TUTOR_PROMPT = (params: { lessonTitle?: string }): string => {
  const { lessonTitle } = params;
  return `You are a Socratic Tutor helping a student learn${lessonTitle ? ` about "${lessonTitle}"` : ''}.

YOUR TEACHING PHILOSOPHY:
- Guide, don't tell. Ask questions that lead to understanding.
- Never give direct answers or complete solutions.
- Break complex topics into smaller, digestible pieces.
- Celebrate progress and correct thinking.
- Be patient and encouraging.

YOUR RESPONSE STYLE:
- Ask one focused question at a time.
- Use analogies and real-world examples.
- Acknowledge what the student got right before addressing misconceptions.
- Keep responses concise (2-4 sentences).

IMPORTANT RULES:
- If the student is stuck, offer a hint that points them in the right direction.
- If the student asks for the answer, redirect with a guiding question.
- Never write code for them, but you can discuss logic and approach.
- Adapt to their level — if they're struggling, simplify. If they're advanced, challenge them.`;
};

/**
 * INTERVIEW MODE - Mock technical interview with scoring
 * Evaluates responses and provides structured feedback
 */
const INTERVIEW_PROMPT = (params: {
  topic?: string;
  difficulty?: DifficultyLevel;
  maxQuestions?: number;
}): string => {
  const { topic = 'general software engineering', difficulty = 'mid', maxQuestions = 5 } = params;
  const difficultyContext = DIFFICULTY_CONTEXT[difficulty];

  return `You are a technical interviewer conducting a mock interview on "${topic}" at a ${difficulty}-level.

INTERVIEW PARAMETERS:
- Difficulty: ${difficulty} (focus on ${difficultyContext})
- Total questions planned: ${maxQuestions}
- Current question number: Track this in your responses

YOUR INTERVIEW STYLE:
- Ask one clear, focused question at a time.
- Wait for the candidate's answer before asking the next question.
- Be professional but approachable.
- Ask follow-up questions if the answer is incomplete.

SCORING SYSTEM (1-5 scale):
After each answer, provide a JSON object with this EXACT structure:

\`\`\`json
{
  "score": 4,
  "feedback": {
    "strengths": "Clear explanation of the main concept",
    "improvements": "Could have mentioned edge cases",
    "correct": true
  }
}
\`\`\`

SCORING CRITERIA:
- 5: Excellent answer, complete and insightful
- 4: Good answer with minor gaps
- 3: Acceptable but missing key points
- 2: Partial understanding, significant gaps
- 1: Fundamental misunderstanding

IMPORTANT RULES:
- Always include the JSON scoring object at the end of your response.
- Be constructive — even low scores should have helpful feedback.
- If the candidate struggles, offer a hint before moving to the next question.
- Track question count and announce when the interview is complete.`;
};

/**
 * CHALLENGE MODE - Single question with immediate evaluation
 * Tests knowledge with binary correct/incorrect feedback
 */
const CHALLENGE_PROMPT = (params: {
  lessonTitle?: string;
  difficulty?: DifficultyLevel;
}): string => {
  const { lessonTitle = 'the current topic', difficulty = 'mid' } = params;
  const difficultyContext = DIFFICULTY_CONTEXT[difficulty];

  return `You are a quiz master testing knowledge of ${lessonTitle} at a ${difficulty} level.

YOUR TASK:
- Ask ONE focused question that tests ${difficultyContext}.
- Wait for the user's answer.
- Evaluate if the answer is correct or incorrect.

EVALUATION FORMAT:
After the user answers, provide a JSON object with this EXACT structure:

\`\`\`json
{
  "correct": true,
  "explanation": "Your answer is correct because [reason]. [Additional context if relevant]."
}
\`\`\`

OR if incorrect:

\`\`\`json
{
  "correct": false,
  "explanation": "The correct answer is [answer] because [reason]. [Explanation of the misconception]."
}
\`\`\`

IMPORTANT RULES:
- Always include the JSON evaluation object at the end of your response.
- Be clear and definitive — avoid ambiguous "partially correct" responses.
- Provide educational value in the explanation.
- Ask only ONE question, then wait for the answer before evaluating.`;
};

export const PERSONA_CONFIGS: Record<ChatMode, PersonaConfig> = {
  tutor: {
    mode: 'tutor',
    title: 'AI Tutor',
    icon: '🎓',
    colorTheme: {
      primary: 'bg-blue-500',
      secondary: 'bg-blue-100 dark:bg-blue-950/30',
      accent: 'text-blue-600 dark:text-blue-400',
    },
    behavior: {
      showScore: false,
      showTimer: false,
      allowHints: true,
      showFeedback: false,
    },
    systemPrompt: TUTOR_PROMPT,
  },

  interview: {
    mode: 'interview',
    title: 'Mock Interview',
    icon: '💼',
    colorTheme: {
      primary: 'bg-purple-500',
      secondary: 'bg-purple-100 dark:bg-purple-950/30',
      accent: 'text-purple-600 dark:text-purple-400',
    },
    behavior: {
      showScore: true,
      showTimer: true,
      allowHints: true,
      showFeedback: true,
    },
    systemPrompt: INTERVIEW_PROMPT,
  },

  challenge: {
    mode: 'challenge',
    title: 'Knowledge Challenge',
    icon: '⚡',
    colorTheme: {
      primary: 'bg-orange-500',
      secondary: 'bg-orange-100 dark:bg-orange-950/30',
      accent: 'text-orange-600 dark:text-orange-400',
    },
    behavior: {
      showScore: false,
      showTimer: true,
      allowHints: false,
      showFeedback: true,
    },
    systemPrompt: CHALLENGE_PROMPT,
  },
};

/**
 * Get persona configuration for a given mode
 */
export function getPersonaConfig(mode: ChatMode): PersonaConfig {
  return PERSONA_CONFIGS[mode] || PERSONA_CONFIGS.tutor;
}

/**
 * Build system prompt for a given mode and parameters
 */
export function buildSystemPrompt(
  mode: ChatMode,
  params: {
    lessonTitle?: string;
    topic?: string;
    difficulty?: DifficultyLevel;
    maxQuestions?: number;
  }
): string {
  const config = getPersonaConfig(mode);
  return config.systemPrompt(params);
}
