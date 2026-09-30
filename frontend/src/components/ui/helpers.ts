import type { Column, Tone } from './index';

/** Low/Medium/High style ratings mapped to tones in one place. */
export function ratingTone(rating: string | null | undefined, higherIsBetter = true): Tone {
  const r = (rating ?? '').toLowerCase();
  if (r === 'high') return higherIsBetter ? 'success' : 'danger';
  if (r === 'medium' || r === 'moderate') return 'warning';
  if (r === 'low') return higherIsBetter ? 'danger' : 'success';
  if (r === 'optimal') return 'success';
  if (r === 'critical') return 'danger';
  return 'neutral';
}

/** Client-side sort helper for DataTable. */
export function sortRows<T>(rows: T[], columns: Column<T>[], sort: { key: string; dir: 'asc' | 'desc' } | null): T[] {
  const col = sort ? columns.find(c => c.key === sort.key) : undefined;
  if (!sort || !col?.sortValue) return rows;
  const get = col.sortValue;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}
