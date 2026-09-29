import { describe, expect, it } from 'vitest';
import type { EdaMetrics, ModelMetricsResponse } from '../api/types';
import {
  describeList,
  normalizeModelName,
  selectActiveModelRow,
  selectCropRanking,
  selectModelRows,
  selectSummaryKpis,
  selectTopCrop,
  selectYieldStats,
} from './selectors';

// Mirrors models/model_performance_metrics.json
const modelMetrics: ModelMetricsResponse = {
  'Dummy Regressor (Mean)': { mae: 6446.01, rmse: 8516.85, r2: -0.0, inference_latency_ms: 0.018 },
  'Linear Regression': { mae: 2730.06, rmse: 3858.79, r2: 0.7947, inference_latency_ms: 0.097 },
  'Ridge Regression': { mae: 2721.17, rmse: 3861.81, r2: 0.7944, inference_latency_ms: 0.117 },
  'Random Forest (GridSearchCV)': { mae: 1014.87, rmse: 2003.33, r2: 0.9447, inference_latency_ms: 27.062 },
  'XGBoost (GridSearchCV)': { mae: 1255.01, rmse: 2246.98, r2: 0.9304, inference_latency_ms: 1.035 },
  LightGBM: { mae: 1268.88, rmse: 2305.25, r2: 0.9267, inference_latency_ms: 1.303 },
  best_model: 'Random Forest (GridSearchCV)',
  gridsearch_cv_tuning: { random_forest_best_params: { max_depth: 12 } },
  metadata: { dataset_size: 28242, test_size: 5649 },
};

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

describe('selectModelRows', () => {
  const rows = selectModelRows(modelMetrics);

  it('includes every model, including the tuned ones the old table dropped', () => {
    expect(rows.map(r => r.name)).toEqual([
      'Random Forest',
      'XGBoost',
      'LightGBM',
      'Linear Regression',
      'Ridge Regression',
      'Dummy Regressor (Mean)',
    ]);
  });

  it('ignores non-model keys', () => {
    expect(
      rows.find(r => r.key === 'metadata' || r.key === 'gridsearch_cv_tuning' || r.key === 'best_model'),
    ).toBeUndefined();
  });

  it('flags exactly one selected model, matching best_model', () => {
    const selected = rows.filter(r => r.isSelected);
    expect(selected).toHaveLength(1);
    expect(selected[0].key).toBe('Random Forest (GridSearchCV)');
    expect(selected[0].r2).toBe(0.9447);
    expect(selected[0].rmse).toBe(2003.33);
  });

  it('flags the baseline', () => {
    expect(rows.find(r => r.isBaseline)?.name).toBe('Dummy Regressor (Mean)');
  });

  it('selectActiveModelRow and empty input', () => {
    expect(selectActiveModelRow(modelMetrics)?.name).toBe('Random Forest');
    expect(selectModelRows(null)).toEqual([]);
    expect(selectActiveModelRow({ best_model: 'Missing' })).toBeNull();
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
    });
    expect(k?.cropCount).toBe(3);
    expect(k?.crops).toEqual(['Potato', 'Rice', 'Wheat']);
    expect(k?.recordCount).toBe(28242);
    expect(selectSummaryKpis(null)).toBeNull();
  });
});
