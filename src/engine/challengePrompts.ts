/**
 * Challenge Mode Prompts
 * Specialized prompts for quick single-question knowledge checks
 */

/**
 * Build the challenge evaluation system prompt
 */
export const buildChallengeEvaluationPrompt = (difficulty: 'junior' | 'mid' | 'senior'): string => {
  const difficultyModifiers = {
    junior: {
      leniency: 'Be lenient in your evaluation. Accept answers that demonstrate basic understanding even if not perfectly worded.',
      focus: 'Focus on whether they understand the fundamental concept.',
      explanation: 'Provide clear, encouraging explanations suitable for beginners.',
    },
    mid: {
      leniency: 'Apply standard evaluation criteria. Accept answers that are mostly correct with minor inaccuracies.',
      focus: 'Focus on whether they can apply the concept correctly.',
      explanation: 'Provide balanced explanations highlighting both strengths and areas for improvement.',
    },
    senior: {
      leniency: 'Apply strict evaluation. Only accept answers that demonstrate deep, nuanced understanding.',
      focus: 'Focus on whether they understand edge cases, trade-offs, and advanced implications.',
      explanation: 'Provide detailed explanations that assume advanced knowledge.',
    },
  };

  const modifiers = difficultyModifiers[difficulty];

  return `You are an expert evaluator assessing knowledge through a focused challenge question.

EVALUATION CRITERIA:
${modifiers.leniency}
${modifiers.focus}

RESPONSE FORMAT:
You must respond with ONLY a JSON object in this exact format (no other text before or after):
\`\`\`json
{
  "correct": true/false,
  "score": number (0-100),
  "explanation": "detailed explanation of why the answer is correct or incorrect",
  "modelAnswer": "the ideal complete answer to this question"
}
\`\`\`

EVALUATION GUIDELINES:
- Score should reflect accuracy and completeness (0 = completely wrong, 100 = perfect answer)
- Explanation should be educational and help the user learn
- Model answer should be comprehensive and represent what a perfect response would look like
${modifiers.explanation}

IMPORTANT:
- Respond with ONLY the JSON object, no additional text
- Make sure the JSON is valid and properly formatted
- Be fair but thorough in your evaluation`;
};

/**
 * Parse challenge evaluation response
 */
export interface ChallengeEvaluation {
  correct: boolean;
  score: number;
  explanation: string;
  modelAnswer: string;
}

export const parseChallengeEvaluation = (content: string): ChallengeEvaluation | null => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (
      typeof parsed.correct !== 'boolean' ||
      typeof parsed.score !== 'number' ||
      typeof parsed.explanation !== 'string' ||
      typeof parsed.modelAnswer !== 'string'
    ) {
      return null;
    }

    // Validate score range
    if (parsed.score < 0 || parsed.score > 100) {
      return null;
    }

    return {
      correct: parsed.correct,
      score: parsed.score,
      explanation: parsed.explanation,
      modelAnswer: parsed.modelAnswer,
    };
  } catch {
    return null;
  }
};
