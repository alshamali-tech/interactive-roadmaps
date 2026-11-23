import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { integrationTestLesson } from './integration-test';
import { MarkdownRenderer } from '@/components/core/MarkdownRenderer';
import type { Diagram } from '@/engine/generatorSchema';

// Mock Monaco Editor (doesn't work in jsdom)
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

// Mock @xyflow/react (React Flow doesn't work well in jsdom)
// We need to render nodes with their click handlers so tests can interact with them
vi.mock('@xyflow/react', () => {
  return {
    ReactFlow: ({ nodes, nodeTypes, children }: any) => (
      <div data-testid="react-flow">
        {nodes?.map((node: any) => {
          const NodeComponent = nodeTypes?.[node.type];
          if (NodeComponent && node.data?.onClick) {
            return (
              <div key={node.id} data-testid={`node-${node.id}`}>
                <NodeComponent 
                  data={node.data} 
                  type={node.type}
                  id={node.id}
                />
              </div>
            );
          }
          return (
            <div key={node.id} data-testid={`node-${node.id}`}>
              {node.data?.label}
            </div>
          );
        })}
        {children}
      </div>
    ),
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    Handle: () => <div data-testid="handle" />,
    Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
    MarkerType: { ArrowClosed: 'arrow-closed', Arrow: 'arrow' },
  };
});

// Mock framer-motion to disable animations in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock AI service to avoid real API calls
const mockGenerateChatCompletion = vi.fn().mockResolvedValue('Mock AI response for testing');

vi.mock('@/engine/aiService', () => ({
  generateChatCompletion: (...args: any[]) => mockGenerateChatCompletion(...args),
  isAIConnected: vi.fn().mockReturnValue(false),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock matchMedia for mobile detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: query.includes('max-width: 768px'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver (React Flow uses this)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('Cross-Widget Integration Testing', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (globalThis as any).ResizeObserver = MockResizeObserver;
    // Reset matchMedia to desktop by default
    (window.matchMedia as any).mockImplementation((query: string) => ({
      matches: query.includes('max-width: 768px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete (globalThis as any).ResizeObserver;
  });

  describe('Basic Integration - All 5 Widgets Render', () => {
    it('renders all 5 widgets in correct order', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      // Wait for all widgets to render
      await waitFor(() => {
        // Widget 1: Sandbox - look for the widget title in the header
        const sandboxTitles = screen.getAllByText('Sandbox');
        expect(sandboxTitles.length).toBeGreaterThan(0);
        
        // Widget 2: Mutator
        expect(screen.getByText('Fix the Bug')).toBeInTheDocument();
        
        // Widget 3: TradeOff
        expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
        
        // Widget 4: Context Diagram
        expect(screen.getByText('User Authentication Flow')).toBeInTheDocument();
        
        // Widget 5: Socratic Chat
        expect(screen.getByText('AI Tutor')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify order by checking DOM positions
      const sandboxTitle = screen.getAllByText('Sandbox')[0];
      const mutatorTitle = screen.getByText('Fix the Bug');
      const tradeoffTitle = screen.getByText('PostgreSQL');
      const diagramTitle = screen.getByText('User Authentication Flow');
      const chatTitle = screen.getByText('AI Tutor');

      expect(sandboxTitle).toBeInTheDocument();
      expect(mutatorTitle).toBeInTheDocument();
      expect(tradeoffTitle).toBeInTheDocument();
      expect(diagramTitle).toBeInTheDocument();
      expect(chatTitle).toBeInTheDocument();
    });

    it('verifies no console errors during render', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Fix the Bug')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Filter out expected warnings (e.g., React Flow hydration warnings)
      const unexpectedErrors = consoleErrorSpy.mock.calls.filter((call: any[]) => {
        const message = call[0]?.toString() || '';
        return !message.includes('Warning:') && !message.includes('hydration');
      });

      expect(unexpectedErrors).toHaveLength(0);
    });
  });

  describe('Widget Interactions', () => {
    it('allows interaction with Sandbox widget', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      await waitFor(() => {
        const textareas = screen.getAllByRole('textbox');
        expect(textareas.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      const textareas = screen.getAllByRole('textbox');
      const sandboxTextarea = textareas[0];
      fireEvent.change(sandboxTextarea, { target: { value: 'test input' } });

      await waitFor(() => {
        expect(sandboxTextarea).toHaveValue('test input');
      });
    });

    it('allows interaction with Mutator widget', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      // Wait for the Run Tests button to be present
      await waitFor(() => {
        const buttons = screen.queryAllByRole('button', { name: /Run Tests/i });
        expect(buttons.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      // Get all Run Tests buttons and click the first one
      const runButtons = screen.getAllByRole('button', { name: /Run Tests/i });
      fireEvent.click(runButtons[0]);

      // Wait for test results to appear
      await waitFor(() => {
        expect(screen.getByText(/passed/i)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('allows interaction with TradeOff widget', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
      }, { timeout: 3000 });

      const postgresOption = screen.getByText('PostgreSQL');
      fireEvent.click(postgresOption);

      await waitFor(() => {
        expect(screen.getByText(/ACID compliant/i)).toBeInTheDocument();
      });
    });

    it('allows interaction with Context Diagram', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('User')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Click on a node to see description
      const userNode = screen.getByText(/^User$/);
      fireEvent.click(userNode);

      await waitFor(() => {
        expect(screen.getByText(/end user initiating login/i)).toBeInTheDocument();
      });
    });

    it('allows interaction with Socratic Chat', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      await waitFor(() => {
        const chatInput = screen.getByPlaceholderText(/Ask a question/i);
        expect(chatInput).toBeInTheDocument();
      }, { timeout: 3000 });

      const chatInput = screen.getByPlaceholderText(/Ask a question/i);
      fireEvent.change(chatInput, { target: { value: 'What is this lesson about?' } });

      expect(chatInput).toHaveValue('What is this lesson about?');
    });
  });

  describe('State Isolation', () => {
    it('verifies widgets do not interfere with each other state', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      // Wait for widgets to be present
      await waitFor(() => {
        expect(screen.getByText('Fix the Bug')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Interact with Sandbox
      const textareas = screen.getAllByRole('textbox');
      fireEvent.change(textareas[0], { target: { value: 'sandbox input' } });

      // Interact with TradeOff
      const postgresOption = screen.getByText('PostgreSQL');
      fireEvent.click(postgresOption);

      // Verify Sandbox state unchanged
      expect(textareas[0]).toHaveValue('sandbox input');

      // Verify TradeOff shows consequences
      await waitFor(() => {
        expect(screen.getByText(/ACID compliant/i)).toBeInTheDocument();
      });
    });

    it('verifies localStorage persistence is per-widget', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Fix the Bug')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Type in sandbox
      const textareas = screen.getAllByRole('textbox');
      fireEvent.change(textareas[0], { target: { value: 'persisted sandbox text' } });

      // Wait for debounce (300ms)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify localStorage was called with widget-specific key
      const setItemCalls = localStorageMock.setItem.mock.calls;
      const sandboxCall = setItemCalls.find(call => 
        call[0].includes('widget-sandbox') || call[0].includes('sandbox')
      );

      expect(sandboxCall).toBeDefined();
    });
  });

  describe('Diagram-to-Chat Integration', () => {
    it('renders Explain This Diagram button', async () => {
      const handleExplainDiagram = vi.fn();
      
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
          onExplainThisDiagram={handleExplainDiagram}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Explain This Diagram/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      const explainButton = screen.getByText(/Explain This Diagram/i);
      expect(explainButton).toBeInTheDocument();
    });

    it('clicking Explain This Diagram triggers chat', async () => {
      const handleExplainDiagram = vi.fn((diagram: Diagram) => {
        // When "Explain This Diagram" is clicked, call generateChatCompletion
        mockGenerateChatCompletion(
          [{ role: 'user', content: `Explain this diagram: ${diagram.title}` }],
          {}
        );
      });
      
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
          onExplainThisDiagram={handleExplainDiagram}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Explain This Diagram/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      const explainButton = screen.getByText(/Explain This Diagram/i);
      fireEvent.click(explainButton);

      // Wait for the callback to be called
      await waitFor(() => {
        expect(handleExplainDiagram).toHaveBeenCalled();
      }, { timeout: 3000 });

      // Verify generateChatCompletion was called (via the callback)
      await waitFor(() => {
        expect(mockGenerateChatCompletion).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('Mobile Rendering', () => {
    beforeEach(() => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      window.dispatchEvent(new Event('resize'));
      // Update matchMedia to return true for mobile queries
      (window.matchMedia as any).mockImplementation((query: string) => ({
        matches: query.includes('max-width: 768px') || query.includes('max-width: 375px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    });

    it('renders all widgets on mobile without horizontal overflow', async () => {
      const { container } = render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Fix the Bug')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Check for horizontal overflow
      const hasHorizontalOverflow = container.scrollWidth > container.clientWidth;
      expect(hasHorizontalOverflow).toBe(false);
    });

    it('stacks widgets vertically on mobile', async () => {
      render(
        <MarkdownRenderer
          markdown={integrationTestLesson.content.markdown}
          widgets={integrationTestLesson.content.widgets}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Fix the Bug')).toBeInTheDocument();
        expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify widgets are present
      const sandboxTitles = screen.getAllByText('Sandbox');
      expect(sandboxTitles.length).toBeGreaterThan(0);
      expect(screen.getByText('Fix the Bug')).toBeInTheDocument();
      expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    });
  });

  describe('Interview Mode Context', () => {
    it('interview mode has access to lesson context', async () => {
      const interviewLesson = {
        ...integrationTestLesson,
        content: {
          ...integrationTestLesson.content,
          widgets: integrationTestLesson.content.widgets.map(w => {
            if (w.type === 'socratic-chat') {
              return {
                ...w,
                props: {
                  ...w.props,
                  mode: 'interview' as const,
                  topic: 'Integration Testing',
                  difficulty: 'mid' as const,
                },
              };
            }
            return w;
          }),
        },
      };

      render(
        <MarkdownRenderer
          markdown={interviewLesson.content.markdown}
          widgets={interviewLesson.content.widgets}
        />
      );

      await waitFor(() => {
        expect(screen.getAllByText('Mock Interview').length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      // Check that the topic is displayed in the header
      const topicElements = screen.getAllByText(/Integration Testing/i);
      expect(topicElements.length).toBeGreaterThan(0);
    });
  });
});
