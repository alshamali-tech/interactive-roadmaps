import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  EyeOff,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useSettingsStore,
  type AIProvider,
  type GenerationMode,
} from '@/engine/settings';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'cloud' | 'ollama';

interface Draft {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  generationMode: GenerationMode;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const aiSettings = useSettingsStore((s) => s.aiSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [tab, setTab] = useState<Tab>('cloud');
  const [showApiKey, setShowApiKey] = useState(false);
  const [draft, setDraft] = useState<Draft>({ ...aiSettings });
  const [errors, setErrors] = useState<string[]>([]);

  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testError, setTestError] = useState('');

  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset draft state when modal opens
  useEffect(() => {
    if (open) {
      setDraft({ ...aiSettings });
      setErrors([]);
      setTestStatus('idle');
      setTestError('');
      setShowApiKey(false);
      // Auto-select tab based on current provider
      const initialTab = aiSettings.provider === 'ollama' ? 'ollama' : 'cloud';
      setTab(initialTab);
    }
  }, [open, aiSettings]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const updateDraft = useCallback((partial: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleTabChange = useCallback(
    (newTab: Tab) => {
      setTab(newTab);
      setErrors([]); // Clear errors when switching tabs
      if (newTab === 'cloud') {
        // Switching to cloud: if current provider is ollama or none, default to openai
        if (draft.provider === 'ollama' || draft.provider === 'none') {
          updateDraft({ provider: 'openai' });
        }
      } else {
        // Switching to ollama tab
        updateDraft({ provider: 'ollama' });
      }
    },
    [draft.provider, updateDraft]
  );

  const isValid = useCallback((d: Draft): boolean => {
    if (d.provider === 'none') return false;
    if (d.provider === 'openai' || d.provider === 'groq') {
      return d.apiKey.trim() !== '' && d.model.trim() !== '';
    }
    if (d.provider === 'ollama') {
      return d.baseUrl.trim() !== '' && d.model.trim() !== '';
    }
    return false;
  }, []);

  const handleSave = () => {
    if (!isValid(draft)) {
      const errs: string[] = [];
      if (draft.provider === 'none') errs.push('Please select a provider.');
      if (
        (draft.provider === 'openai' || draft.provider === 'groq') &&
        draft.apiKey.trim() === ''
      ) {
        errs.push('API Key is required.');
      }
      if (draft.provider === 'ollama' && draft.baseUrl.trim() === '') {
        errs.push('Base URL is required.');
      }
      if (draft.model.trim() === '') errs.push('Model name is required.');
      setErrors(errs);
      return;
    }
    setErrors([]);
    updateSettings(draft);
    onClose();
  };

  const handleTestConnection = async () => {
    if (draft.baseUrl.trim() === '') return;
    setTestStatus('testing');
    setTestError('');
    try {
      // Test the OpenAI-compatible /models endpoint (matches what chat uses)
      const url = draft.baseUrl.replace(/\/+$/, '') + '/models';
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(
          'Ollama returned ' + res.status + ': ' + (await res.text())
        );
      }
    } catch {
      setTestStatus('error');
      setTestError(
        'Cannot reach Ollama at ' +
          draft.baseUrl +
          '. Make sure Ollama is running and CORS is enabled. ' +
          'Try running in PowerShell: $env:OLLAMA_ORIGINS="*"; ollama serve'
      );
    }
  };

  if (!open) return null;

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Container - Using Portal to avoid stacking context issues */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Provider Settings"
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
            <h2 className="text-lg font-semibold text-foreground">
              AI Provider Settings
            </h2>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Tabs - VISIBLE TAB NAVIGATION */}
          <div className="flex border-b border-border px-6 shrink-0" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'cloud'}
              aria-controls="panel-cloud"
              onClick={() => handleTabChange('cloud')}
              className={
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ' +
                (tab === 'cloud'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground')
              }
            >
              Cloud Providers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'ollama'}
              aria-controls="panel-ollama"
              onClick={() => handleTabChange('ollama')}
              className={
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ' +
                (tab === 'ollama'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground')
              }
            >
              Local Ollama
            </button>
          </div>

          {/* Content - Scrollable area */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Cloud Providers Tab */}
            {tab === 'cloud' && (
              <div id="panel-cloud" role="tabpanel" className="space-y-5">
                {/* Provider Radio Group */}
                <fieldset>
                  <legend className="block text-sm font-medium text-foreground mb-2">
                    Provider
                  </legend>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 -mx-2 transition-colors">
                      <input
                        ref={firstInputRef}
                        type="radio"
                        name="provider"
                        value="openai"
                        checked={draft.provider === 'openai'}
                        onChange={() => updateDraft({ provider: 'openai' })}
                        className="accent-primary size-4"
                      />
                      <span>OpenAI</span>
                    </label>
                    <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 -mx-2 transition-colors">
                      <input
                        type="radio"
                        name="provider"
                        value="groq"
                        checked={draft.provider === 'groq'}
                        onChange={() => updateDraft({ provider: 'groq' })}
                        className="accent-primary size-4"
                      />
                      <span>Groq</span>
                    </label>
                  </div>
                </fieldset>

                {/* API Key */}
                <div>
                  <label
                    htmlFor="apiKey"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      id="apiKey"
                      type={showApiKey ? 'text' : 'password'}
                      value={draft.apiKey}
                      onChange={(e) => updateDraft({ apiKey: e.target.value })}
                      placeholder={
                        draft.provider === 'groq' ? 'gsk_...' : 'sk-...'
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showApiKey ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Your API key is stored securely in your browser's local
                    storage. We never send it to our servers.
                  </p>
                </div>

                {/* Model */}
                <div>
                  <label
                    htmlFor="cloud-model"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Model
                  </label>
                  <input
                    id="cloud-model"
                    type="text"
                    value={draft.model}
                    onChange={(e) => updateDraft({ model: e.target.value })}
                    placeholder={
                      draft.provider === 'groq'
                        ? 'llama-3.1-8b-instant'
                        : 'gpt-4o-mini'
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {draft.provider === 'groq' ? (
                      <a
                        href="https://console.groq.com/docs/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        View Groq models
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <a
                        href="https://platform.openai.com/docs/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        View OpenAI models
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Local Ollama Tab */}
            {tab === 'ollama' && (
              <div id="panel-ollama" role="tabpanel" className="space-y-5">
                {/* Base URL */}
                <div>
                  <label
                    htmlFor="baseUrl"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Base URL
                  </label>
                  <input
                    ref={firstInputRef}
                    id="baseUrl"
                    type="text"
                    value={draft.baseUrl}
                    onChange={(e) => updateDraft({ baseUrl: e.target.value })}
                    placeholder="http://localhost:11434/v1"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Default:{' '}
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      http://localhost:11434/v1
                    </code>
                  </p>
                </div>

                {/* Model - OLLAMA MODEL INPUT */}
                <div>
                  <label
                    htmlFor="ollama-model"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Model
                  </label>
                  <input
                    id="ollama-model"
                    type="text"
                    value={draft.model}
                    onChange={(e) => updateDraft({ model: e.target.value })}
                    placeholder="llama3, qwen2.5, mistral, etc."
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Enter the name of the model you've pulled in Ollama
                  </p>
                </div>

                {/* Test Connection */}
                <div>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={
                      testStatus === 'testing' || draft.baseUrl.trim() === ''
                    }
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testStatus === 'testing' ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>Test Connection</>
                    )}
                  </button>

                  {testStatus === 'success' && (
                    <p className="mt-2.5 flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                      <CheckCircle className="size-4" />
                      Connected to Ollama successfully!
                    </p>
                  )}

                  {testStatus === 'error' && (
                    <div className="mt-2.5 space-y-1.5">
                      <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                        <AlertCircle className="size-4 shrink-0" />
                        Connection failed
                      </p>
                      <p className="text-xs text-muted-foreground ml-5.5">
                        {testError}
                      </p>
                      <a
                        href="https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-allow-additional-origins"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline ml-5.5 inline-flex items-center gap-1"
                      >
                        How to enable CORS in Ollama
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generation Mode — visible in all tabs */}
            <fieldset className="pt-4 border-t border-border">
              <legend className="block text-sm font-medium text-foreground mb-1.5">
                Content Generation Mode
              </legend>
              <p className="text-xs text-muted-foreground mb-3">
                Controls how the AI generates lesson content. Choose based on your model&apos;s capability.
              </p>
              <div className="space-y-2">
                <label className={`flex items-start gap-2.5 text-sm text-foreground cursor-pointer hover:bg-muted/50 rounded-lg px-3 py-2.5 -mx-1 transition-colors border ${draft.generationMode === 'focused' ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                  <input
                    type="radio"
                    name="generationMode"
                    value="focused"
                    checked={draft.generationMode === 'focused'}
                    onChange={() => updateDraft({ generationMode: 'focused' })}
                    className="accent-primary size-4 mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-foreground">Focused Content</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      AI writes natural markdown with widget markers. Better content quality.
                      <span className="text-primary font-medium"> Works with any model.</span>
                    </div>
                  </div>
                </label>
                <label className={`flex items-start gap-2.5 text-sm text-foreground cursor-pointer hover:bg-muted/50 rounded-lg px-3 py-2.5 -mx-1 transition-colors border ${draft.generationMode === 'structured' ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                  <input
                    type="radio"
                    name="generationMode"
                    value="structured"
                    checked={draft.generationMode === 'structured'}
                    onChange={() => updateDraft({ generationMode: 'structured' })}
                    className="accent-primary size-4 mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-foreground">Structured JSON</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      AI outputs JSON directly. Faster but needs strong models.
                      <span className="text-amber-600 dark:text-amber-400 font-medium"> Recommended for GPT-4, Claude, etc.</span>
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>

            {/* Validation Errors */}
            {errors.length > 0 && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 space-y-1">
                {errors.map((err, i) => (
                  <p
                    key={i}
                    className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5"
                  >
                    <AlertCircle className="size-3.5 shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!isValid(draft)}
              onClick={handleSave}
            >
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  // Use Portal to render modal outside of the app's component tree
  return createPortal(modalContent, document.body);
}
