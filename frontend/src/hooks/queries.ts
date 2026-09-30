import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminApi,
  analyticsApi,
  dataApi,
  farmsApi,
  notificationsApi,
  predictApi,
  publicApi,
  recommendationsApi,
  reportsApi,
  riskApi,
  soilApi,
  weatherApi,
} from '../api/endpoints';
import type { ContextQuery, PredictionInput, RecommendationAction } from '../api/types';
import { useCan } from '../auth/context';

/** Turns the global filters (empty = all) into API query params. */
export function contextQuery(f: { region?: string; crop?: string }): ContextQuery {
  return { region: f.region || undefined, crop: f.crop || undefined };
}

export const queryKeys = {
  publicStats: ['public', 'stats'] as const,
  summary: ['data', 'summary'] as const,
  records: (p: object) => ['data', 'records', p] as const,
  eda: ['analytics', 'eda'] as const,
  edaCharts: (q: ContextQuery) => ['analytics', 'eda-charts', q] as const,
  regions: (crop?: string, limit?: number) => ['analytics', 'regions', crop ?? '', limit ?? 0] as const,
  seasonalTrends: (q: ContextQuery) => ['analytics', 'seasonal-trends', q] as const,
  farmComparison: (q: object) => ['analytics', 'farm-comparison', q] as const,
  models: ['predict', 'models'] as const,
  activeModel: ['predict', 'models', 'active'] as const,
  recommendationsHub: (q: ContextQuery) => ['recommendations', 'hub', q] as const,
  tasks: ['recommendations', 'tasks'] as const,
  history: (p: object) => ['predictions', p] as const,
  weather: (region: string, live: boolean) => ['weather', region, live] as const,
  soil: (crop: string, region?: string) => ['soil', crop, region ?? ''] as const,
  risk: (q: ContextQuery) => ['risk', q] as const,
  farms: (p: object) => ['farms', p] as const,
  farm: (id: string) => ['farms', 'detail', id] as const,
  notifications: (p: object) => ['notifications', p] as const,
  adminUsers: ['admin', 'users'] as const,
  audit: ['admin', 'audit'] as const,
};

export function usePublicStats() {
  return useQuery({ queryKey: queryKeys.publicStats, queryFn: publicApi.stats, staleTime: 10 * 60_000 });
}

export function useDatasetSummary() {
  return useQuery({ queryKey: queryKeys.summary, queryFn: dataApi.summary, staleTime: 5 * 60_000 });
}

export function useRecords(params: ContextQuery & { page: number; page_size: number; search?: string }) {
  const can = useCan();
  return useQuery({
    queryKey: queryKeys.records(params),
    queryFn: () => dataApi.records(params),
    placeholderData: keepPreviousData,
    enabled: can('dataset'),
  });
}

export function useEdaMetrics() {
  return useQuery({ queryKey: queryKeys.eda, queryFn: analyticsApi.edaMetrics, staleTime: 10 * 60_000 });
}

export function useEdaCharts(q: ContextQuery) {
  return useQuery({
    queryKey: queryKeys.edaCharts(q),
    queryFn: () => analyticsApi.edaCharts(q),
    staleTime: 10 * 60_000,
  });
}

export function useRegionRanking(crop?: string, limit = 10) {
  return useQuery({
    queryKey: queryKeys.regions(crop, limit),
    queryFn: () => analyticsApi.regions({ crop: crop || undefined, limit }),
    staleTime: 10 * 60_000,
  });
}

export function useSeasonalTrends(q: ContextQuery) {
  return useQuery({ queryKey: queryKeys.seasonalTrends(q), queryFn: () => analyticsApi.seasonalTrends(q) });
}

export function useFarmComparison(q: ContextQuery & { limit?: number; sort?: 'yield_desc' | 'yield_asc' }) {
  return useQuery({ queryKey: queryKeys.farmComparison(q), queryFn: () => analyticsApi.farmComparison(q) });
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

export function useRecommendationsHub(q: ContextQuery) {
  return useQuery({ queryKey: queryKeys.recommendationsHub(q), queryFn: () => predictApi.recommendationsHub(q) });
}

export function useRecommendationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; action: RecommendationAction; snooze_days?: number; note?: string }) =>
      recommendationsApi.act(v.id, { action: v.action, snooze_days: v.snooze_days, note: v.note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recommendations'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function usePredictionHistory(p: {
  page: number;
  page_size: number;
  crop?: string;
  region?: string;
  farm_id?: string;
}) {
  return useQuery({
    queryKey: queryKeys.history(p),
    queryFn: () => predictApi.history(p),
    placeholderData: keepPreviousData,
  });
}

export function useWeather(region: string, live: boolean) {
  return useQuery({
    queryKey: queryKeys.weather(region, live),
    queryFn: () => weatherApi.analysis(region, live),
    placeholderData: keepPreviousData,
  });
}

export function useSoil(crop: string, region?: string) {
  return useQuery({
    queryKey: queryKeys.soil(crop, region),
    queryFn: () => soilApi.assessment(crop, region || undefined),
    placeholderData: keepPreviousData,
  });
}

export function useRisk(q: ContextQuery) {
  return useQuery({ queryKey: queryKeys.risk(q), queryFn: () => riskApi.get(q) });
}

export function useFarms(p: ContextQuery & { page: number; page_size: number; search?: string; sort?: string }) {
  return useQuery({ queryKey: queryKeys.farms(p), queryFn: () => farmsApi.list(p), placeholderData: keepPreviousData });
}

export function useFarm(id: string) {
  return useQuery({ queryKey: queryKeys.farm(id), queryFn: () => farmsApi.get(id), enabled: Boolean(id) });
}

export function useNotifications(
  p: ContextQuery & { page?: number; page_size?: number; category?: string; unread_only?: boolean },
) {
  return useQuery({ queryKey: queryKeys.notifications(p), queryFn: () => notificationsApi.list(p) });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; read: boolean }) => notificationsApi.setRead(v.id, v.read),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.readAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useAdminUsers() {
  const can = useCan();
  return useQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: () => adminApi.users({ page_size: 200 }),
    enabled: can('users'),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { username: string; role?: string; active?: boolean }) =>
      adminApi.updateUser(v.username, { role: v.role, active: v.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useAuditLog() {
  const can = useCan();
  return useQuery({
    queryKey: queryKeys.audit,
    queryFn: () => adminApi.audit({ page_size: 100 }),
    enabled: can('users'),
  });
}

export function usePredict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PredictionInput) => predictApi.predict(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['predictions'] }),
  });
}

export function useInsights() {
  return useMutation({ mutationFn: (input: PredictionInput) => predictApi.insights(input) });
}

export function useReportExport() {
  return useMutation({ mutationFn: reportsApi.export });
}

/** Every dataset region, for the context switcher and selects. */
export function useRegions() {
  const q = useDatasetSummary();
  return { ...q, data: q.data?.regions };
}

/** Weather scores across all regions (dataset mode, no region filter): the global reference. */
export function useWeatherOverview() {
  return useQuery({
    queryKey: ['weather', 'overview'],
    queryFn: () => weatherApi.analysis('', false),
    staleTime: Infinity,
  });
}
