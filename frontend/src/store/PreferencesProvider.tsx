import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isYieldUnit, type YieldUnit } from '../lib/units';
import { PreferencesContext, type Density, type Preferences, type ThemePreference } from './preferences';

const KEYS = {
  theme: 'yieldsense_theme',
  unit: 'yieldsense_unit',
  region: 'yieldsense_default_region',
  crop: 'yieldsense_default_crop',
  density: 'yieldsense_density',
  motion: 'yieldsense_reduced_motion',
};

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

function useStored<T extends string>(key: string, initial: () => T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  return [
    value,
    (v: T) => {
      setValue(v);
      write(key, v);
    },
  ];
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useStored<ThemePreference>(KEYS.theme, () => {
    const v = read(KEYS.theme);
    return v === 'dark' || v === 'light' || v === 'system' ? v : 'dark';
  });
  const [unit, setUnit] = useStored<YieldUnit>(KEYS.unit, () => {
    const v = read(KEYS.unit);
    return isYieldUnit(v) ? v : 'kg/ha';
  });
  const [defaultRegion, setDefaultRegion] = useStored<string>(KEYS.region, () => read(KEYS.region) ?? '');
  const [defaultCrop, setDefaultCrop] = useStored<string>(KEYS.crop, () => read(KEYS.crop) ?? '');
  const [density, setDensity] = useStored<Density>(KEYS.density, () =>
    read(KEYS.density) === 'compact' ? 'compact' : 'comfortable',
  );
  const [motion, setMotion] = useStored<'on' | 'off'>(KEYS.motion, () => (read(KEYS.motion) === 'on' ? 'on' : 'off'));

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-reduced-motion', motion === 'on');
  }, [motion]);

  const value = useMemo<Preferences>(
    () => ({
      theme,
      setTheme,
      unit,
      setUnit,
      defaultRegion,
      setDefaultRegion,
      defaultCrop,
      setDefaultCrop,
      density,
      setDensity,
      reducedMotion: motion === 'on',
      setReducedMotion: v => setMotion(v ? 'on' : 'off'),
    }),
    // setters from useStored are recreated each render but only close over stable keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, unit, defaultRegion, defaultCrop, density, motion],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
