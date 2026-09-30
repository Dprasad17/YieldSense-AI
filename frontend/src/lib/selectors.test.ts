import { describe, expect, it } from 'vitest';
import type { EdaMetrics } from '../api/types';
import {
  describeList,
  normalizeModelName,
  selectCropRanking,
  selectSummaryKpis,
  selectTopCrop,
  selectYieldStats,
} from './selectors';

describe('normalizeModelName', () => {
  it('strips the tuning suffix', () => {
    expect(normalizeModelName('Random Forest (GridSearchCV)')).toEqual({
      name: 'Random Forest',
      tuning: 'GridSearchCV',
    });
    expect(normalizeModelName('XGBoost (GridSearchCV)')).toEqual({ name: 'XGBoost', tuning: 'GridSearchCV' });
  });

  it('keeps non-tuning parentheses', () => {
    expect(normalizeModelName('Dummy Regressor (Mean)')).toEqual({ name: 'Dummy Regressor (Mean)', tuning: null });
    expect(normalizeModelName('LightGBM')).toEqual({ name: 'LightGBM', tuning: null });
  });
});

describe('crop ranking', () => {
  // Alphabetical key order, like the real JSON, so sorting must not rely on it.
  const breakdown = {
    Cassava: { count: 2045, avg_yield: 15047.95 },
    Maize: { count: 4121, avg_yield: 3631.01 },
    Potato: { count: 4276, avg_yield: 19980.15 },
    Rice: { count: 3388, avg_yield: 4073.04 },
    Soybean: { count: 3223, avg_yield: 1673.11 },
  };

  it('sorts by value, highest first', () => {
    expect(selectCropRanking(breakdown).map(c => c.crop)).toEqual(['Potato', 'Cassava', 'Rice', 'Maize', 'Soybean']);
  });

  it('computes the top crop', () => {
    expect(selectTopCrop(breakdown)).toEqual({ crop: 'Potato', avgYield: 19980.15, count: 4276 });
    expect(selectTopCrop({})).toBeNull();
    expect(selectTopCrop(undefined)).toBeNull();
  });
});

describe('describeList', () => {
  it('joins short lists naturally', () => {
    expect(describeList(['Potato'])).toBe('Potato');
    expect(describeList(['Potato', 'Cassava'])).toBe('Potato and Cassava');
    expect(describeList(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('summarises long lists', () => {
    expect(describeList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
    expect(describeList([])).toBe('');
  });
});

describe('selectYieldStats', () => {
  const eda = {
    total_records: 28242,
    overall_stats: {
      yield_kg_per_hectare: {
        mean: 7705.33,
        std: 8495.66,
        min: 5,
        '25%': 1991.93,
        median: 3829.5,
        '75%': 10467.67,
        max: 50141.2,
      },
    },
    crop_breakdown: {},
  } as EdaMetrics;

  it('exposes mean and median and detects the right skew', () => {
    const s = selectYieldStats(eda);
    expect(s?.mean).toBe(7705.33);
    expect(s?.median).toBe(3829.5);
    expect(s?.records).toBe(28242);
    expect(s?.meanToMedian).toBeCloseTo(2.01, 2);
    expect(s?.isRightSkewed).toBe(true);
  });

  it('is null when stats are missing', () => {
    expect(selectYieldStats(undefined)).toBeNull();
    expect(selectYieldStats({ total_records: 0, overall_stats: {}, crop_breakdown: {} })).toBeNull();
  });
});

describe('selectSummaryKpis', () => {
  it('counts crops from the list, not a typed number', () => {
    const k = selectSummaryKpis({
      total_farms: 28242,
      avg_yield_kg_ha: 7705.33,
      avg_rainfall_mm: 1149.06,
      avg_ndvi: 0.62,
      total_regions: 101,
      crops_supported: ['Rice', 'Potato', 'Wheat'],
      median_yield_kg_ha: 3829.5,
      regions: ['India'],
      year_min: 1990,
      year_max: 2013,
      missing_years: [2003],
    });
    expect(k?.cropCount).toBe(3);
    expect(k?.crops).toEqual(['Potato', 'Rice', 'Wheat']);
    expect(k?.recordCount).toBe(28242);
    expect(selectSummaryKpis(null)).toBeNull();
  });
});
