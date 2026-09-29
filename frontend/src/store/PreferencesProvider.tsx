import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isYieldUnit, type YieldUnit } from '../lib/units';
import { PreferencesContext, type Preferences, type ThemePreference } from './preferences';

const THEME_KEY = 'yieldsense_theme';
const UNIT_KEY = 'yieldsense_unit';

// Dark stays the default until every legacy screen has migrated to tokens (they assume a dark canvas).
const DEFAULT_THEME: ThemePreference = 'dark';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference just won't persist.
  }
}

function initialTheme(): ThemePreference {
  const v = read(THEME_KEY);
  return v === 'dark' || v === 'light' || v === 'system' ? v : DEFAULT_THEME;
}

function initialUnit(): YieldUnit {
  const v = read(UNIT_KEY);
  return isYieldUnit(v) ? v : 'kg/ha';
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);
  const [unit, setUnitState] = useState<YieldUnit>(initialUnit);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const value = useMemo<Preferences>(
    () => ({
      theme,
      setTheme: next => {
        setThemeState(next);
        write(THEME_KEY, next);
      },
      unit,
      setUnit: next => {
        setUnitState(next);
        write(UNIT_KEY, next);
      },
    }),
    [theme, unit],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
