import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from './SettingsModal';
import { useSettingsStore } from '@/engine/settings';

describe('SettingsModal', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      aiSettings: {
        provider: 'none',
        apiKey: '',
        baseUrl: 'http://localhost:11434/v1',
        model: '',
      },
      isAIConnected: false,
    });
  });

  it('renders Cloud Providers tab by default', () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    expect(screen.getByRole('tab', { name: /Cloud Providers/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Local Ollama/i })).toBeInTheDocument();
    expect(screen.getByText('Provider')).toBeInTheDocument();
  });

  it('API key input has type password by default', () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    const apiKeyInput = screen.getByLabelText('API Key');
    expect(apiKeyInput).toHaveAttribute('type', 'password');
  });

  it('clicking eye icon toggles API key visibility', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} />);

    const apiKeyInput = screen.getByLabelText('API Key');
    const toggleButton = screen.getByLabelText('Show API key');

    expect(apiKeyInput).toHaveAttribute('type', 'password');
    await user.click(toggleButton);
    expect(apiKeyInput).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Hide API key')).toBeInTheDocument();
  });

  it('switches to Local Ollama tab when clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} />);

    const localTab = screen.getByRole('tab', { name: /Local Ollama/i });
    await user.click(localTab);

    expect(screen.getByText('Base URL')).toBeInTheDocument();
    expect(screen.getByText('🔌 Test Connection')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    const { container } = render(
      <SettingsModal open={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('Close button closes the modal', async () => {
    const user = userEvent.setup();
    let closed = false;
    render(<SettingsModal open={true} onClose={() => { closed = true; }} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });

  it('Escape key closes the modal', async () => {
    const user = userEvent.setup();
    let closed = false;
    render(<SettingsModal open={true} onClose={() => { closed = true; }} />);

    await user.keyboard('{Escape}');
    expect(closed).toBe(true);
  });

  it('backdrop click closes the modal', async () => {
    const user = userEvent.setup();
    let closed = false;
    render(<SettingsModal open={true} onClose={() => { closed = true; }} />);

    // Click the backdrop (the outermost dialog element)
    const backdrop = screen.getByRole('dialog');
    await user.click(backdrop);
    expect(closed).toBe(true);
  });
});
