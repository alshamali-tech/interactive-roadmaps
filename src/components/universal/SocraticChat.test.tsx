import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});