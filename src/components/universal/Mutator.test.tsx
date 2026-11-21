import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Mutator } from './Mutator';

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, theme }: any) => (
    <div data-testid="monaco-editor" data-theme={theme}>
      <textarea
        data-testid="monaco-textarea"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
      />
    </div>
  ),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('Mutator Widget', () => {
  const defaultProps = {
    language: 'javascript' as const,
    brokenCode: 'function add(a, b) { return a - b; }',
    testCases: ['add(2, 3) => 5', 'add(1, 1) => 2'],
    hint: 'Check the operator',
    title: 'Fix the Add Function'
  };

  beforeEach(() => {
    // Default to desktop viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with code editor and Run button', () => {
    render(<Mutator {...defaultProps} />);
    
    // Check for mocked Monaco editor
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toBeInTheDocument();
    
    // Check for Run Tests button
    const runButtons = screen.getAllByRole('button', { name: /run tests/i });
    expect(runButtons.length).toBeGreaterThan(0);
  });

  it('Run Tests button triggers execution state and shows results', async () => {
    render(<Mutator {...defaultProps} />);
    
    const runButton = screen.getAllByRole('button', { name: /run tests/i })[0];
    await userEvent.click(runButton);
    
    // Check for test results (wait for 1.2s timeout in component)
    await waitFor(() => {
      expect(screen.getByText(/Test 1:/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('hint button is disabled initially and enabled after 2 failed runs', async () => {
    render(<Mutator {...defaultProps} />);
    
    const hintButton = screen.getByRole('button', { name: /show hint/i });
    expect(hintButton).toBeDisabled();
    
    // Run tests twice (both will fail because code is broken)
    const runButton = screen.getAllByRole('button', { name: /run tests/i })[0];
    
    await userEvent.click(runButton);
    await waitFor(() => expect(screen.getByText(/Test 1:/)).toBeInTheDocument(), { timeout: 3000 });
    
    // Hint should still be disabled after 1 failure
    expect(hintButton).toBeDisabled();
    
    await userEvent.click(runButton);
    await waitFor(() => expect(screen.getAllByText(/Test 1:/).length).toBeGreaterThan(0), { timeout: 3000 });
    
    // Now hint should be enabled
    expect(hintButton).not.toBeDisabled();
  });

  it('shows hint text when hint button is clicked after 2 failures', async () => {
    render(<Mutator {...defaultProps} />);
    
    const runButton = screen.getAllByRole('button', { name: /run tests/i })[0];
    
    // Fail twice
    await userEvent.click(runButton);
    await waitFor(() => expect(screen.getByText(/Test 1:/)).toBeInTheDocument(), { timeout: 3000 });
    
    await userEvent.click(runButton);
    await waitFor(() => expect(screen.getAllByText(/Test 1:/).length).toBeGreaterThan(0), { timeout: 3000 });
    
    // Click hint
    const hintButton = screen.getByRole('button', { name: /show hint/i });
    await userEvent.click(hintButton);
    
    expect(screen.getByText(/Check the operator/)).toBeInTheDocument();
  });

  it('shows reset confirmation dialog when reset is clicked', async () => {
    render(<Mutator {...defaultProps} />);
    
    const resetButton = screen.getByRole('button', { name: /reset code/i });
    await userEvent.click(resetButton);
    
    expect(screen.getByText(/Reset Code\?/)).toBeInTheDocument();
    expect(screen.getByText(/This will erase all your changes/)).toBeInTheDocument();
  });

  it('resets code when confirmation is accepted', async () => {
    render(<Mutator {...defaultProps} />);
    
    // Change code
    const textarea = screen.getByTestId('monaco-textarea');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'new code');
    expect(textarea).toHaveValue('new code');
    
    // Click reset
    const resetButton = screen.getByRole('button', { name: /reset code/i });
    await userEvent.click(resetButton);
    
    // Confirm
    const confirmButton = screen.getByRole('button', { name: /yes, reset/i });
    await userEvent.click(confirmButton);
    
    // Code should be back to original
    expect(textarea).toHaveValue(defaultProps.brokenCode);
  });

  it('shows success overlay when all tests pass', async () => {
    const fixedCode = 'function add(a, b) { return a + b; }';
    
    render(<Mutator {...defaultProps} brokenCode={fixedCode} />);
    
    const runButton = screen.getAllByRole('button', { name: /run tests/i })[0];
    await userEvent.click(runButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Lesson Complete!/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders mobile layout with textarea when window is small', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    });
    window.dispatchEvent(new Event('resize'));
    
    render(<Mutator {...defaultProps} />);
    
    // Should show reference code block
    expect(screen.getByText(/Original Broken Code/)).toBeInTheDocument();
    
    // Should show textarea for editing (not the monaco editor)
    const textareas = screen.getAllByRole('textbox');
    expect(textareas.length).toBeGreaterThan(0);
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();
  });

  it('uses dark theme when dark mode is active', () => {
    // Mock dark mode
    document.documentElement.classList.add('dark');
    
    render(<Mutator {...defaultProps} />);
    
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toHaveAttribute('data-theme', 'vs-dark');
    
    document.documentElement.classList.remove('dark');
  });

  it('uses light theme when dark mode is not active', () => {
    document.documentElement.classList.remove('dark');
    
    render(<Mutator {...defaultProps} />);
    
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toHaveAttribute('data-theme', 'light');
  });

  it('shows "Proceed to Next Lesson" button when onNextLesson is provided and all tests pass', async () => {
    const onNextLesson = vi.fn();
    const fixedCode = 'function add(a, b) { return a + b; }';
    
    render(<Mutator {...defaultProps} brokenCode={fixedCode} onNextLesson={onNextLesson} />);
    
    const runButton = screen.getAllByRole('button', { name: /run tests/i })[0];
    await userEvent.click(runButton);
    
    await waitFor(() => {
      const nextButton = screen.getByRole('button', { name: /proceed to next lesson/i });
      expect(nextButton).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
