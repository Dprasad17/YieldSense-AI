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
