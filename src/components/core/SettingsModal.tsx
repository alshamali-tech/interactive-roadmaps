import { useState, useEffect } from 'react';
import { Settings, Eye, EyeOff, X, CheckCircle, AlertCircle } from 'lucide-react';
import { useSettingsStore, type AIProvider } from '@/engine/settings';
import { cn } from '@/lib/utils';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { aiSettings, updateSettings, isAIConnected } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'cloud' | 'local'>(
    aiSettings.provider === 'ollama' ? 'local' : 'cloud'
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [ollamaTestStatus, setOllamaTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');

  // Sync tab when modal opens with different provider
  useEffect(() => {
    if (open) {
      setActiveTab(aiSettings.provider === 'ollama' ? 'local' : 'cloud');
    }
  }, [open, aiSettings.provider]);

  // Listen for Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleProviderChange = (provider: AIProvider) => {
    updateSettings({ provider });
  };

  const handleTabChange = (tab: 'cloud' | 'local') => {
    setActiveTab(tab);
    setOllamaTestStatus('idle'); // Reset test status on tab switch
    if (tab === 'local' && aiSettings.provider !== 'ollama') {
      updateSettings({ provider: 'ollama' });
    }
  };

  const handleTestOllama = async () => {
    setOllamaTestStatus('testing');
    try {
      const response = await fetch(
        aiSettings.baseUrl.replace('/v1', '') + '/api/tags',
        { method: 'GET' }
      );
      setOllamaTestStatus(response.ok ? 'success' : 'error');
    } catch {
      setOllamaTestStatus('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="relative w-full max-w-2xl mx-4 bg-card rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="size-5 text-primary" />
            <h2
              id="settings-title"
              className="text-lg font-semibold text-foreground"
            >
              AI Provider Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex border-b border-border">
          <button
            role="tab"
            aria-selected={activeTab === 'cloud'}
            aria-controls="panel-cloud"
            id="tab-cloud"
            onClick={() => handleTabChange('cloud')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'cloud'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Cloud Providers
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'local'}
            aria-controls="panel-local"
            id="tab-local"
            onClick={() => handleTabChange('local')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'local'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Local Ollama
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'cloud' ? (
            <div
              role="tabpanel"
              id="panel-cloud"
              aria-labelledby="tab-cloud"
              className="space-y-6"
            >
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Provider
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="provider"
                      value="openai"
                      checked={aiSettings.provider === 'openai'}
                      onChange={() => handleProviderChange('openai')}
                      className="w-4 h-4 text-primary"
                    />
                    <span className="text-sm">OpenAI</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="provider"
                      value="groq"
                      checked={aiSettings.provider === 'groq'}
                      onChange={() => handleProviderChange('groq')}
                      className="w-4 h-4 text-primary"
                    />
                    <span className="text-sm">Groq</span>
                  </label>
                </div>
              </div>

              <div>
                <label
                  htmlFor="api-key"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  API Key
                </label>
                <div className="relative">
                  <input
                    id="api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={aiSettings.apiKey}
                    onChange={(e) => updateSettings({ apiKey: e.target.value })}
                    placeholder="sk-..."
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your API key is stored securely in your browser's local
                  storage. We never send it to our servers.
                </p>
              </div>

              <div>
                <label
                  htmlFor="model"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Model
                </label>
                <input
                  id="model"
                  type="text"
                  value={aiSettings.model}
                  onChange={(e) => updateSettings({ model: e.target.value })}
                  placeholder={
                    aiSettings.provider === 'openai'
                      ? 'gpt-4o-mini'
                      : 'llama-3.1-8b-instant'
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {aiSettings.provider === 'openai' && (
                    <a
                      href="https://platform.openai.com/docs/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      View OpenAI model documentation
                    </a>
                  )}
                  {aiSettings.provider === 'groq' && (
                    <a
                      href="https://console.groq.com/docs/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      View Groq model documentation
                    </a>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div
              role="tabpanel"
              id="panel-local"
              aria-labelledby="tab-local"
              className="space-y-6"
            >
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2">
                  <CheckCircle className="size-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Local Ollama selected
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ollama runs AI models entirely on your machine. No internet
                  needed after setup.
                </p>
              </div>

              <div>
                <label
                  htmlFor="base-url"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Base URL
                </label>
                <input
                  id="base-url"
                  type="text"
                  value={aiSettings.baseUrl}
                  onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                  placeholder="http://localhost:11434/v1"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Default:{' '}
                  <code className="px-1 py-0.5 bg-muted rounded">
                    http://localhost:11434/v1
                  </code>
                </p>
              </div>

              <div>
                <label
                  htmlFor="ollama-model"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Model Name
                </label>
                <input
                  id="ollama-model"
                  type="text"
                  value={aiSettings.model}
                  onChange={(e) => updateSettings({ model: e.target.value })}
                  placeholder="llama3.2"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Popular choices:{' '}
                  {[
                    'llama3.2',
                    'llama3.1:8b',
                    'mistral',
                    'qwen2.5',
                  ].map((m, i) => (
                    <span key={m}>
                      <button
                        type="button"
                        onClick={() => updateSettings({ model: m })}
                        className="text-primary hover:underline"
                      >
                        {m}
                      </button>
                      {i < 3 ? ' · ' : ''}
                    </span>
                  ))}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Run{' '}
                  <code className="px-1 py-0.5 bg-muted rounded">
                    ollama list
                  </code>{' '}
                  in PowerShell to see which models you have installed.
                </p>
              </div>

              <div className="pt-4 border-t border-border">
                <button
                  onClick={handleTestOllama}
                  disabled={ollamaTestStatus === 'testing'}
                  className={cn(
                    'px-4 py-2 rounded-lg font-medium transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {ollamaTestStatus === 'testing'
                    ? 'Testing...'
                    : '🔌 Test Connection'}
                </button>
                {ollamaTestStatus === 'success' && (
                  <div className="mt-2 flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="size-4" />
                    <span className="text-sm">
                      Connection successful! Ollama is running.
                    </span>
                  </div>
                )}
                {ollamaTestStatus === 'error' && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="size-4" />
                      <span className="text-sm">Connection failed</span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      Make sure Ollama is running. If you see CORS errors, start
                      Ollama with:{' '}
                      <code className="px-1 py-0.5 bg-muted rounded text-xs">
                        $env:OLLAMA_ORIGINS="*"; ollama serve
                      </code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/50">
          <div className="flex items-center gap-2 text-sm">
            {isAIConnected ? (
              <>
                <CheckCircle className="size-4 text-green-600" />
                <span className="text-foreground">Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="size-4 text-yellow-600" />
                <span className="text-muted-foreground">Not connected</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
