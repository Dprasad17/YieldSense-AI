import { createContext, useContext } from 'react';
import type { YieldUnit } from '../lib/units';

export type ThemePreference = 'dark' | 'light' | 'system';

export interface Preferences {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  unit: YieldUnit;
  setUnit: (unit: YieldUnit) => void;
}

export const PreferencesContext = createContext<Preferences | null>(null);

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}
