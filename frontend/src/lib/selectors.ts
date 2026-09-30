/**
 * Pure selectors that turn API payloads into the values the UI renders.
 * Every "top", "count", "mean" and ranking shown anywhere in the app comes from here,
 * so no screen can contradict another.
 */
import type { CropBreakdownEntry, DatasetSummary, EdaMetrics } from '../api/types';

// ---------------------------------------------------------------- models

/**
 * Splits "Random Forest (GridSearchCV)" into { name: "Random Forest", tuning: "GridSearchCV" }.
 * "Dummy Regressor (Mean)" is a strategy, not tuning, so it stays whole.
 */
export function normalizeModelName(key: string): { name: string; tuning: string | null } {
  const match = /^(.*?)\s*\((GridSearchCV|RandomizedSearchCV|Optuna|tuned)\)\s*$/i.exec(key);
  if (match) return { name: match[1].trim(), tuning: match[2] };
  return { name: key.trim(), tuning: null };
}

// ---------------------------------------------------------------- crops

export interface CropRank {
  crop: string;
  avgYield: number;
  count: number;
}

/** Crops sorted by average yield, highest first. Never relies on object key order. */
export function selectCropRanking(breakdown: Record<string, CropBreakdownEntry> | null | undefined): CropRank[] {
  if (!breakdown) return [];
  return Object.entries(breakdown)
    .filter(([, v]) => v && Number.isFinite(v.avg_yield))
    .map(([crop, v]) => ({ crop, avgYield: v.avg_yield, count: v.count }))
    .sort((a, b) => b.avgYield - a.avgYield || a.crop.localeCompare(b.crop));
}

export function selectTopCrop(breakdown: Record<string, CropBreakdownEntry> | null | undefined): CropRank | null {
  return selectCropRanking(breakdown)[0] ?? null;
}

/** "Potato, Cassava, Sweet Potato and 7 more" style list for subtitles. */
export function describeList(items: string[], max = 3): string {
  if (items.length === 0) return '';
  if (items.length <= max) {
    return items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }
  return `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
}

// ---------------------------------------------------------------- yield statistics

export interface YieldStats {
  mean: number;
  median: number;
  records: number;
  /** mean / median. Well above 1 means a long right tail pulling the mean up. */
  meanToMedian: number;
  isRightSkewed: boolean;
}

/** A mean more than 15% above the median is treated as meaningfully right-skewed. */
const SKEW_THRESHOLD = 1.15;

export function selectYieldStats(eda: EdaMetrics | null | undefined): YieldStats | null {
  const s = eda?.overall_stats?.yield_kg_per_hectare;
  if (!s || !Number.isFinite(s.mean) || !Number.isFinite(s.median) || s.median === 0) return null;
  const ratio = s.mean / s.median;
  return {
    mean: s.mean,
    median: s.median,
    records: eda?.total_records ?? 0,
    meanToMedian: ratio,
    isRightSkewed: ratio > SKEW_THRESHOLD,
  };
}

// ---------------------------------------------------------------- dataset summary

export interface SummaryKpis {
  recordCount: number;
  regionCount: number;
  cropCount: number;
  crops: string[];
  meanYield: number;
  meanRainfall: number;
  meanNdvi: number;
}

export function selectSummaryKpis(summary: DatasetSummary | null | undefined): SummaryKpis | null {
  if (!summary) return null;
  const crops = [...(summary.crops_supported ?? [])].sort((a, b) => a.localeCompare(b));
  return {
    recordCount: summary.total_farms,
    regionCount: summary.total_regions,
    cropCount: crops.length,
    crops,
    meanYield: summary.avg_yield_kg_ha,
    meanRainfall: summary.avg_rainfall_mm,
    meanNdvi: summary.avg_ndvi,
  };
}
