import { describe, expect, it } from 'vitest';
import { applyFilters, filtersSearch, readFilters } from './filters';

describe('global filters in the URL', () => {
  it('reads missing params as "all"', () => {
    expect(readFilters(new URLSearchParams(''))).toEqual({ region: '', crop: '', season: '' });
    expect(readFilters(new URLSearchParams('region=India&crop=Rice'))).toEqual({
      region: 'India',
      crop: 'Rice',
      season: '',
    });
  });

  it('applies a patch, drops empty values and keeps unrelated params', () => {
    const next = applyFilters(new URLSearchParams('region=India&crop=Rice&page=3'), { crop: '', season: 'Kharif' });
    expect(next.get('region')).toBe('India');
    expect(next.has('crop')).toBe(false);
    expect(next.get('season')).toBe('Kharif');
    expect(next.get('page')).toBe('3');
  });

  it('builds a shareable search string with only the global filters', () => {
    expect(filtersSearch(new URLSearchParams('region=India&page=3'))).toBe('?region=India');
    expect(filtersSearch(new URLSearchParams('page=3'))).toBe('');
  });
});
