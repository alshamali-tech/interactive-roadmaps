import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Sandbox } from './Sandbox';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query) => ({
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

describe('Sandbox Widget', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Basic Rendering ─────────────────────────────────────────────────────

  it('renders with text input and output', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Hello"
        title="Test Sandbox"
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Hello');
  });

  it('updates output when user types', async () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState=""
        title="Test Sandbox"
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    // Use fireEvent.change which React properly handles
    fireEvent.change(textarea, { target: { value: 'New text' } });

    // Wait for debounce (300ms) + render
    await waitFor(() => {
      expect(screen.getByText('New text')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders iframe when outputType is html', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="html"
        initialState="<p>Test</p>"
        title="HTML Sandbox"
      />
    );

    expect(screen.getByTitle('HTML Output')).toBeInTheDocument();
  });

  it('renders reset button', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Initial"
        title="Test Sandbox"
      />
    );

    expect(screen.getByLabelText('Reset to initial state')).toBeInTheDocument();
  });

  // ─── Token Counter ───────────────────────────────────────────────────────

  it('shows real-time token count', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Hello world"
        title="Test Sandbox"
      />
    );

    expect(screen.getByText(/Tokens:/)).toBeInTheDocument();
  });

  it('shows token limit progress bar when tokenLimit is set', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Hello world"
        title="Test Sandbox"
        tokenLimit={100}
      />
    );

    expect(screen.getByText(/Tokens:/)).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();
  });

  // ─── Action Buttons ──────────────────────────────────────────────────────

  it('shows Clear button', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Test"
        title="Test Sandbox"
      />
    );

    expect(screen.getByLabelText('Clear input')).toBeInTheDocument();
  });

  it('shows Copy button', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Test"
        title="Test Sandbox"
      />
    );

    expect(screen.getByLabelText('Copy to clipboard')).toBeInTheDocument();
  });

  it('shows Compare button', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Test"
        title="Test Sandbox"
      />
    );

    expect(screen.getByLabelText('Compare outputs')).toBeInTheDocument();
  });

  it('Clear button empties the input', async () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Initial text"
        title="Test Sandbox"
      />
    );

    const clearButton = screen.getByLabelText('Clear input');
    fireEvent.click(clearButton);

    await waitFor(() => {
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value).toBe('');
    }, { timeout: 3000 });
  });

  it('shows character count', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Hello"
        title="Test Sandbox"
      />
    );

    expect(screen.getByText(/characters/)).toBeInTheDocument();
  });

  // ─── State Persistence ────────────────────────────────────────────────────

  it('persists input to localStorage when widgetId is provided', async () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState=""
        title="Test Sandbox"
        widgetId="test-widget-1"
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    // Use fireEvent.change which React properly handles
    fireEvent.change(textarea, { target: { value: 'Persisted text' } });

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'sandbox-state-test-widget-1',
        expect.stringContaining('Persisted text')
      );
    }, { timeout: 3000 });
  });

  it('restores input from localStorage on mount', () => {
    localStorageMock.getItem.mockReturnValue('Restored text');

    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState=""
        title="Test Sandbox"
        widgetId="test-widget-2"
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Restored text');
  });

  // ─── JSON Output ──────────────────────────────────────────────────────────

  it('renders JSON output with collapsible tree', async () => {
    render(
      <Sandbox
        inputType="text"
        outputType="json"
        initialState='{"key": "value", "number": 42}'
        title="JSON Sandbox"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('"key"')).toBeInTheDocument();
      expect(screen.getByText('"value"')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows error for invalid JSON output', async () => {
    render(
      <Sandbox
        inputType="text"
        outputType="json"
        initialState='{invalid json}'
        title="JSON Sandbox"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  // ─── HTML Output ──────────────────────────────────────────────────────────

  it('shows View Source toggle for HTML output', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="html"
        initialState="<p>Test</p>"
        title="HTML Sandbox"
      />
    );

    expect(screen.getByLabelText('View source')).toBeInTheDocument();
  });

  // ─── Mobile Layout ────────────────────────────────────────────────────────

  it('renders mobile layout with textarea when window is small', () => {
    // Mock mobile viewport
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(max-width: 768px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <Sandbox
        inputType="code"
        outputType="text"
        initialState="console.log('mobile');"
        title="Mobile Sandbox"
      />
    );

    // Should render textarea instead of Monaco on mobile
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  // ─── Settings ─────────────────────────────────────────────────────────────

  it('shows settings button', () => {
    render(
      <Sandbox
        inputType="text"
        outputType="text"
        initialState="Test"
        title="Test Sandbox"
        widgetId="test-settings"
      />
    );

    expect(screen.getByLabelText('Settings')).toBeInTheDocument();
  });
});
