import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
        generationMode: 'focused',
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

  it('renders Content Generation Mode section', () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    expect(screen.getByText('Content Generation Mode')).toBeInTheDocument();
    expect(screen.getByText('Focused Content')).toBeInTheDocument();
    expect(screen.getByText('Structured JSON')).toBeInTheDocument();
  });

  it('focused mode is selected by default', () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    const focusedRadio = screen.getByDisplayValue('focused');
    expect(focusedRadio).toBeChecked();
  });

  it('switching to structured mode updates draft state', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} />);

    const structuredRadio = screen.getByDisplayValue('structured');
    await user.click(structuredRadio);
    expect(structuredRadio).toBeChecked();
  });

  it('saves generationMode to store when Save is clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} />);

    // Select structured mode
    const structuredRadio = screen.getByDisplayValue('structured');
    await user.click(structuredRadio);

    // Fill required fields
    const openaiRadio = screen.getByDisplayValue('openai');
    await user.click(openaiRadio);
    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.type(screen.getByLabelText('Model'), 'gpt-4');

    await user.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(useSettingsStore.getState().aiSettings.generationMode).toBe('structured');
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
    expect(screen.getByText(/Test Connection/i)).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    const { container } = render(
      <SettingsModal open={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('Cancel button closes the modal', async () => {
    const user = userEvent.setup();
    let closed = false;
    render(<SettingsModal open={true} onClose={() => { closed = true; }} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
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

    const backdrop = screen.getByRole('dialog');
    await user.click(backdrop);
    expect(closed).toBe(true);
  });

  it('Save button is disabled when cloud provider fields are empty', () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    const saveButton = screen.getByRole('button', { name: 'Save Settings' });
    expect(saveButton).toBeDisabled();
  });

  it('Save button is enabled when cloud provider fields are filled', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} />);

    const openaiRadio = screen.getByDisplayValue('openai');
    await user.click(openaiRadio);

    const apiKeyInput = screen.getByLabelText('API Key');
    await user.type(apiKeyInput, 'sk-test-key');

    const modelInput = screen.getByLabelText('Model');
    await user.type(modelInput, 'gpt-4o-mini');

    const saveButton = screen.getByRole('button', { name: 'Save Settings' });
    expect(saveButton).not.toBeDisabled();
  });

  it('Save button is disabled when Ollama fields are empty', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} />);

    const localTab = screen.getByRole('tab', { name: /Local Ollama/i });
    await user.click(localTab);

    const saveButton = screen.getByRole('button', { name: 'Save Settings' });
    expect(saveButton).toBeDisabled();
  });

  it('saves settings to the store when Save is clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} />);

    const groqRadio = screen.getByDisplayValue('groq');
    await user.click(groqRadio);

    const apiKeyInput = screen.getByLabelText('API Key');
    fireEvent.change(apiKeyInput, { target: { value: 'gsk_test123' } });

    const modelInput = screen.getByLabelText('Model');
    fireEvent.change(modelInput, { target: { value: 'llama-3.1-8b-instant' } });

    const saveButton = screen.getByRole('button', { name: 'Save Settings' });
    await user.click(saveButton);

    const storeState = useSettingsStore.getState();
    expect(storeState.aiSettings.provider).toBe('groq');
    expect(storeState.aiSettings.apiKey).toBe('gsk_test123');
    expect(storeState.aiSettings.model).toBe('llama-3.1-8b-instant');
    expect(storeState.isAIConnected).toBe(true);
  });
});