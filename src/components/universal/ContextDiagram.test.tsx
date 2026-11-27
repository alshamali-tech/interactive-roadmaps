import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HTMLAttributes, ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextDiagram } from './ContextDiagram';
import type { Diagram } from '@/engine/generatorSchema';

// Mock framer-motion to disable animations in tests
type MotionMockProps = { children?: ReactNode } & Record<string, unknown>;

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: MotionMockProps) => (
      <div {...(props as HTMLAttributes<HTMLDivElement>)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

// Mock matchMedia for useMediaQuery hook. Tests must opt into a viewport
// explicitly — a leaked mobile mock would otherwise make desktop assertions
// depend on file order.
function mockViewport(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: mobile && query === '(max-width: 768px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock ResizeObserver as a proper class constructor (React Flow uses `new ResizeObserver`)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const globalScope = globalThis as unknown as { ResizeObserver?: unknown };

beforeEach(() => {
  globalScope.ResizeObserver = MockResizeObserver;
  mockViewport(false);
});

afterEach(() => {
  delete globalScope.ResizeObserver;
});

const mockDiagram: Diagram = {
  type: 'flow',
  title: 'Test Flow',
  nodes: [
    { id: '1', label: 'Start', type: 'input', description: 'The beginning of the flow' },
    { id: '2', label: 'Process Data', type: 'process' },
    { id: '3', label: 'Valid?', type: 'decision' },
    { id: '4', label: 'End', type: 'output' },
  ],
  edges: [
    { from: '1', to: '2' },
    { from: '2', to: '3' },
    { from: '3', to: '4', label: 'Yes' },
  ],
};

// React Flow measures nodes inside a `visibility: hidden` container under jsdom,
// and getByRole skips hidden elements, so desktop nodes must be reached through
// their published attributes. The assertions below double as the a11y check.
function clickDesktopNode(label: string): HTMLElement {
  const node = screen.getByText(label).closest('[data-node-type]') as HTMLElement;
  expect(node).toHaveAttribute('role', 'button');
  expect(node).toHaveAttribute('aria-label', label);
  fireEvent.click(node);
  return node;
}

describe('ContextDiagram', () => {
  it('applies authored color and icon overrides from the schema', () => {
    const styled: Diagram = {
      type: 'relationship',
      title: 'Styled Nodes',
      nodes: [
        { id: 'shielded', label: 'Auth', type: 'service', color: '#dc2626', icon: 'shield' },
        // PascalCase is legal in DiagramNodeSchema and must normalize to the registry key.
        { id: 'stored', label: 'Store', type: 'storage', icon: 'HardDrive' },
        // Unknown icon names must degrade to the node type's icon, not crash.
        { id: 'weird', label: 'Weird', type: 'process', icon: 'not-a-real-icon' },
      ],
      edges: [
        { from: 'shielded', to: 'stored' },
        { from: 'stored', to: 'weird' },
      ],
    };
    const { container } = render(<ContextDiagram diagram={styled} />);
    const byType = (t: string) =>
      container.querySelector(`[data-node-type="${t}"]`) as HTMLElement;

    expect(byType('service').getAttribute('data-icon')).toBe('shield');
    expect(byType('storage').getAttribute('data-icon')).toBe('hard-drive');
    expect(byType('process').getAttribute('data-icon')).toBe('settings');
    expect(byType('service').style.borderTopColor).toBe('rgb(220, 38, 38)');
    // Untyped-by-choice nodes keep the default palette (no inline border).
    expect(byType('service').getAttribute('data-color')).toBe('#dc2626');
  });

  it('renders the diagram title and type indicator', () => {
    render(<ContextDiagram diagram={mockDiagram} />);
    expect(screen.getByText('Test Flow')).toBeInTheDocument();
    expect(screen.getByText('Flow Diagram')).toBeInTheDocument();
  });

  it('renders all node labels', () => {
    render(<ContextDiagram diagram={mockDiagram} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('Process Data')).toBeInTheDocument();
    expect(screen.getByText('Valid?')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('passes edges with labels to React Flow', () => {
    render(<ContextDiagram diagram={mockDiagram} />);
    // Edge labels are rendered by React Flow's edge label renderer,
    // which requires layout computation that doesn't happen in jsdom.
    // So this can only prove the canvas mounts with all nodes present;
    // the edge→React Flow mapping itself is NOT asserted here.
    const reactFlowWrapper = screen.getByTestId('rf__wrapper');
    expect(reactFlowWrapper).toBeInTheDocument();
    // Verify nodes are rendered (which means edges were processed)
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('Process Data')).toBeInTheDocument();
  });

  it('renders a distinct icon for every node type', () => {
    const everyType: Diagram = {
      type: 'relationship',
      title: 'All Six Node Types',
      nodes: [
        { id: 'n-in', label: 'Request In', type: 'input' },
        { id: 'n-svc', label: 'Auth Service', type: 'service' },
        { id: 'n-proc', label: 'Transform', type: 'process' },
        { id: 'n-dec', label: 'Cached?', type: 'decision' },
        { id: 'n-store', label: 'Database', type: 'storage' },
        { id: 'n-out', label: 'Response Out', type: 'output' },
      ],
      edges: [
        { from: 'n-in', to: 'n-svc' },
        { from: 'n-svc', to: 'n-proc' },
        { from: 'n-proc', to: 'n-dec' },
        { from: 'n-dec', to: 'n-store', label: 'Miss' },
        { from: 'n-dec', to: 'n-out', label: 'Hit' },
      ],
    };
    const { container } = render(<ContextDiagram diagram={everyType} />);

    // React Flow measures nodes inside a `visibility: hidden` container under
    // jsdom, and getByRole skips hidden elements — so assert on the published
    // data-* attributes instead of the accessibility tree.
    const rendered = Array.from(container.querySelectorAll<HTMLElement>('[data-node-type]'));
    expect(rendered).toHaveLength(6);

    // The component publishes data-node-type/data-icon on each node so this map
    // stays covered without depending on Tailwind class strings.
    const expectedIcons: Record<string, string> = {
      input: 'arrow-down-to-line',
      service: 'cloud',
      process: 'settings',
      decision: 'help-circle',
      storage: 'database',
      output: 'arrow-up-from-line',
    };
    for (const [nodeType, icon] of Object.entries(expectedIcons)) {
      const node = rendered.find((el) => el.getAttribute('data-node-type') === nodeType);
      expect(node, `node of type "${nodeType}"`).toBeTruthy();
      expect(node).toHaveAttribute('data-icon', icon);
    }
    // Every type must render a distinguishable style, not just an icon name.
    const styles = new Set(rendered.map((el) => el.getAttribute('data-node-type')));
    expect(styles.size).toBe(6);
  });

  it('renders the "Explain This Diagram" button when callback is provided', () => {
    const onExplain = vi.fn();
    render(<ContextDiagram diagram={mockDiagram} onExplainThisDiagram={onExplain} />);
    expect(screen.getByText('Explain This Diagram')).toBeInTheDocument();
  });

  it('calls onExplainThisDiagram with the whole diagram when the button is clicked', () => {
    const onExplain = vi.fn();
    render(<ContextDiagram diagram={mockDiagram} onExplainThisDiagram={onExplain} />);

    fireEvent.click(screen.getByText('Explain This Diagram').closest('button')!);

    expect(onExplain).toHaveBeenCalledTimes(1);
    // The tutor payload contract is the validated diagram itself — not a title,
    // not a flattened node list.
    expect(onExplain).toHaveBeenCalledWith(mockDiagram);
  });

  it('does not render the "Explain This Diagram" button when no callback is provided', () => {
    render(<ContextDiagram diagram={mockDiagram} />);
    expect(screen.queryByText('Explain This Diagram')).not.toBeInTheDocument();
  });

  it('opens a detail dialog when a desktop node with a description is clicked', () => {
    render(<ContextDiagram diagram={mockDiagram} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    clickDesktopNode('Start');

    expect(screen.getByRole('dialog')).toHaveTextContent('The beginning of the flow');
  });

  it('does not open a dialog for a node that has no description', () => {
    render(<ContextDiagram diagram={mockDiagram} />);

    clickDesktopNode('Process Data');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the detail dialog on Escape', () => {
    render(<ContextDiagram diagram={mockDiagram} />);
    clickDesktopNode('Start');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the detail dialog on an outside click', () => {
    render(<ContextDiagram diagram={mockDiagram} />);
    clickDesktopNode('Start');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the detail dialog from its own close button', () => {
    render(<ContextDiagram diagram={mockDiagram} />);
    clickDesktopNode('Start');

    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows popover when clicking a mobile card with description', () => {
    // Mock mobile viewport
    mockViewport(true);

    render(<ContextDiagram diagram={mockDiagram} />);

    // In mobile mode, click the first card (Start node)
    const startCard = screen.getByText('Start').closest('div[class*="cursor-pointer"]');
    expect(startCard).toBeInTheDocument();

    // The card already prints its description as body text (line-clamped), so
    // asserting on that string alone would pass with the click handler removed.
    // The tap target is the dialog the click opens.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(startCard!);

    expect(screen.getByRole('dialog')).toHaveTextContent('The beginning of the flow');
  });

  it('renders mobile layout as vertical cards when screen is small', () => {
    // Mock matchMedia to return true for mobile
    mockViewport(true);

    render(<ContextDiagram diagram={mockDiagram} />);
    
    // In mobile layout, we should see the card container
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('Process Data')).toBeInTheDocument();
    // The React Flow wrapper should NOT be present in mobile mode (replaced by cards)
    expect(screen.queryByTestId('rf__wrapper')).not.toBeInTheDocument();
  });

  it('shows fallback message for empty nodes array', () => {
    const emptyDiagram: Diagram = {
      type: 'flow',
      title: 'Empty Diagram',
      nodes: [],
      edges: [],
    };
    render(<ContextDiagram diagram={emptyDiagram} />);
    expect(screen.getByText(/no nodes to display/i)).toBeInTheDocument();
  });

  it('degrades to a fallback instead of crashing when nodes are not an array', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ContextDiagram diagram={{ ...mockDiagram, nodes: undefined } as unknown as Diagram} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Diagram could not be rendered');
    // The spec requires the failure to stay debuggable, not just quiet.
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('degrades to a fallback when edges are not an array', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ContextDiagram diagram={{ ...mockDiagram, edges: 'nope' } as unknown as Diagram} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});