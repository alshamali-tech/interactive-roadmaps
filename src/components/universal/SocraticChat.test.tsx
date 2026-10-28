import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocraticChat } from './SocraticChat';

// Mock crypto.randomUUID for tests
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
});

describe('SocraticChat', () => {
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

  it('demo response appears after sending a message', async () => {
    const user = userEvent.setup();
    render(<SocraticChat />);

    const textarea = screen.getByLabelText('Chat message input');
    await user.type(textarea, 'Help me understand this');

    const sendButton = screen.getByLabelText('Send message');
    await user.click(sendButton);

    await waitFor(
      () => {
        expect(
          screen.getByText(/I'm the Socratic Tutor/i)
        ).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it('no AI connected banner is visible', () => {
    render(<SocraticChat />);
    expect(
      screen.getByText(/AI not connected/i)
    ).toBeInTheDocument();
  });
});
