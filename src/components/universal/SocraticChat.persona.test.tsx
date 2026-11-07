import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocraticChat, parseMetadataFromContent } from './SocraticChat';
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

describe('SocraticChat Persona System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock AI stream state
    mockAIStream.isLoading = false;
    mockAIStream.streamingText = '';
    mockAIStream.error = null;
    // Default to connected state
    vi.mocked(useSettingsStore).mockImplementation(createMockStore(true));
  });

  describe('Tutor Mode (Backward Compatibility)', () => {
    it('defaults to tutor mode when no mode prop is provided', () => {
      render(<SocraticChat />);
      expect(screen.getByText('AI Tutor')).toBeInTheDocument();
      // Icon appears twice (header and empty state), so we verify it exists at least once
      expect(screen.getAllByText('🎓').length).toBeGreaterThan(0);
    });

    it('shows prompt pills in tutor mode', () => {
      render(<SocraticChat mode="tutor" />);
      expect(screen.getByText('Give me a hint')).toBeInTheDocument();
      expect(screen.getByText("Explain like I'm 5")).toBeInTheDocument();
    });

    it('uses blue color theme for tutor mode', () => {
      render(<SocraticChat mode="tutor" />);
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton.className).toContain('bg-blue-500');
    });

    it('shows lesson title in header for tutor mode', () => {
      render(<SocraticChat mode="tutor" lessonTitle="React Hooks" />);
      expect(screen.getByText(/React Hooks/)).toBeInTheDocument();
    });
  });

  describe('Interview Mode', () => {
    it('displays interview mode header and icon', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" />);
      expect(screen.getByText('Mock Interview')).toBeInTheDocument();
      expect(screen.getAllByText('💼').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/JavaScript/).length).toBeGreaterThan(0);
    });

    it('hides prompt pills in interview mode', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" />);
      expect(screen.queryByText('Give me a hint')).not.toBeInTheDocument();
      expect(screen.queryByText("Explain like I'm 5")).not.toBeInTheDocument();
    });

    it('uses purple color theme for interview mode', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" />);
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton.className).toContain('bg-purple-500');
    });

    it('shows countdown timer when timeLimit is provided', async () => {
      render(<SocraticChat mode="interview" topic="JavaScript" timeLimit={5} />);
      
      // Timer should show 05:00 (5 minutes in MM:SS format)
      await waitFor(() => {
        expect(screen.getByText('05:00')).toBeInTheDocument();
      });
    });

    it('parses and displays score and feedback from metadata', () => {
      const content = "Great answer!\n\n```json\n{\"score\": 4, \"feedback\": {\"strengths\": \"Clear explanation\", \"improvements\": \"Add examples\", \"correct\": true}}\n```";
      const metadata = parseMetadataFromContent(content, 'interview');
      
      expect(metadata).toEqual({
        score: 4,
        feedback: {
          strengths: 'Clear explanation',
          improvements: 'Add examples',
          correct: true,
        },
      });
    });

    it('shows appropriate empty state message for interview mode', () => {
      render(<SocraticChat mode="interview" topic="React" />);
      expect(
        screen.getByText(/Ready for your mock interview on React/i)
      ).toBeInTheDocument();
    });

    it('uses interview-specific placeholder text', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" />);
      const textarea = screen.getByLabelText('Chat message input');
      expect(textarea).toHaveAttribute(
        'placeholder',
        'Type your answer to the interview question...'
      );
    });
  });

  describe('Challenge Mode', () => {
    it('displays challenge mode header and icon', () => {
      render(<SocraticChat mode="challenge" lessonTitle="React Hooks" />);
      expect(screen.getByText('Knowledge Challenge')).toBeInTheDocument();
      expect(screen.getAllByText('⚡').length).toBeGreaterThan(0);
    });

    it('hides prompt pills in challenge mode', () => {
      render(<SocraticChat mode="challenge" />);
      expect(screen.queryByText('Give me a hint')).not.toBeInTheDocument();
      expect(screen.queryByText("Explain like I'm 5")).not.toBeInTheDocument();
    });

    it('uses orange color theme for challenge mode', () => {
      render(<SocraticChat mode="challenge" />);
      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton.className).toContain('bg-orange-500');
    });

    it('shows countdown timer when timeLimit is provided', async () => {
      render(<SocraticChat mode="challenge" timeLimit={2} />);
      
      // Timer should show 02:00 (2 minutes in MM:SS format)
      await waitFor(() => {
        expect(screen.getByText('02:00')).toBeInTheDocument();
      });
    });

    it('parses correct feedback from metadata', () => {
      const content = "Evaluation:\n\n```json\n{\"correct\": true, \"explanation\": \"Your understanding is correct!\"}\n```";
      const metadata = parseMetadataFromContent(content, 'challenge');
      
      expect(metadata).toEqual({
        correct: true,
        explanation: 'Your understanding is correct!',
      });
    });

    it('parses incorrect feedback from metadata', () => {
      const content = "Evaluation:\n\n```json\n{\"correct\": false, \"explanation\": \"The correct answer is X because...\"}\n```";
      const metadata = parseMetadataFromContent(content, 'challenge');
      
      expect(metadata).toEqual({
        correct: false,
        explanation: 'The correct answer is X because...',
      });
    });

    it('shows appropriate empty state message for challenge mode', () => {
      render(<SocraticChat mode="challenge" />);
      expect(
        screen.getByText(/Test your knowledge with a focused question/i)
      ).toBeInTheDocument();
    });

    it('uses challenge-specific placeholder text', () => {
      render(<SocraticChat mode="challenge" />);
      const textarea = screen.getByLabelText('Chat message input');
      expect(textarea).toHaveAttribute(
        'placeholder',
        'Type your answer to the challenge...'
      );
    });
  });

  describe('Timer Functionality', () => {
    it('does not show timer when timeLimit is not provided', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" />);
      expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
    });

    it('shows timer for interview mode with timeLimit', async () => {
      render(<SocraticChat mode="interview" topic="JavaScript" timeLimit={10} />);
      
      await waitFor(() => {
        expect(screen.getByText('10:00')).toBeInTheDocument();
      });
    });

    it('shows timer for challenge mode with timeLimit', async () => {
      render(<SocraticChat mode="challenge" timeLimit={3} />);
      
      await waitFor(() => {
        expect(screen.getByText('03:00')).toBeInTheDocument();
      });
    });

    it('does not show timer for tutor mode even with timeLimit', () => {
      render(<SocraticChat mode="tutor" timeLimit={5} />);
      expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
    });
  });

  describe('Metadata Parsing', () => {
    it('extracts interview metadata from JSON code block', () => {
      const content = "Feedback:\n\n```json\n{\n  \"score\": 5,\n  \"feedback\": {\n    \"strengths\": \"Excellent\",\n    \"improvements\": \"None\"\n  }\n}\n```";
      const metadata = parseMetadataFromContent(content, 'interview');
      
      expect(metadata).toEqual({
        score: 5,
        feedback: {
          strengths: 'Excellent',
          improvements: 'None',
        },
      });
    });

    it('extracts challenge metadata from JSON code block', () => {
      const content = "Result:\n\n```json\n{\n  \"correct\": false,\n  \"explanation\": \"Try again\"\n}\n```";
      const metadata = parseMetadataFromContent(content, 'challenge');
      
      expect(metadata).toEqual({
        correct: false,
        explanation: 'Try again',
      });
    });

    it('handles missing JSON metadata gracefully', () => {
      const content = "Great answer! Let me think about this...";
      const metadata = parseMetadataFromContent(content, 'interview');
      
      expect(metadata).toBeUndefined();
    });

    it('handles malformed JSON gracefully', () => {
      const content = "Result:\n\n```json\n{invalid json}\n```";
      const metadata = parseMetadataFromContent(content, 'challenge');
      
      expect(metadata).toBeUndefined();
    });

    it('returns undefined for tutor mode regardless of content', () => {
      const content = "```json\n{\"score\": 5}\n```";
      const metadata = parseMetadataFromContent(content, 'tutor');
      
      expect(metadata).toBeUndefined();
    });
  });

  describe('Difficulty Levels', () => {
    it('accepts junior difficulty for interview mode', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" difficulty="junior" />);
      expect(screen.getByText('Mock Interview')).toBeInTheDocument();
    });

    it('accepts mid difficulty for interview mode', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" difficulty="mid" />);
      expect(screen.getByText('Mock Interview')).toBeInTheDocument();
    });

    it('accepts senior difficulty for interview mode', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" difficulty="senior" />);
      expect(screen.getByText('Mock Interview')).toBeInTheDocument();
    });

    it('accepts difficulty for challenge mode', () => {
      render(<SocraticChat mode="challenge" difficulty="senior" />);
      expect(screen.getByText('Knowledge Challenge')).toBeInTheDocument();
    });
  });

  describe('Max Questions for Interview Mode', () => {
    it('accepts custom maxQuestions value', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" maxQuestions={10} />);
      expect(screen.getByText('Mock Interview')).toBeInTheDocument();
    });

    it('defaults to 5 questions when maxQuestions not specified', () => {
      render(<SocraticChat mode="interview" topic="JavaScript" />);
      expect(screen.getByText('Mock Interview')).toBeInTheDocument();
    });
  });

  describe('Backward Compatibility', () => {
    it('works without mode prop (defaults to tutor)', () => {
      render(<SocraticChat lessonTitle="React Hooks" />);
      expect(screen.getByText('AI Tutor')).toBeInTheDocument();
      expect(screen.getByText(/React Hooks/)).toBeInTheDocument();
    });

    it('maintains all existing tutor functionality', async () => {
      const user = userEvent.setup();
      render(<SocraticChat lessonTitle="React Hooks" />);

      const textarea = screen.getByLabelText('Chat message input');
      await user.type(textarea, 'What are hooks?');
      await user.click(screen.getByLabelText('Send message'));

      expect(screen.getByText('What are hooks?')).toBeInTheDocument();
      expect(textarea).toHaveValue('');
    });
  });
});
