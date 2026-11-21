import { describe, it, expect, beforeEach } from 'vitest';
import { useInterviewStore } from './interviewState';

describe('Interview State Management', () => {
  beforeEach(() => {
    // Reset store before each test
    useInterviewStore.getState().resetInterview();
  });

  describe('Initialization', () => {
    it('initializes with default values', () => {
      const state = useInterviewStore.getState();
      expect(state.currentQuestion).toBe(1);
      expect(state.totalQuestions).toBe(5);
      expect(state.scores).toEqual([]);
      expect(state.answers).toEqual([]);
      expect(state.timeRemaining).toBeNull();
      expect(state.status).toBe('active');
      expect(state.evaluation).toBeNull();
    });

    it('initializes with custom total questions and time limit', () => {
      useInterviewStore.getState().initializeInterview(10, 30);
      const state = useInterviewStore.getState();
      
      expect(state.totalQuestions).toBe(10);
      expect(state.timeRemaining).toBe(1800); // 30 minutes * 60 seconds
      expect(state.status).toBe('active');
    });

    it('initializes without time limit', () => {
      useInterviewStore.getState().initializeInterview(5);
      const state = useInterviewStore.getState();
      
      expect(state.timeRemaining).toBeNull();
    });
  });

  describe('Answer Submission', () => {
    it('records answer and increments question count', () => {
      useInterviewStore.getState().initializeInterview(5);
      useInterviewStore.getState().submitAnswer('My first answer');
      
      const state = useInterviewStore.getState();
      expect(state.answers).toEqual(['My first answer']);
      expect(state.currentQuestion).toBe(2);
    });

    it('records multiple answers', () => {
      useInterviewStore.getState().initializeInterview(5);
      useInterviewStore.getState().submitAnswer('Answer 1');
      useInterviewStore.getState().submitAnswer('Answer 2');
      useInterviewStore.getState().submitAnswer('Answer 3');
      
      const state = useInterviewStore.getState();
      expect(state.answers).toEqual(['Answer 1', 'Answer 2', 'Answer 3']);
      expect(state.currentQuestion).toBe(4);
    });

    it('does not submit answers when interview is completed', () => {
      useInterviewStore.getState().initializeInterview(2);
      useInterviewStore.getState().submitAnswer('Answer 1');
      useInterviewStore.getState().submitAnswer('Answer 2'); // This completes the interview
      
      const stateBefore = useInterviewStore.getState();
      expect(stateBefore.status).toBe('completed');
      
      useInterviewStore.getState().submitAnswer('Answer 3');
      
      const stateAfter = useInterviewStore.getState();
      expect(stateAfter.answers.length).toBe(2); // Answer 3 should not be added
    });
  });

  describe('Score Recording', () => {
    it('records individual scores', () => {
      useInterviewStore.getState().initializeInterview(5);
      useInterviewStore.getState().recordScore(4);
      useInterviewStore.getState().recordScore(5);
      useInterviewStore.getState().recordScore(3);
      
      const state = useInterviewStore.getState();
      expect(state.scores).toEqual([4, 5, 3]);
    });

    it('does not record scores when interview is completed', () => {
      useInterviewStore.getState().initializeInterview(1);
      useInterviewStore.getState().submitAnswer('Answer'); // Completes interview
      
      const stateBefore = useInterviewStore.getState();
      expect(stateBefore.status).toBe('completed');
      
      useInterviewStore.getState().recordScore(5);
      
      const stateAfter = useInterviewStore.getState();
      expect(stateAfter.scores.length).toBe(0);
    });
  });

  describe('Derived State', () => {
    it('calculates average score correctly', () => {
      useInterviewStore.getState().initializeInterview(5);
      useInterviewStore.getState().recordScore(4);
      useInterviewStore.getState().recordScore(5);
      useInterviewStore.getState().recordScore(3);
      
      const avgScore = useInterviewStore.getState().getAverageScore();
      expect(avgScore).toBe(4); // (4 + 5 + 3) / 3
    });

    it('returns null for average score when no scores', () => {
      const avgScore = useInterviewStore.getState().getAverageScore();
      expect(avgScore).toBeNull();
    });

    it('calculates weighted overall score correctly', () => {
      useInterviewStore.getState().initializeInterview(5);
      useInterviewStore.getState().recordScore(2); // Weight 1
      useInterviewStore.getState().recordScore(3); // Weight 2
      useInterviewStore.getState().recordScore(5); // Weight 3
      
      const overallScore = useInterviewStore.getState().getOverallScore();
      // (2*1 + 3*2 + 5*3) / (1 + 2 + 3) = (2 + 6 + 15) / 6 = 23 / 6 = 3.833...
      expect(overallScore).toBeCloseTo(3.833, 2);
    });

    it('returns null for overall score when no scores', () => {
      const overallScore = useInterviewStore.getState().getOverallScore();
      expect(overallScore).toBeNull();
    });

    it('detects time expiration correctly', () => {
      useInterviewStore.getState().initializeInterview(5, 1); // 1 minute
      expect(useInterviewStore.getState().isTimeExpired()).toBe(false);
      
      // Tick down to 0
      useInterviewStore.getState().tickTimer(); // 59 seconds
      expect(useInterviewStore.getState().isTimeExpired()).toBe(false);
      
      // Manually set to 0 to test
      useInterviewStore.setState({ timeRemaining: 0 });
      expect(useInterviewStore.getState().isTimeExpired()).toBe(true);
    });

    it('returns false for time expired when no time limit', () => {
      useInterviewStore.getState().initializeInterview(5);
      expect(useInterviewStore.getState().isTimeExpired()).toBe(false);
    });
  });

  describe('Timer', () => {
    it('decrements time remaining on tick', () => {
      useInterviewStore.getState().initializeInterview(5, 5); // 5 minutes = 300 seconds
      
      useInterviewStore.getState().tickTimer();
      expect(useInterviewStore.getState().timeRemaining).toBe(299);
      
      useInterviewStore.getState().tickTimer();
      expect(useInterviewStore.getState().timeRemaining).toBe(298);
    });

    it('does not tick when no time limit', () => {
      useInterviewStore.getState().initializeInterview(5);
      useInterviewStore.getState().tickTimer();
      
      expect(useInterviewStore.getState().timeRemaining).toBeNull();
    });

    it('does not tick when interview is completed', () => {
      useInterviewStore.getState().initializeInterview(1, 5);
      useInterviewStore.getState().submitAnswer('Answer'); // Completes interview
      
      const timeBefore = useInterviewStore.getState().timeRemaining;
      useInterviewStore.getState().tickTimer();
      const timeAfter = useInterviewStore.getState().timeRemaining;
      
      expect(timeBefore).toBe(timeAfter);
    });

    it('auto-completes interview when time expires', () => {
      useInterviewStore.getState().initializeInterview(5, 1);
      useInterviewStore.getState().submitAnswer('Answer 1');
      useInterviewStore.getState().recordScore(4);
      
      // Manually set time to 1 second
      useInterviewStore.setState({ timeRemaining: 1 });
      
      // Tick to 0 - should auto-complete
      useInterviewStore.getState().tickTimer();
      
      const state = useInterviewStore.getState();
      expect(state.timeRemaining).toBe(0);
      expect(state.status).toBe('completed');
      expect(state.evaluation).not.toBeNull();
    });
  });

  describe('Interview Completion', () => {
    it('completes interview when all questions answered', () => {
      useInterviewStore.getState().initializeInterview(3);
      
      useInterviewStore.getState().submitAnswer('Answer 1');
      useInterviewStore.getState().recordScore(4);
      
      useInterviewStore.getState().submitAnswer('Answer 2');
      useInterviewStore.getState().recordScore(5);
      
      useInterviewStore.getState().submitAnswer('Answer 3');
      useInterviewStore.getState().recordScore(3);
      
      const state = useInterviewStore.getState();
      expect(state.status).toBe('completed');
      expect(state.evaluation).not.toBeNull();
    });

    it('generates evaluation with correct structure', () => {
      useInterviewStore.getState().initializeInterview(2);
      useInterviewStore.getState().submitAnswer('Answer 1');
      useInterviewStore.getState().recordScore(4);
      useInterviewStore.getState().submitAnswer('Answer 2');
      useInterviewStore.getState().recordScore(5);
      
      const evaluation = useInterviewStore.getState().evaluation;
      expect(evaluation).not.toBeNull();
      expect(evaluation!.overallScore).toBeGreaterThan(0);
      expect(evaluation!.overallScore).toBeLessThanOrEqual(100);
      expect(evaluation!.strongestAreas.length).toBeGreaterThan(0);
      expect(evaluation!.improvementAreas.length).toBeGreaterThan(0);
      expect(evaluation!.recommendedTopics.length).toBeGreaterThan(0);
      expect(['Strong Hire', 'Hire', 'Borderline', 'No Hire']).toContain(evaluation!.hiringRecommendation);
      expect(evaluation!.justification.length).toBeGreaterThan(0);
    });

    it('assigns Strong Hire for high scores', () => {
      useInterviewStore.getState().initializeInterview(3);
      useInterviewStore.getState().submitAnswer('A1');
      useInterviewStore.getState().recordScore(5);
      useInterviewStore.getState().submitAnswer('A2');
      useInterviewStore.getState().recordScore(5);
      useInterviewStore.getState().submitAnswer('A3');
      useInterviewStore.getState().recordScore(5);
      
      const evaluation = useInterviewStore.getState().evaluation;
      expect(evaluation!.hiringRecommendation).toBe('Strong Hire');
    });

    it('assigns No Hire for low scores', () => {
      useInterviewStore.getState().initializeInterview(3);
      useInterviewStore.getState().submitAnswer('A1');
      useInterviewStore.getState().recordScore(1);
      useInterviewStore.getState().submitAnswer('A2');
      useInterviewStore.getState().recordScore(2);
      useInterviewStore.getState().submitAnswer('A3');
      useInterviewStore.getState().recordScore(1);
      
      const evaluation = useInterviewStore.getState().evaluation;
      expect(evaluation!.hiringRecommendation).toBe('No Hire');
    });

    it('does not complete already completed interview', () => {
      useInterviewStore.getState().initializeInterview(1);
      useInterviewStore.getState().submitAnswer('Answer');
      
      const evaluation1 = useInterviewStore.getState().evaluation;
      
      // Try to complete again
      useInterviewStore.getState().completeInterview();
      
      const evaluation2 = useInterviewStore.getState().evaluation;
      expect(evaluation1).toEqual(evaluation2); // Should be the same object
    });
  });

  describe('Reset', () => {
    it('resets all state to initial values', () => {
      useInterviewStore.getState().initializeInterview(5, 30);
      useInterviewStore.getState().submitAnswer('Answer 1');
      useInterviewStore.getState().recordScore(4);
      useInterviewStore.getState().submitAnswer('Answer 2');
      useInterviewStore.getState().recordScore(5);
      
      useInterviewStore.getState().resetInterview();
      
      const state = useInterviewStore.getState();
      expect(state.currentQuestion).toBe(1);
      expect(state.totalQuestions).toBe(5);
      expect(state.scores).toEqual([]);
      expect(state.answers).toEqual([]);
      expect(state.timeRemaining).toBeNull();
      expect(state.status).toBe('active');
      expect(state.evaluation).toBeNull();
    });

    it('allows starting new interview after reset', () => {
      useInterviewStore.getState().initializeInterview(3);
      useInterviewStore.getState().submitAnswer('Answer 1');
      useInterviewStore.getState().submitAnswer('Answer 2');
      useInterviewStore.getState().submitAnswer('Answer 3');
      
      useInterviewStore.getState().resetInterview();
      useInterviewStore.getState().initializeInterview(5, 10);
      
      const state = useInterviewStore.getState();
      expect(state.totalQuestions).toBe(5);
      expect(state.timeRemaining).toBe(600);
      expect(state.status).toBe('active');
      expect(state.answers).toEqual([]);
    });
  });

  describe('Status Management', () => {
    it('sets status correctly', () => {
      useInterviewStore.getState().setStatus('abandoned');
      expect(useInterviewStore.getState().status).toBe('abandoned');
      
      useInterviewStore.getState().setStatus('active');
      expect(useInterviewStore.getState().status).toBe('active');
    });
  });

  describe('Persistence', () => {
    it('persists state to localStorage', () => {
      useInterviewStore.getState().initializeInterview(5, 30);
      useInterviewStore.getState().submitAnswer('Test answer');
      useInterviewStore.getState().recordScore(4);
      
      // Check that localStorage has the data
      const stored = localStorage.getItem('interview-storage');
      expect(stored).not.toBeNull();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.state.answers).toEqual(['Test answer']);
      expect(parsed.state.scores).toEqual([4]);
      expect(parsed.state.currentQuestion).toBe(2);
    });
  });
});
