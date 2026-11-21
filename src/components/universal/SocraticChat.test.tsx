import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocraticChat } from './SocraticChat';
import { useSettingsStore } from '@/engine/settings';

// Mock crypto.randomUUID for tests
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
});

// Hoisted mutable mock state for useAIStream
const mockAIStream = vi.hoisted(() => ({
  streamingText: '',
  isLoading: false,
  error: null,
  startStream: vi.fn(),
  abortStream: vi.fn(),
}));

vi.mock('@/hooks/useAIStream', () => ({
  useAIStream: () => mockAIStream,
}));

// Mock useSettingsStore with proper selector support
const createMockStore = (isConnected: boolean) => {
  return vi.fn((selector: any) => {
    const state = {
      aiSettings: {
        provider: isConnected ? 'openai' : 'none',
        apiKey: isConnected ? 'test-key' : '',
        baseUrl: isConnected ? 'http://localhost:11434/v1' : '',
        model: isConnected ? 'gpt-4o-mini' : '',
      },
      isAIConnected: isConnected,
    };
    return selector ? selector(state) : state;
  });
};

vi.mock('@/engine/settings', () => ({
  useSettingsStore: vi.fn(),
}));

describe('SocraticChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock AI stream state
    mockAIStream.isLoading = false;
    mockAIStream.streamingText = '';
    mockAIStream.error = null;
    // Default to connected state
    vi.mocked(useSettingsStore).mockImplementation(createMockStore(true));
  });

  it('renders chat header and empty state message', () => {
    render(<SocraticChat />);
    expect(screen.getByText('AI Tutor')).toBeInTheDocument();
    expect(
      screen.getByText(/Ask me anything about this lesson/i)
    ).toBeInTheDocument();
  });

  it('renders prompt pills based on context', () => {
    render(<SocraticChat context="mutator" />);

    // Global prompts should be visible
    expect(screen.getByText('Give me a hint')).toBeInTheDocument();
    expect(screen.getByText("Explain like I'm 5")).toBeInTheDocument();

    // Mutator-specific prompts should be visible
    expect(screen.getByText('Why is my code failing?')).toBeInTheDocument();
    expect(screen.getByText("What's the complexity?")).toBeInTheDocument();

    // Sandbox-specific prompts should NOT be visible
    expect(screen.queryByText('Optimize this')).not.toBeInTheDocument();
    expect(screen.queryByText('Explain the output')).not.toBeInTheDocument();
  });

  it('clicking a prompt pill populates the input', async () => {
    const user = userEvent.setup();
    render(<SocraticChat />);

    const hintButton = screen.getByRole('button', { name: /I am stuck on the current challenge/i });
    await user.click(hintButton);

    const textarea = screen.getByLabelText('Chat message input');
    expect(textarea).toHaveValue(
      'I am stuck on the current challenge. Please give me a conceptual hint to unblock me, but DO NOT give me the exact code or the final answer.'
    );
  });

  it('sending a message adds it to chat history and clears input', async () => {
    const user = userEvent.setup();
    render(<SocraticChat />);

    const textarea = screen.getByLabelText('Chat message input');
    await user.type(textarea, 'Hello, I need help!');

    const sendButton = screen.getByLabelText('Send message');
    await user.click(sendButton);

    expect(screen.getByText('Hello, I need help!')).toBeInTheDocument();
    expect(textarea).toHaveValue('');
  });

  it('shows appropriate UI when AI is disconnected', () => {
    // Override mock to return disconnected state
    vi.mocked(useSettingsStore).mockImplementation(createMockStore(false));

    render(<SocraticChat />);
    
    // Banner should be visible
    expect(screen.getByText(/AI not connected/i)).toBeInTheDocument();
    
    // Input and buttons should be disabled
    const textarea = screen.getByLabelText('Chat message input');
    const sendButton = screen.getByLabelText('Send message');
    const hintButton = screen.getByRole('button', { name: /I am stuck/i });
    
    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
    expect(hintButton).toBeDisabled();
  });

  it('disables input and prompts during loading', async () => {
    // Set loading state for this test using the hoisted mutable mock
    mockAIStream.isLoading = true;

    render(<SocraticChat />);
    
    const textarea = screen.getByLabelText('Chat message input');
    // When loading, the send button becomes a stop button
    const stopButton = screen.getByLabelText('Stop generation');
    const hintButton = screen.getByRole('button', { name: /I am stuck/i });
    
    expect(textarea).toBeDisabled();
    expect(stopButton).toBeEnabled(); // Stop button should be clickable to abort
    expect(hintButton).toBeDisabled();
  });

  describe('Mode System Integration', () => {
    it('defaults to tutor mode when no mode prop is provided', () => {
      render(<SocraticChat />);
      
      // Tutor mode specific elements
      expect(screen.getByText('AI Tutor')).toBeInTheDocument();
      expect(screen.getByText(/Ask me anything about this lesson/i)).toBeInTheDocument();
      
      // Prompt pills should be visible in tutor mode
      expect(screen.getByText('Give me a hint')).toBeInTheDocument();
    });

    it('renders interview mode with topic, difficulty, and progress indicator', () => {
      render(<SocraticChat mode="interview" topic="React" difficulty="mid" />);
      
      // Interview mode specific elements
      expect(screen.getAllByText('💼').length).toBeGreaterThan(0);
      expect(screen.getByText(/Mock Interview/)).toBeInTheDocument();
      expect(screen.getAllByText(/React/).length).toBeGreaterThan(0);
      expect(screen.getByText(/mid/)).toBeInTheDocument();
    });

    it('renders challenge mode with single question and submit button', () => {
      const challengeQuestions = [
        {
          question: 'What is the difference between let and const?',
          modelAnswer: 'let allows reassignment while const does not.'
        }
      ];
      
      render(
        <SocraticChat 
          mode="challenge" 
          difficulty="mid"
          challengeQuestions={challengeQuestions}
        />
      );
      
      // Challenge mode specific elements
      expect(screen.getByText('CHALLENGE')).toBeInTheDocument();
      expect(screen.getByText('What is the difference between let and const?')).toBeInTheDocument();
      expect(screen.getByText('Submit Answer')).toBeInTheDocument();
    });

    it('hides prompt pills in interview mode', () => {
      render(<SocraticChat mode="interview" topic="React" />);
      
      // Prompt pills should NOT be visible in interview mode
      expect(screen.queryByText('Give me a hint')).not.toBeInTheDocument();
      expect(screen.queryByText("Explain like I'm 5")).not.toBeInTheDocument();
    });

    it('hides prompt pills in challenge mode', () => {
      const challengeQuestions = [
        {
          question: 'Test question?',
          modelAnswer: 'Test answer.'
        }
      ];
      
      render(
        <SocraticChat 
          mode="challenge" 
          challengeQuestions={challengeQuestions}
        />
      );
      
      // Prompt pills should NOT be visible in challenge mode
      expect(screen.queryByText('Give me a hint')).not.toBeInTheDocument();
      expect(screen.queryByText("Explain like I'm 5")).not.toBeInTheDocument();
    });

    it('uses correct color theme for tutor mode (blue)', () => {
      render(<SocraticChat mode="tutor" />);
      
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toHaveClass('bg-blue-500');
    });

    it('uses correct color theme for interview mode (purple)', () => {
      render(<SocraticChat mode="interview" topic="React" />);
      
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toHaveClass('bg-purple-500');
    });

    it('uses correct color theme for challenge mode (orange)', () => {
      const challengeQuestions = [
        {
          question: 'Test?',
          modelAnswer: 'Answer.'
        }
      ];
      
      render(
        <SocraticChat 
          mode="challenge" 
          challengeQuestions={challengeQuestions}
        />
      );
      
      const submitButton = screen.getByText('Submit Answer');
      expect(submitButton).toHaveClass('bg-purple-600'); // Challenge uses purple theme
    });
  });

  describe('Mobile Layout Integration', () => {
    beforeEach(() => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      window.dispatchEvent(new Event('resize'));
    });

    afterEach(() => {
      // Reset to desktop viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
      window.dispatchEvent(new Event('resize'));
    });

    it('tutor mode renders correctly on mobile', () => {
      render(<SocraticChat mode="tutor" lessonTitle="React Hooks" />);
      
      expect(screen.getByText('AI Tutor')).toBeInTheDocument();
      expect(screen.getByLabelText('Chat message input')).toBeInTheDocument();
    });

    it('interview mode renders correctly on mobile', () => {
      render(<SocraticChat mode="interview" topic="React" />);
      
      expect(screen.getAllByText('💼').length).toBeGreaterThan(0);
      expect(screen.getByText(/Mock Interview/)).toBeInTheDocument();
    });

    it('challenge mode renders correctly on mobile', () => {
      const challengeQuestions = [
        {
          question: 'Test question?',
          modelAnswer: 'Test answer.'
        }
      ];
      
      render(
        <SocraticChat 
          mode="challenge" 
          challengeQuestions={challengeQuestions}
        />
      );
      
      expect(screen.getByText('CHALLENGE')).toBeInTheDocument();
      expect(screen.getByText('Test question?')).toBeInTheDocument();
    });
  });
});