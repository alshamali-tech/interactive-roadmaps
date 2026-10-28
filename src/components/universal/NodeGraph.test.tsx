import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeGraph } from './NodeGraph';

describe('NodeGraph', () => {
  it('renders the toolbar buttons', () => {
    render(<NodeGraph initialNodes={[]} initialEdges={[]} />);

    expect(screen.getByRole('button', { name: /Add Node/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument();
  });

  it('displays node and edge count', () => {
    render(<NodeGraph initialNodes={[]} initialEdges={[]} />);

    expect(screen.getByText(/0 nodes · 0 edges/i)).toBeInTheDocument();
  });

  it('add node button adds a node', async () => {
    const user = userEvent.setup();
    render(<NodeGraph initialNodes={[]} initialEdges={[]} />);

    const addButton = screen.getByRole('button', { name: /Add Node/i });
    await user.click(addButton);

    // Node count should update from "0 nodes" to "1 nodes"
    expect(screen.getByText(/1 nodes/i)).toBeInTheDocument();
  });
});
