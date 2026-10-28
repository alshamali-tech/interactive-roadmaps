import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GraduationCap, Menu, Settings, Sun, Moon, Monitor } from 'lucide-react';
import { useSidebarStore } from './sidebarStore';
import { SettingsModal } from '@/components/core/SettingsModal';
import { useSettingsStore } from '@/engine/settings';
import { useTheme } from './themeStore';

export function Header() {
  const toggle = useSidebarStore((s) => s.toggle);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const connected = useSettingsStore((s) => s.isAIConnected);
  const { theme, setTheme, isDark } = useTheme();

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const ThemeIcon =
    theme === 'system' ? Monitor : isDark ? Moon : Sun;

  const themeLabel =
    theme === 'system'
      ? 'System theme'
      : isDark
        ? 'Dark mode'
        : 'Light mode';

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-4 gap-3 sticky top-0 z-40">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={toggle}
        aria-label="Toggle sidebar"
      >
        <Menu className="size-5" />
      </Button>
      <Link to="/" className="flex items-center gap-2">
        <GraduationCap className="size-6 text-primary" />
        <h1 className="text-lg font-semibold text-foreground hidden sm:block">
          Software Engineer Academy
        </h1>
      </Link>
      <div className="flex-1" />

      <button
        onClick={cycleTheme}
        aria-label={`Change theme (currently ${themeLabel})`}
        title={`Theme: ${themeLabel} (click to change)`}
        className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <ThemeIcon className="size-5" />
      </button>

      <div className="relative" title="AI Provider Settings">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open AI settings"
        >
          <Settings className="size-5" />
        </Button>
        {connected && (
          <span
            className="absolute top-1 right-1 size-2 rounded-full bg-green-500 ring-2 ring-card"
            aria-hidden="true"
          />
        )}
      </div>
      <Button variant="outline" size="sm">
        Sign In
      </Button>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
