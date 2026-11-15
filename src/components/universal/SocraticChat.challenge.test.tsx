import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SocraticChat, type ChallengeQuestion } from './SocraticChat';
import { useSettingsStore } from '@/engine/settings';
import * as aiService from '@/engine/aiService';

// Mock the AI stream hook
vi.mock('@/hooks/useAIStream', () => ({
  useAIStream: () => ({
    streamingText: '',
    isLoading: false,
    error: null,
    startStream: vi.fn(),
    abortStream: vi.fn(),
  }),
}));

// Mock the AI service
vi.mock('@/engine/aiService', () => ({
  generateChatCompletion: vi.fn(),
}));

describe('SocraticChat Challenge Mode', () => {
  const mockChallenges: ChallengeQuestion[] = [
    {
      question: 'What is the difference between let and const in JavaScript?',
      modelAnswer: 'let allows reassignment while const does not. Both are block-scoped.',
    },
    {
      question: 'Explain closure in JavaScript.',
      modelAnswer: 'A closure is a function that has access to variables from its outer scope even after the outer function has returned.',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset settings store and enable AI
    useSettingsStore.setState({
      isAIConnected: true,
      aiSettings: {
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: '',
        model: 'gpt-4',
        generationMode: 'focused',
      },
    });
  });

  it('renders challenge mode UI when challengeQuestions are provided', () => {
    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    expect(screen.getByText('CHALLENGE')).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(
      screen.getByText('What is the difference between let and const in JavaScript?')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type your answer here...')).toBeInTheDocument();
    expect(screen.getByText('Submit Answer')).toBeInTheDocument();
  });

  it('does not render challenge mode when no challengeQuestions are provided', () => {
    render(<SocraticChat mode="challenge" difficulty="mid" />);

    // Should render the regular chat UI instead
    expect(screen.queryByText('CHALLENGE')).not.toBeInTheDocument();
    expect(screen.queryByText('Submit Answer')).not.toBeInTheDocument();
  });

  it('disables submit button when input is empty', () => {
    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    const submitButton = screen.getByText('Submit Answer').closest('button');
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when input has content', () => {
    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    const textarea = screen.getByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'let can be reassigned' } });

    const submitButton = screen.getByText('Submit Answer').closest('button');
    expect(submitButton).not.toBeDisabled();
  });

  it('submits answer and shows evaluation on correct response', async () => {
    vi.mocked(aiService.generateChatCompletion).mockResolvedValue(
      '```json\n{\n  "correct": true,\n  "score": 90,\n  "explanation": "Your answer demonstrates excellent understanding of the topic.",\n  "modelAnswer": "let allows reassignment while const does not. Both are block-scoped."\n}\n```'
    );

    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    const textarea = screen.getByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'let can be reassigned, const cannot' } });

    const submitButton = screen.getByText('Submit Answer').closest('button');
    fireEvent.click(submitButton!);

    await waitFor(() => {
      expect(screen.getByText('Your Answer:')).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.getByText(/90\/100/)).toBeInTheDocument();
    expect(screen.getByText(/excellent understanding/)).toBeInTheDocument();
    expect(screen.getByText('Model Answer:')).toBeInTheDocument();
  });

  it('shows Try Again button on incorrect answer', async () => {
    vi.mocked(aiService.generateChatCompletion).mockResolvedValue(
      '```json\n{\n  "correct": false,\n  "score": 35,\n  "explanation": "Your answer is partially correct but missing key details.",\n  "modelAnswer": "let allows reassignment while const does not. Both are block-scoped."\n}\n```'
    );

    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    const textarea = screen.getByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'wrong answer' } });

    const submitButton = screen.getByText('Submit Answer').closest('button');
    fireEvent.click(submitButton!);

    await waitFor(() => {
      expect(screen.getByText('Incorrect')).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByText(/Try Again/)).toBeInTheDocument();
  });

  it('limits retries to MAX_CHALLENGE_RETRIES', async () => {
    vi.mocked(aiService.generateChatCompletion).mockResolvedValue(
      '```json\n{\n  "correct": false,\n  "score": 35,\n  "explanation": "Your answer is partially correct but missing key details.",\n  "modelAnswer": "let allows reassignment while const does not. Both are block-scoped."\n}\n```'
    );

    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    // First attempt
    let textarea = screen.getByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'wrong 1' } });
    fireEvent.click(screen.getByText('Submit Answer').closest('button')!);

    // After 1st attempt, 2 retries left
    await waitFor(() => {
      expect(screen.getByText(/Try Again \(2 left\)/)).toBeInTheDocument();
    }, { timeout: 2000 });

    // Try again - second attempt
    fireEvent.click(screen.getByText(/Try Again \(2 left\)/).closest('button')!);

    await waitFor(() => {
      textarea = screen.getByPlaceholderText('Type your answer here...');
    });

    fireEvent.change(textarea, { target: { value: 'wrong 2' } });
    fireEvent.click(screen.getByText('Submit Answer').closest('button')!);

    // After 2nd attempt, 1 retry left
    await waitFor(() => {
      expect(screen.getByText(/Try Again \(1 left\)/)).toBeInTheDocument();
    }, { timeout: 2000 });

    // Try again - third (final) attempt
    fireEvent.click(screen.getByText(/Try Again \(1 left\)/).closest('button')!);

    await waitFor(() => {
      textarea = screen.getByPlaceholderText('Type your answer here...');
    });

    fireEvent.change(textarea, { target: { value: 'wrong 3' } });
    fireEvent.click(screen.getByText('Submit Answer').closest('button')!);

    // After max retries (3 attempts total), Try Again button should not appear
    await waitFor(() => {
      expect(screen.queryByText(/Try Again/)).not.toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('shows Next Challenge button when multiple challenges exist', async () => {
    vi.mocked(aiService.generateChatCompletion).mockResolvedValue(
      '```json\n{\n  "correct": true,\n  "score": 90,\n  "explanation": "Your answer demonstrates excellent understanding.",\n  "modelAnswer": "let allows reassignment while const does not. Both are block-scoped."\n}\n```'
    );

    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    const textarea = screen.getByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'correct answer' } });

    fireEvent.click(screen.getByText('Submit Answer').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('Correct!')).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByText('Next Challenge')).toBeInTheDocument();
  });

  it('navigates to next challenge when Next Challenge is clicked', async () => {
    vi.mocked(aiService.generateChatCompletion).mockResolvedValue(
      '```json\n{\n  "correct": true,\n  "score": 90,\n  "explanation": "Your answer demonstrates excellent understanding.",\n  "modelAnswer": "let allows reassignment while const does not. Both are block-scoped."\n}\n```'
    );

    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    // Answer first question
    const textarea = screen.getByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'answer' } });
    fireEvent.click(screen.getByText('Submit Answer').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('Next Challenge')).toBeInTheDocument();
    }, { timeout: 2000 });

    fireEvent.click(screen.getByText('Next Challenge').closest('button')!);

    // Should now show second question
    await waitFor(() => {
      expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
      expect(
        screen.getByText('Explain closure in JavaScript.')
      ).toBeInTheDocument();
    });
  });

  it('shows completion message on last challenge', async () => {
    vi.mocked(aiService.generateChatCompletion).mockResolvedValue(
      '```json\n{\n  "correct": true,\n  "score": 90,\n  "explanation": "Your answer demonstrates excellent understanding.",\n  "modelAnswer": "let allows reassignment while const does not. Both are block-scoped."\n}\n```'
    );

    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={[mockChallenges[0]]} // Only one challenge
        difficulty="mid"
      />
    );

    const textarea = screen.getByPlaceholderText('Type your answer here...');
    fireEvent.change(textarea, { target: { value: 'answer' } });
    fireEvent.click(screen.getByText('Submit Answer').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText(/All challenges complete!/)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('hides model answer until submission', () => {
    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    // Model answer should not be visible before submission
    expect(screen.queryByText('Model Answer:')).not.toBeInTheDocument();
    expect(
      screen.queryByText(mockChallenges[0].modelAnswer)
    ).not.toBeInTheDocument();
  });

  it('shows countdown timer when timeLimit is provided', () => {
    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
        timeLimit={5}
      />
    );

    // Should show timer (5 minutes = 300 seconds = 05:00)
    expect(screen.getByText('05:00')).toBeInTheDocument();
  });

  it('does not show timer when timeLimit is not provided', () => {
    render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    // Should not show any time format
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  it('renders with purple color theme for challenge mode', () => {
    const { container } = render(
      <SocraticChat
        mode="challenge"
        challengeQuestions={mockChallenges}
        difficulty="mid"
      />
    );

    // Check for purple border class
    const challengeCard = container.querySelector('.border-purple-300');
    expect(challengeCard).toBeInTheDocument();
  });
});
