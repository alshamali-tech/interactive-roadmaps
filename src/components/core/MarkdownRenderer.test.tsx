import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { WidgetConfig } from '@/curriculum/schema';

// Mock the widget registry
vi.mock('@/engine/registry', () => ({
  widgetRegistry: {
    resolve: vi.fn((widget: WidgetConfig) => {
      if (widget.type === 'sandbox') {
        return function MockSandbox() {
          return <div data-testid="mock-sandbox">Mock Sandbox Widget</div>;
        };
      }
      return null;
    }),
  },
}));

describe('MarkdownRenderer', () => {

  it('renders basic markdown content', () => {
    const markdown = '# Hello World\n\nThis is a paragraph.';
    render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(screen.getByText('This is a paragraph.')).toBeInTheDocument();
  });

  it('renders headings with data-section-title attributes', () => {
    const markdown = '# Main Title\n\n## Section One\n\n### Subsection';
    const { container } = render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

    const h1 = container.querySelector('h1[data-section-title="Main Title"]');
    const h2 = container.querySelector('h2[data-section-title="Section One"]');
    const h3 = container.querySelector('h3[data-section-title="Subsection"]');

    expect(h1).toBeInTheDocument();
    expect(h2).toBeInTheDocument();
    expect(h3).toBeInTheDocument();
  });

  it('renders code blocks with copy button on hover', async () => {
    const markdown = '```javascript\nconst x = 10;\n```';
    const { container } = render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

    const codeBlock = container.querySelector('pre');
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock).toHaveTextContent('const x = 10;');

    // Copy button should be present
    const copyButton = screen.getByLabelText('Copy code');
    expect(copyButton).toBeInTheDocument();
  });

  it('updates UI to show success when copy button is clicked', async () => {
    const user = userEvent.setup();
    const markdown = '```javascript\nconst x = 10;\n```';
    const { container } = render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

    // Verify the correct code text is rendered in the <pre> element
    const preElement = container.querySelector('pre');
    expect(preElement).toBeInTheDocument();
    expect(preElement?.textContent?.trim()).toContain('const x = 10;');

    // Click the copy button
    const copyButton = screen.getByLabelText('Copy code');
    await user.click(copyButton);

    // Verify the UI updates to show success (the green checkmark appears).
    // This proves the copy handler executed successfully and the component
    // provides visual feedback to the user.
    await waitFor(() => {
      const svg = copyButton.querySelector('svg');
      expect(svg).toHaveClass('text-green-400');
    });
  });

  it('renders inline code with proper styling', () => {
    const markdown = 'Use the `console.log()` function.';
    const { container } = render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

    const inlineCode = container.querySelector('code:not(pre code)');
    expect(inlineCode).toBeInTheDocument();
    expect(inlineCode).toHaveTextContent('console.log()');
    expect(inlineCode).toHaveClass('bg-muted/60');
  });

  it('renders tables from GFM markdown', () => {
    const markdown = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;
    const { container } = render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();

    const headers = container.querySelectorAll('th');
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent('Header 1');
    expect(headers[1]).toHaveTextContent('Header 2');
  });

  it('renders widgets when widget syntax is present', () => {
    const markdown = '{{widget:test-sandbox}}';
    const widgets: WidgetConfig[] = [
      {
        id: 'test-sandbox',
        type: 'sandbox',
        props: {
          inputType: 'text',
          outputType: 'text',
          initialState: 'test',
        },
      },
    ];

    render(<MarkdownRenderer markdown={markdown} widgets={widgets} />);

    expect(screen.getByTestId('mock-sandbox')).toBeInTheDocument();
  });

  it('shows unknown widget message for unregistered widget types', () => {
    const markdown = '{{widget:unknown-widget}}';
    const widgets = [
      {
        id: 'unknown-widget',
        type: 'unknown',
        props: {},
      },
    ] as unknown as WidgetConfig[];

    render(<MarkdownRenderer markdown={markdown} widgets={widgets} />);

    expect(screen.getByText('Unknown widget type:')).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  describe('<widget> tag injection', () => {
    it('renders widget component when <widget> tag with valid id is used', () => {
      const markdown = '<widget id="html-tag-sandbox"></widget>';
      const widgets: WidgetConfig[] = [
        {
          id: 'html-tag-sandbox',
          type: 'sandbox',
          props: {
            inputType: 'text',
            outputType: 'text',
            initialState: 'test',
          },
        },
      ];

      render(<MarkdownRenderer markdown={markdown} widgets={widgets} />);

      expect(screen.getByTestId('mock-sandbox')).toBeInTheDocument();
    });

    it('shows red error when <widget> tag id is not found in widgets array', () => {
      const markdown = '<widget id="nonexistent-id"></widget>';
      render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

      expect(screen.getByText(/Widget Error: Configuration for ID/)).toBeInTheDocument();
      expect(screen.getByText('nonexistent-id')).toBeInTheDocument();
    });

    it('shows yellow error when widget type is not registered in the registry', () => {
      const markdown = '<widget id="unregistered-type-widget"></widget>';
      const widgets = [
        {
          id: 'unregistered-type-widget',
          type: 'some-unregistered-type',
          props: {},
        },
      ] as unknown as WidgetConfig[];

      render(<MarkdownRenderer markdown={markdown} widgets={widgets} />);

      expect(screen.getByText(/Widget Error: Component type/)).toBeInTheDocument();
      expect(screen.getByText('some-unregistered-type')).toBeInTheDocument();
    });

    it('wraps widget in not-prose div to prevent typography interference', () => {
      const markdown = '<widget id="prose-test-sandbox"></widget>';
      const widgets: WidgetConfig[] = [
        {
          id: 'prose-test-sandbox',
          type: 'sandbox',
          props: {
            inputType: 'text',
            outputType: 'text',
            initialState: 'test',
          },
        },
      ];

      const { container } = render(<MarkdownRenderer markdown={markdown} widgets={widgets} />);

      // The widget wrapper should have not-prose class
      const widgetWrapper = container.querySelector('.not-prose');
      expect(widgetWrapper).toBeInTheDocument();
      expect(widgetWrapper).toHaveClass('my-6', 'p-4', 'rounded-xl');
    });
  });

  it('injects AI prompts after every 2nd section when showAITutor is true', () => {
    const markdown = `## Section 1\n\nContent 1\n\n## Section 2\n\nContent 2\n\n## Section 3\n\nContent 3\n\n## Section 4\n\nContent 4`;
    render(<MarkdownRenderer markdown={markdown} widgets={[]} showAITutor={true} />);

    // Should have 2 AI prompts (after section 2 and section 4)
    const aiPrompts = screen.getAllByText('Have questions about this section? Use the AI Tutor to get help.');
    expect(aiPrompts).toHaveLength(2);

    const askButtons = screen.getAllByText('Ask AI');
    expect(askButtons).toHaveLength(2);
  });

  it('does not inject AI prompts when showAITutor is false', () => {
    const markdown = `## Section 1\n\nContent 1\n\n## Section 2\n\nContent 2`;
    render(<MarkdownRenderer markdown={markdown} widgets={[]} showAITutor={false} />);

    expect(screen.queryByText('Have questions about this section?')).not.toBeInTheDocument();
  });

  it('calls onAskAI callback when Ask AI button is clicked', async () => {
    const user = userEvent.setup();
    const mockOnAskAI = vi.fn();
    const markdown = `## Section 1\n\nContent 1\n\n## Section 2\n\nContent 2`;
    render(
      <MarkdownRenderer
        markdown={markdown}
        widgets={[]}
        showAITutor={true}
        onAskAI={mockOnAskAI}
      />
    );

    const askButton = screen.getByText('Ask AI');
    await user.click(askButton);

    expect(mockOnAskAI).toHaveBeenCalledWith('Section 2');
  });

  it('applies prose classes for typography', () => {
    const markdown = '# Test';
    const { container } = render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('prose');
    expect(wrapper).toHaveClass('prose-slate');
    expect(wrapper).toHaveClass('dark:prose-invert');
    expect(wrapper).toHaveClass('max-w-none');
  });

  it('renders lists correctly', () => {
    const markdown = `- Item 1\n- Item 2\n- Item 3`;
    const { container } = render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

    const listItems = container.querySelectorAll('li');
    expect(listItems).toHaveLength(3);
    expect(listItems[0]).toHaveTextContent('Item 1');
    expect(listItems[1]).toHaveTextContent('Item 2');
    expect(listItems[2]).toHaveTextContent('Item 3');
  });

  it('renders blockquotes', () => {
    const markdown = '> This is a quote';
    const { container } = render(<MarkdownRenderer markdown={markdown} widgets={[]} />);

    const blockquote = container.querySelector('blockquote');
    expect(blockquote).toBeInTheDocument();
    expect(blockquote).toHaveTextContent('This is a quote');
  });

  it('handles empty markdown gracefully', () => {
    const { container } = render(<MarkdownRenderer markdown="" widgets={[]} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('accepts custom className prop', () => {
    const markdown = '# Test';
    const { container } = render(<MarkdownRenderer markdown={markdown} widgets={[]} className="custom-class" />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('custom-class');
  });
});
