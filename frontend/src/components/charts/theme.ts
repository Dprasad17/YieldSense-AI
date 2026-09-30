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

/** Before the computed values are read (first render, SSR), charts reference the tokens directly. */
const FALLBACK = Object.fromEntries(TOKENS.map(t => [t, `var(--${t})`])) as ChartColors;

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
