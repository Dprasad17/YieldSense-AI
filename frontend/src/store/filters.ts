import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Global context (Farm · Region · Crop · Year) shared by every screen.
 * It lives in the URL search params, so any view can be bookmarked or shared,
 * and moving between screens keeps the same context.
 */
export interface GlobalFilters {
  /** Dataset region (country). Empty = all regions. */
  region: string;
  /** Crop type. Empty = all crops. */
  crop: string;
  /** Season year. Empty = all years. */
  year: string;
  /** Selected farm id (as a string). Empty = the reference dataset. */
  farm: string;
}

export const FILTER_KEYS = ['farm', 'region', 'crop', 'year'] as const satisfies readonly (keyof GlobalFilters)[];

export function readFilters(params: URLSearchParams): GlobalFilters {
  return {
    region: params.get('region') ?? '',
    crop: params.get('crop') ?? '',
    year: params.get('year') ?? '',
    farm: params.get('farm') ?? '',
  };
}

/** Writes a patch into search params, dropping empty values. Other params are kept. */
export function applyFilters(params: URLSearchParams, patch: Partial<GlobalFilters>): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of FILTER_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key]?.trim();
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

/** Search string carrying only the global filters, for links between screens. */
export function filtersSearch(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const v = params.get(key);
    if (v) kept.set(key, v);
  }
  const s = kept.toString();
  return s ? `?${s}` : '';
}

export function useGlobalFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);

  const setFilters = useCallback(
    (patch: Partial<GlobalFilters>) => setParams(prev => applyFilters(prev, patch), { replace: true }),
    [setParams],
  );

  return { filters, setFilters, search: filtersSearch(params) };
}
