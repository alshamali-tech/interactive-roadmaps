/**
 * Settings Store — Zustand + localStorage persistence
 *
 * Manages AI provider configuration (OpenAI, Groq, Ollama)
 * with secure API key storage in browser localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProvider = 'none' | 'openai' | 'groq' | 'ollama';

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface SettingsState {
  aiSettings: AISettings;
  updateSettings: (settings: Partial<AISettings>) => void;
  isAIConnected: boolean;
}

function computeConnected(settings: AISettings): boolean {
  if (settings.provider === 'none') return false;
  if (settings.provider === 'openai' || settings.provider === 'groq') {
    return settings.apiKey.trim() !== '' && settings.model.trim() !== '';
  }
  if (settings.provider === 'ollama') {
    return settings.baseUrl.trim() !== '' && settings.model.trim() !== '';
  }
  return false;
}

/**
 * Standalone function to check if AI is connected.
 * Can be used outside of React components (e.g., in services).
 */
export function isAIConnected(settings: AISettings): boolean {
  return computeConnected(settings);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      aiSettings: {
        provider: 'none',
        apiKey: '',
        baseUrl: 'http://localhost:11434/v1',
        model: '',
      },
      isAIConnected: false,

      updateSettings: (settings: Partial<AISettings>) =>
        set((state) => {
          const newSettings = { ...state.aiSettings, ...settings };
          return {
            aiSettings: newSettings,
            isAIConnected: computeConnected(newSettings),
          };
        }),
    }),
    {
      name: 'software-engineer-academy-settings',
      onRehydrate: () => (state) => {
        // Recompute isAIConnected on hydration from localStorage
        if (state) {
          state.isAIConnected = computeConnected(state.aiSettings);
        }
      },
    }
  )
);
