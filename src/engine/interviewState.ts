import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type InterviewStatus = 'active' | 'completed' | 'abandoned';

export interface InterviewEvaluation {
  overallScore: number;
  strongestAreas: string[];
  improvementAreas: string[];
  recommendedTopics: string[];
  hiringRecommendation: 'Strong Hire' | 'Hire' | 'Borderline' | 'No Hire';
  justification: string;
}

export interface InterviewState {
  // Core state
  currentQuestion: number;
  totalQuestions: number;
  scores: number[];
  answers: string[];
  timeRemaining: number | null; // null if no time limit
  status: InterviewStatus;
  evaluation: InterviewEvaluation | null;
  
  // Actions
  initializeInterview: (totalQuestions: number, timeLimit?: number) => void;
  submitAnswer: (answer: string) => void;
  recordScore: (score: number) => void;
  completeInterview: () => void;
  resetInterview: () => void;
  tickTimer: () => void;
  setStatus: (status: InterviewStatus) => void;
  
  // Derived state (computed)
  getAverageScore: () => number | null;
  getOverallScore: () => number | null;
  isTimeExpired: () => boolean;
}

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentQuestion: 1,
      totalQuestions: 5,
      scores: [],
      answers: [],
      timeRemaining: null,
      status: 'active',
      evaluation: null,
      
      // Actions
      initializeInterview: (totalQuestions: number, timeLimit?: number) => {
        set({
          currentQuestion: 1,
          totalQuestions,
          scores: [],
          answers: [],
          timeRemaining: timeLimit ? timeLimit * 60 : null, // Convert minutes to seconds
          status: 'active',
          evaluation: null,
        });
      },
      
      submitAnswer: (answer: string) => {
        const state = get();
        if (state.status !== 'active') return;
        
        set({
          answers: [...state.answers, answer],
          currentQuestion: state.currentQuestion + 1,
        });
        
        // Check if interview is complete
        if (state.currentQuestion >= state.totalQuestions) {
          get().completeInterview();
        }
      },
      
      recordScore: (score: number) => {
        const state = get();
        if (state.status !== 'active') return;
        
        set({
          scores: [...state.scores, score],
        });
      },
      
      completeInterview: () => {
        const state = get();
        if (state.status !== 'active') return;
        
        const evaluation = calculateEvaluation(state.scores, state.answers);
        
        set({
          status: 'completed',
          evaluation,
        });
      },
      
      resetInterview: () => {
        set({
          currentQuestion: 1,
          totalQuestions: 5,
          scores: [],
          answers: [],
          timeRemaining: null,
          status: 'active',
          evaluation: null,
        });
      },
      
      tickTimer: () => {
        const state = get();
        if (state.timeRemaining === null || state.status !== 'active') return;
        
        const newTimeRemaining = state.timeRemaining - 1;
        
        set({
          timeRemaining: newTimeRemaining,
        });
        
        // Auto-complete when time expires
        if (newTimeRemaining <= 0) {
          get().completeInterview();
        }
      },
      
      setStatus: (status: InterviewStatus) => {
        set({ status });
      },
      
      // Derived state
      getAverageScore: () => {
        const { scores } = get();
        if (scores.length === 0) return null;
        
        const sum = scores.reduce((acc, score) => acc + score, 0);
        return sum / scores.length;
      },
      
      getOverallScore: () => {
        const { scores } = get();
        if (scores.length === 0) return null;
        
        // Weighted average: later questions weighted more
        let weightedSum = 0;
        let weightTotal = 0;
        
        scores.forEach((score, index) => {
          const weight = index + 1; // Question 1 = weight 1, Question 2 = weight 2, etc.
          weightedSum += score * weight;
          weightTotal += weight;
        });
        
        return weightedSum / weightTotal;
      },
      
      isTimeExpired: () => {
        const { timeRemaining } = get();
        return timeRemaining !== null && timeRemaining <= 0;
      },
    }),
    {
      name: 'interview-storage', // localStorage key
      partialize: (state) => ({
        // Only persist essential state, not functions
        currentQuestion: state.currentQuestion,
        totalQuestions: state.totalQuestions,
        scores: state.scores,
        answers: state.answers,
        timeRemaining: state.timeRemaining,
        status: state.status,
        evaluation: state.evaluation,
      }),
    }
  )
);

/**
 * Calculate final evaluation based on scores and answers
 */
function calculateEvaluation(
  scores: number[],
  _answers: string[]
): InterviewEvaluation {
  if (scores.length === 0) {
    return {
      overallScore: 0,
      strongestAreas: ['No questions answered'],
      improvementAreas: ['Complete the interview to receive feedback'],
      recommendedTopics: ['Review fundamental concepts'],
      hiringRecommendation: 'No Hire',
      justification: 'Insufficient data to evaluate.',
    };
  }
  
  // Calculate weighted overall score (later questions weighted more)
  let weightedSum = 0;
  let weightTotal = 0;
  
  scores.forEach((score, index) => {
    const weight = index + 1;
    weightedSum += score * weight;
    weightTotal += weight;
  });
  
  const overallScore = Math.round((weightedSum / weightTotal) * 20); // Convert 1-5 to 0-100
  
  // Determine hiring recommendation based on score
  let hiringRecommendation: InterviewEvaluation['hiringRecommendation'];
  let justification: string;
  
  if (overallScore >= 85) {
    hiringRecommendation = 'Strong Hire';
    justification = 'Exceptional performance across all questions. Demonstrates deep understanding and excellent problem-solving skills.';
  } else if (overallScore >= 70) {
    hiringRecommendation = 'Hire';
    justification = 'Solid performance with good understanding of core concepts. Ready for the role with minor onboarding.';
  } else if (overallScore >= 50) {
    hiringRecommendation = 'Borderline';
    justification = 'Mixed performance. Shows potential but has gaps in key areas. Consider additional screening.';
  } else {
    hiringRecommendation = 'No Hire';
    justification = 'Significant gaps in fundamental understanding. Not ready for this role at this time.';
  }
  
  // Analyze score patterns for strengths and improvements
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const strongestAreas: string[] = [];
  const improvementAreas: string[] = [];
  
  // Simple heuristic: high scores = strengths, low scores = improvements
  if (avgScore >= 4) {
    strongestAreas.push('Strong technical knowledge');
    strongestAreas.push('Clear communication of concepts');
  } else if (avgScore >= 3) {
    strongestAreas.push('Good foundational understanding');
  }
  
  if (avgScore < 3) {
    improvementAreas.push('Review core concepts and fundamentals');
    improvementAreas.push('Practice explaining technical decisions');
  } else if (avgScore < 4) {
    improvementAreas.push('Deepen understanding of edge cases');
  } else {
    improvementAreas.push('Continue exploring advanced topics and system design');
  }
  
  // Add generic recommendations
  const recommendedTopics = [
    'System design principles',
    'Problem-solving strategies',
    'Code review best practices',
  ];
  
  return {
    overallScore,
    strongestAreas,
    improvementAreas,
    recommendedTopics,
    hiringRecommendation,
    justification,
  };
}
