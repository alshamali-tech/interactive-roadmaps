import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeGraph } from './NodeGraph';

// ── Mock Data ──────────────────────────────────────────────────────
const mockNodes = [
  { id: 'n1', type: 'input' as const, position: { x: 0, y: 0 }, label: 'Start' },
  { id: 'n2', type: 'process' as const, position: { x: 200, y: 0 }, label: 'Process' },
];

const mockEdges = [
  { id: 'e1', source: 'n1', target: 'n2' },
];

describe('NodeGraph', () => {
  it('renders the Run Pipeline button', () => {
    render(<NodeGraph initialNodes={mockNodes} initialEdges={mockEdges} />);
    
    // Use getAllByRole since there might be multiple buttons, then check at least one exists
    const buttons = screen.getAllByRole('button', { name: /run pipeline/i });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('toggles button text to Running when clicked', async () => {
    const user = userEvent.setup();
    render(<NodeGraph initialNodes={mockNodes} initialEdges={mockEdges} />);

    // Get all buttons and click the first one
    const buttons = screen.getAllByRole('button', { name: /run pipeline/i });
    const button = buttons[0];
    
    await user.click(button);

    await waitFor(() => {
      // Check that at least one button now shows "Running"
      const runningButtons = screen.getAllByRole('button', { name: /running/i });
      expect(runningButtons.length).toBeGreaterThan(0);
    });
  });
});
