import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sandbox } from './Sandbox';

describe('Sandbox Widget', () => {
  it('renders with text input and output', () => {
    render(<Sandbox inputType="text" outputType="text" initialState="Hello" />);
    
    // Check for input area (textarea) - use getAllByRole for safety
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
    
    // Check for output area (pre or div with output content)
    const output = screen.getByText('Hello');
    expect(output).toBeInTheDocument();
  });

  it('updates output when user types', async () => {
    const user = userEvent.setup();
    render(<Sandbox inputType="text" outputType="text" initialState="" />);
    
    // Get the first textarea (the input area)
    const inputs = screen.getAllByRole('textbox');
    const input = inputs[0];
    
    await user.clear(input);
    await user.type(input, 'Testing');
    
    // Wait for debounced update (300ms)
    await waitFor(() => {
      expect(screen.getByText('Testing')).toBeInTheDocument();
    }, { timeout: 500 });
  });

  it('renders iframe when outputType is html', () => {
    render(<Sandbox inputType="code" outputType="html" initialState="<h1>Hello</h1>" />);
    
    // Check for iframe element
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
  });

  it('renders reset button', () => {
    render(<Sandbox inputType="text" outputType="text" initialState="Initial" />);
    
    // Use getAllByRole for safety
    const resetButtons = screen.getAllByRole('button', { name: /reset/i });
    expect(resetButtons.length).toBeGreaterThan(0);
  });
});
