import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { analyticsApi, dataApi, predictApi, reportsApi, soilApi, weatherApi } from '../api/endpoints';
import type { PredictionInput } from '../api/types';
import { useCan } from '../auth/context';

/** Query keys in one place so refresh/invalidate logic can target them. */
export const queryKeys = {
  summary: ['data', 'summary'] as const,
  records: (p: object) => ['data', 'records', p] as const,
  eda: ['analytics', 'eda'] as const,
  seasonalTrends: (crop: string) => ['analytics', 'seasonal-trends', crop] as const,
  farmComparison: ['analytics', 'farm-comparison'] as const,
  models: ['predict', 'models'] as const,
  activeModel: ['predict', 'models', 'active'] as const,
  recommendationsHub: ['predict', 'recommendations-hub'] as const,
  weather: (region: string, live: boolean) => ['weather', region, live] as const,
  soil: (crop: string) => ['soil', crop] as const,
};

export function useDatasetSummary() {
  return useQuery({ queryKey: queryKeys.summary, queryFn: dataApi.summary, staleTime: 5 * 60_000 });
}

export function useRecords(params: {
  page: number;
  limit: number;
  crop_type?: string;
  region?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: queryKeys.records(params),
    queryFn: () => dataApi.records(params),
    placeholderData: keepPreviousData,
  });
}

export function useEdaMetrics() {
  return useQuery({ queryKey: queryKeys.eda, queryFn: analyticsApi.edaMetrics, staleTime: 10 * 60_000 });
}

export function useSeasonalTrends(crop: string) {
  return useQuery({
    queryKey: queryKeys.seasonalTrends(crop),
    queryFn: () => analyticsApi.seasonalTrends(crop || undefined),
  });
}

export function useFarmComparison() {
  return useQuery({ queryKey: queryKeys.farmComparison, queryFn: analyticsApi.farmComparison });
}

/** Full model comparison. Only fetched for roles allowed to see model performance. */
export function useModelMetrics() {
  const can = useCan();
  return useQuery({
    queryKey: queryKeys.models,
    queryFn: predictApi.models,
    enabled: can('models'),
    staleTime: 10 * 60_000,
  });
}

/** The model that serves predictions. Available to every role. */
export function useActiveModel() {
  return useQuery({ queryKey: queryKeys.activeModel, queryFn: predictApi.activeModel, staleTime: 10 * 60_000 });
}

export function useRecommendationsHub() {
  return useQuery({ queryKey: queryKeys.recommendationsHub, queryFn: predictApi.recommendationsHub });
}

export function useWeather(region: string, live: boolean) {
  return useQuery({
    queryKey: queryKeys.weather(region, live),
    queryFn: () => weatherApi.analysis(region, live),
    placeholderData: keepPreviousData,
  });
}

export function useSoil(crop: string) {
  return useQuery({
    queryKey: queryKeys.soil(crop),
    queryFn: () => soilApi.assessment(crop),
    placeholderData: keepPreviousData,
  });
}

export function usePredict() {
  return useMutation({ mutationFn: (input: PredictionInput) => predictApi.predict(input) });
}

export function useInsights() {
  return useMutation({ mutationFn: (input: PredictionInput) => predictApi.insights(input) });
}

export function useReportExport() {
  return useMutation({ mutationFn: reportsApi.export });
}

export interface WeatherOverview {
  available_regions?: string[];
  global_averages?: { rainfall_mm: number; temperature_C: number; humidity_percent: number; sunlight_hours: number };
  total_records_analyzed?: number;
}

/** Weather endpoint without a region: global averages plus the list of every dataset region. */
export function useWeatherOverview() {
  return useQuery({
    queryKey: ['weather', 'overview'],
    queryFn: () => weatherApi.analysis('', false) as unknown as Promise<WeatherOverview>,
    staleTime: Infinity,
  });
}

/** Region names for the context switcher. */
export function useRegions() {
  const q = useWeatherOverview();
  const data = q.data?.available_regions ? [...q.data.available_regions].sort((a, b) => a.localeCompare(b)) : undefined;
  return { ...q, data };
}

/** A spread-out sample of records (several pages across the dataset) for scatter/histogram charts. */
export function useRecordSample(filters: { crop?: string; region?: string }, pages = 5, pageSize = 100) {
  return useQuery({
    queryKey: ['data', 'sample', filters, pages, pageSize],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const base = { limit: pageSize, crop_type: filters.crop || undefined, region: filters.region || undefined };
      const first = await dataApi.records({ ...base, page: 1 });
      const totalPages = first.total_pages;
      const picks = Array.from(
        new Set(Array.from({ length: pages }, (_, i) => 1 + Math.floor((i * totalPages) / pages))),
      );
      const rest = await Promise.all(picks.filter(p => p !== 1).map(page => dataApi.records({ ...base, page })));
      return { total: first.total_records, rows: [first, ...rest].flatMap(r => r.data) };
    },
  });
}
