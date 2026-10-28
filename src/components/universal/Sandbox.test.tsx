import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sandbox } from './Sandbox';

describe('Sandbox Widget', () => {
  it('renders with text input and output', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Hello"
        processFunction="function process(input) { return input; }"
      />
    );

    // Both the textarea (input) and pre (output) contain "Hello" initially
    const matches = screen.getAllByText('Hello');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('updates output when user types', async () => {
    const user = userEvent.setup();
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState=""
        processFunction="function process(input) { return input.toUpperCase(); }"
      />
    );

    const textarea = screen.getByPlaceholderText('Type here...');
    await user.clear(textarea);
    await user.type(textarea, 'world');

    // Wait for debounce (300ms) + a buffer
    await new Promise((r) => setTimeout(r, 400));

    expect(screen.getByText('WORLD')).toBeInTheDocument();
  });

  it('renders iframe when outputType is html', () => {
    const { container } = render(
      <Sandbox
        inputType="text"
        outputType="html"
        initialState="<h1>Hi</h1>"
        processFunction="function process(input) { return input; }"
      />
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
  });

  it('renders reset button', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="initial"
        processFunction="function process(input) { return input; }"
      />
    );
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });
});
