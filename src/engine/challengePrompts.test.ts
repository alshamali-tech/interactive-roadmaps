import { describe, it, expect } from 'vitest';
import {
  buildChallengeEvaluationPrompt,
  parseChallengeEvaluation,
} from './challengePrompts';

describe('Challenge Prompts', () => {
  describe('buildChallengeEvaluationPrompt', () => {
    it('generates prompt for junior difficulty', () => {
      const prompt = buildChallengeEvaluationPrompt('junior');
      expect(prompt).toContain('lenient');
      expect(prompt).toContain('fundamental concept');
      expect(prompt).toContain('encouraging');
      expect(prompt).toContain('JSON');
    });

    it('generates prompt for mid difficulty', () => {
      const prompt = buildChallengeEvaluationPrompt('mid');
      expect(prompt).toContain('standard evaluation');
      expect(prompt).toContain('apply the concept');
      expect(prompt).toContain('balanced explanations');
      expect(prompt).toContain('JSON');
    });

    it('generates prompt for senior difficulty', () => {
      const prompt = buildChallengeEvaluationPrompt('senior');
      expect(prompt).toContain('strict evaluation');
      expect(prompt).toContain('edge cases');
      expect(prompt).toContain('detailed explanations');
      expect(prompt).toContain('JSON');
    });

    it('includes response format instructions', () => {
      const prompt = buildChallengeEvaluationPrompt('mid');
      expect(prompt).toContain('correct');
      expect(prompt).toContain('score');
      expect(prompt).toContain('explanation');
      expect(prompt).toContain('modelAnswer');
      expect(prompt).toContain('0-100');
    });
  });

  describe('parseChallengeEvaluation', () => {
    it('parses valid JSON response', () => {
      const content = `{
        "correct": true,
        "score": 85,
        "explanation": "Good understanding of the concept",
        "modelAnswer": "The complete answer would include..."
      }`;
      const result = parseChallengeEvaluation(content);
      expect(result).not.toBeNull();
      expect(result?.correct).toBe(true);
      expect(result?.score).toBe(85);
      expect(result?.explanation).toBe('Good understanding of the concept');
      expect(result?.modelAnswer).toBe('The complete answer would include...');
    });

    it('parses JSON with surrounding text', () => {
      const content = `Here is my evaluation:
      
      {"correct": false, "score": 30, "explanation": "Missing key points", "modelAnswer": "The correct answer is..."}
      
      Hope this helps!`;
      const result = parseChallengeEvaluation(content);
      expect(result).not.toBeNull();
      expect(result?.correct).toBe(false);
      expect(result?.score).toBe(30);
    });

    it('returns null for invalid JSON', () => {
      const content = '{invalid json}';
      const result = parseChallengeEvaluation(content);
      expect(result).toBeNull();
    });

    it('returns null for missing required fields', () => {
      const content = '{"correct": true, "score": 80}';
      const result = parseChallengeEvaluation(content);
      expect(result).toBeNull();
    });

    it('returns null for score out of range', () => {
      const content = '{"correct": true, "score": 150, "explanation": "test", "modelAnswer": "test"}';
      const result = parseChallengeEvaluation(content);
      expect(result).toBeNull();
    });

    it('returns null for negative score', () => {
      const content = '{"correct": false, "score": -10, "explanation": "test", "modelAnswer": "test"}';
      const result = parseChallengeEvaluation(content);
      expect(result).toBeNull();
    });

    it('returns null for empty content', () => {
      const result = parseChallengeEvaluation('');
      expect(result).toBeNull();
    });

    it('returns null for no JSON object', () => {
      const content = 'This is just text with no JSON';
      const result = parseChallengeEvaluation(content);
      expect(result).toBeNull();
    });
  });
});
