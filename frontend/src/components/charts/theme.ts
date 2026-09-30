import { useEffect, useState, type RefObject } from 'react';

/** Token names charts need. SVG presentation attributes can't use var(), so charts resolve them. */
const TOKENS = [
  'ink',
  'muted',
  'border',
  'surface',
  'surface-2',
  'primary',
  'data-water',
  'data-temperature',
  'data-soil',
  'data-vegetation',
  'data-model',
  'success',
  'warning',
  'danger',
  'info',
] as const;

export type ChartColors = Record<(typeof TOKENS)[number], string>;

const FALLBACK: ChartColors = {
  ink: '#e7eee9',
  muted: '#8b978f',
  border: '#222d26',
  surface: '#111814',
  'surface-2': '#172019',
  primary: '#2fbf7a',
  'data-water': '#4c8df6',
  'data-temperature': '#e8a33a',
  'data-soil': '#b07a4f',
  'data-vegetation': '#3cc47c',
  'data-model': '#9b7bf0',
  success: '#2fbf7a',
  warning: '#e8a33a',
  danger: '#ef5a5a',
  info: '#4c8df6',
};

function read(el: Element): ChartColors {
  const cs = getComputedStyle(el);
  const out = { ...FALLBACK };
  for (const t of TOKENS) {
    const v = cs.getPropertyValue(`--${t}`).trim();
    if (v) out[t] = v;
  }
  return out;
}

/** Resolved token colours for the element (respects a scoped data-theme), updated on theme change. */
export function useChartColors(ref: RefObject<Element | null>): ChartColors {
  const [colors, setColors] = useState<ChartColors>(FALLBACK);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setColors(read(el));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', update);
    return () => {
      obs.disconnect();
      mq.removeEventListener('change', update);
    };
  }, [ref]);
  return colors;
}
