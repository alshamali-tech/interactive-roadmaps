import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'interactive-roadmaps-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const isDark = theme === 'dark' || (theme === 'system' && getSystemTheme() === 'dark');
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    // Safari private mode and blocked-storage contexts throw on access.
    return 'system';
  }
}

function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Losing the preference is better than crashing the header on toggle.
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);

    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(theme);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  const effective = theme === 'system' ? getSystemTheme() : theme;

  return { theme, setTheme, isDark: effective === 'dark' };
}
