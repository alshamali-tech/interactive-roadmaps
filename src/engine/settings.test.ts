import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settings';

describe('Settings Store', () => {
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

  it('isAIConnected is false when provider is none', () => {
    useSettingsStore.getState().updateSettings({
      provider: 'none',
      apiKey: 'sk-test-key',
      model: 'gpt-4',
    });
    expect(useSettingsStore.getState().isAIConnected).toBe(false);
  });

  it('isAIConnected is false if OpenAI is selected but apiKey is empty', () => {
    useSettingsStore.getState().updateSettings({
      provider: 'openai',
      apiKey: '',
      model: 'gpt-4o-mini',
    });
    expect(useSettingsStore.getState().isAIConnected).toBe(false);
  });

  it('isAIConnected is true when Groq has valid key and model', () => {
    useSettingsStore.getState().updateSettings({
      provider: 'groq',
      apiKey: 'gsk_test123',
      model: 'llama-3.1-8b-instant',
    });
    expect(useSettingsStore.getState().isAIConnected).toBe(true);
  });

  it('isAIConnected is true when Ollama has baseUrl and model', () => {
    useSettingsStore.getState().updateSettings({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3',
    });
    expect(useSettingsStore.getState().isAIConnected).toBe(true);
  });

  it('isAIConnected is false when Ollama model is empty', () => {
    useSettingsStore.getState().updateSettings({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: '',
    });
    expect(useSettingsStore.getState().isAIConnected).toBe(false);
  });

  it('updateSettings merges with existing settings', () => {
    useSettingsStore.getState().updateSettings({ provider: 'openai', apiKey: 'sk-test' });
    const state = useSettingsStore.getState().aiSettings;
    expect(state.provider).toBe('openai');
    expect(state.apiKey).toBe('sk-test');
    expect(state.baseUrl).toBe('http://localhost:11434/v1');
  });
});
