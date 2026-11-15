import { describe, it, expect } from 'vitest';
import {
  buildInterviewSystemPrompt,
  buildTimerWarningPrompt,
  parseInterviewMetadata,
  buildHintRequestPrompt,
  buildDontKnowResponsePrompt,
  type InterviewDifficulty
} from './interviewPrompts';

describe('Interview Mode System Prompts', () => {
  describe('buildInterviewSystemPrompt', () => {
    const baseParams = {
      topic: 'React',
      difficulty: 'mid' as InterviewDifficulty,
      maxQuestions: 5
    };

    it('includes role definition with topic and difficulty', () => {
      const prompt = buildInterviewSystemPrompt(baseParams);
      expect(prompt).toContain('senior technical interviewer');
      expect(prompt).toContain('React');
      expect(prompt).toContain('mid-level');
    });

    it('includes interview structure with 5 questions', () => {
      const prompt = buildInterviewSystemPrompt(baseParams);
      expect(prompt).toContain('Question 1');
      expect(prompt).toContain('Warm-up');
      expect(prompt).toContain('Questions 2-3');
      expect(prompt).toContain('Applied Knowledge');
      expect(prompt).toContain('Questions 4-5');
      expect(prompt).toContain('System Design');
    });

    it('includes JSON response format with score, strengths, gaps, and followUp', () => {
      const prompt = buildInterviewSystemPrompt(baseParams);
      expect(prompt).toContain('```json');
      expect(prompt).toContain('"score"');
      expect(prompt).toContain('"justification"');
      expect(prompt).toContain('"strengths"');
      expect(prompt).toContain('"gaps"');
      expect(prompt).toContain('"followUp"');
    });

    it('includes final evaluation format with hiring recommendation', () => {
      const prompt = buildInterviewSystemPrompt(baseParams);
      expect(prompt).toContain('FINAL EVALUATION');
      expect(prompt).toContain('"overallScore"');
      expect(prompt).toContain('"strongestAreas"');
      expect(prompt).toContain('"areasForImprovement"');
      expect(prompt).toContain('"recommendedTopics"');
      expect(prompt).toContain('"hiringRecommendation"');
      expect(prompt).toContain('Strong Hire');
      expect(prompt).toContain('Hire');
      expect(prompt).toContain('Borderline');
      expect(prompt).toContain('No Hire');
    });

    it('includes behavioral rules about hints and "I don\'t know"', () => {
      const prompt = buildInterviewSystemPrompt(baseParams);
      expect(prompt).toContain('BEHAVIORAL RULES');
      expect(prompt).toContain('Hint Handling');
      expect(prompt).toContain('"I Don\'t Know"');
      expect(prompt).toContain('Answer Reveal Policy');
    });

    describe('Junior difficulty', () => {
      const juniorParams = { ...baseParams, difficulty: 'junior' as InterviewDifficulty };

      it('uses forgiving scoring language', () => {
        const prompt = buildInterviewSystemPrompt(juniorParams);
        expect(prompt).toContain('more forgiving');
        expect(prompt).toContain('effort and understanding');
      });

      it('allows multiple hints', () => {
        const prompt = buildInterviewSystemPrompt(juniorParams);
        expect(prompt).toContain('up to 3 hints');
      });

      it('focuses on fundamentals', () => {
        const prompt = buildInterviewSystemPrompt(juniorParams);
        expect(prompt).toContain('fundamental concepts');
        expect(prompt).toContain('basic syntax');
      });

      it('uses encouraging tone', () => {
        const prompt = buildInterviewSystemPrompt(juniorParams);
        expect(prompt).toContain('encouraging and supportive');
        expect(prompt).toContain('build confidence');
      });
    });

    describe('Mid difficulty', () => {
      const midParams = { ...baseParams, difficulty: 'mid' as InterviewDifficulty };

      it('uses standard scoring', () => {
        const prompt = buildInterviewSystemPrompt(midParams);
        expect(prompt).toContain('standard scoring');
        expect(prompt).toContain('practical application');
      });

      it('allows limited hints', () => {
        const prompt = buildInterviewSystemPrompt(midParams);
        expect(prompt).toContain('up to 1 hint');
      });

      it('focuses on applied knowledge', () => {
        const prompt = buildInterviewSystemPrompt(midParams);
        expect(prompt).toContain('applied knowledge');
        expect(prompt).toContain('real-world scenarios');
      });

      it('uses professional tone', () => {
        const prompt = buildInterviewSystemPrompt(midParams);
        expect(prompt).toContain('professional and constructive');
      });
    });

    describe('Senior difficulty', () => {
      const seniorParams = { ...baseParams, difficulty: 'senior' as InterviewDifficulty };

      it('uses strict scoring', () => {
        const prompt = buildInterviewSystemPrompt(seniorParams);
        expect(prompt).toContain('strict scoring');
        expect(prompt).toContain('deep understanding');
      });

      it('prohibits hints', () => {
        const prompt = buildInterviewSystemPrompt(seniorParams);
        expect(prompt).toContain('Do not provide hints');
      });

      it('focuses on system design and trade-offs', () => {
        const prompt = buildInterviewSystemPrompt(seniorParams);
        expect(prompt).toContain('system design');
        expect(prompt).toContain('architectural decisions');
        expect(prompt).toContain('trade-offs');
      });

      it('uses challenging tone', () => {
        const prompt = buildInterviewSystemPrompt(seniorParams);
        expect(prompt).toContain('challenging but fair');
        expect(prompt).toContain('high-quality answers');
      });
    });

    it('tracks current question number', () => {
      const params = { ...baseParams, currentQuestion: 3 };
      const prompt = buildInterviewSystemPrompt(params);
      expect(prompt).toContain('Question 3 of 5');
    });

    it('defaults currentQuestion to 1 when not provided', () => {
      const prompt = buildInterviewSystemPrompt(baseParams);
      expect(prompt).toContain('Question 1 of 5');
    });
  });

  describe('buildTimerWarningPrompt', () => {
    it('creates urgent warning when 2 minutes or less remaining', () => {
      const prompt = buildTimerWarningPrompt(2);
      expect(prompt).toContain('TIME WARNING');
      expect(prompt).toContain('2 minutes remaining');
      expect(prompt).toContain('wrap up');
      expect(prompt).toContain('final evaluation');
    });

    it('creates urgent warning when 1 minute remaining', () => {
      const prompt = buildTimerWarningPrompt(1);
      expect(prompt).toContain('TIME WARNING');
      expect(prompt).toContain('1 minute remaining');
      expect(prompt).not.toContain('minutes'); // Should be singular
    });

    it('creates time check for more than 2 minutes', () => {
      const prompt = buildTimerWarningPrompt(5);
      expect(prompt).toContain('TIME CHECK');
      expect(prompt).toContain('5 minutes remaining');
      expect(prompt).toContain('normal pace');
    });
  });

  describe('parseInterviewMetadata', () => {
    it('parses question response metadata', () => {
      const content = `
Great answer! Here's my feedback:

\`\`\`json
{
  "score": 4,
  "justification": "Good understanding of React hooks with minor gaps in optimization.",
  "strengths": [
    "Correctly explained useState and useEffect",
    "Mentioned dependency arrays"
  ],
  "gaps": [
    "Didn't mention useCallback for performance",
    "Missed custom hooks pattern"
  ],
  "followUp": "How would you optimize a component that re-renders too frequently?",
  "hint": null
}
\`\`\`

Let me know your thoughts!
      `;

      const metadata = parseInterviewMetadata(content);
      expect(metadata).not.toBeNull();
      expect(metadata?.score).toBe(4);
      expect(metadata?.justification).toContain('React hooks');
      expect(metadata?.strengths).toHaveLength(2);
      expect(metadata?.gaps).toHaveLength(2);
      expect(metadata?.followUp).toContain('optimize');
      expect(metadata?.hint).toBeNull();
    });

    it('parses final evaluation metadata', () => {
      const content = `
Here's your final evaluation:

\`\`\`json
{
  "overallScore": 85,
  "strongestAreas": [
    "Component lifecycle understanding",
    "State management",
    "Performance optimization"
  ],
  "areasForImprovement": [
    "Advanced patterns like HOCs",
    "Testing strategies"
  ],
  "recommendedTopics": [
    "React Design Patterns book",
    "Testing Library documentation",
    "React Performance course on Frontend Masters"
  ],
  "hiringRecommendation": "Hire",
  "justification": "Solid React fundamentals with good problem-solving skills. Would be a valuable team member with some mentoring on advanced patterns."
}
\`\`\`
      `;

      const metadata = parseInterviewMetadata(content);
      expect(metadata).not.toBeNull();
      expect(metadata?.overallScore).toBe(85);
      expect(metadata?.strongestAreas).toHaveLength(3);
      expect(metadata?.areasForImprovement).toHaveLength(2);
      expect(metadata?.recommendedTopics).toHaveLength(3);
      expect(metadata?.hiringRecommendation).toBe('Hire');
      expect(metadata?.justification).toContain('Solid React fundamentals');
    });

    it('returns null when no JSON code block found', () => {
      const content = 'Just some regular text without JSON.';
      const metadata = parseInterviewMetadata(content);
      expect(metadata).toBeNull();
    });

    it('returns null when JSON is malformed', () => {
      const content = `
\`\`\`json
{ invalid json }
\`\`\`
      `;
      const metadata = parseInterviewMetadata(content);
      expect(metadata).toBeNull();
    });

    it('returns null when JSON doesn\'t match expected structure', () => {
      const content = `
\`\`\`json
{
  "foo": "bar",
  "baz": 123
}
\`\`\`
      `;
      const metadata = parseInterviewMetadata(content);
      expect(metadata).toBeNull();
    });

    it('handles hint when provided', () => {
      const content = `
\`\`\`json
{
  "score": 2,
  "justification": "Struggling with the concept.",
  "strengths": ["Attempted the problem"],
  "gaps": ["Major misunderstandings"],
  "followUp": "Next question",
  "hint": "Think about how arrays work in JavaScript"
}
\`\`\`
      `;
      const metadata = parseInterviewMetadata(content);
      expect(metadata?.hint).toBe('Think about how arrays work in JavaScript');
    });
  });

  describe('buildHintRequestPrompt', () => {
    it('includes the current question', () => {
      const prompt = buildHintRequestPrompt('What is the virtual DOM?');
      expect(prompt).toContain('What is the virtual DOM?');
      expect(prompt).toContain('small, targeted hint');
      expect(prompt).toContain('without giving it away');
    });
  });

  describe('buildDontKnowResponsePrompt', () => {
    it('instructs to acknowledge and move on', () => {
      const prompt = buildDontKnowResponsePrompt();
      expect(prompt).toContain("don't know");
      expect(prompt).toContain('score of 1-2/5');
      expect(prompt).toContain('next question');
      expect(prompt).toContain('Do NOT reveal');
    });
  });
});
