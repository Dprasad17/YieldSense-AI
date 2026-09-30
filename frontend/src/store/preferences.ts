import { createContext, useContext } from 'react';
import type { YieldUnit } from '../lib/units';

export type ThemePreference = 'dark' | 'light' | 'system';
export type Density = 'comfortable' | 'compact';

export interface Preferences {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  unit: YieldUnit;
  setUnit: (unit: YieldUnit) => void;
  /** Region/crop applied when a screen opens without a context in the URL. */
  defaultRegion: string;
  setDefaultRegion: (v: string) => void;
  defaultCrop: string;
  setDefaultCrop: (v: string) => void;
  density: Density;
  setDensity: (v: Density) => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
}

export const PreferencesContext = createContext<Preferences | null>(null);

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}
