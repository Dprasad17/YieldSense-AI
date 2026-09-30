import { apiBlob, apiRequest } from './client';
import type {
  ActionResponse,
  ActiveModel,
  AdminUser,
  AdminUsersPage,
  AIInsights,
  AuditPage,
  ContextQuery,
  DatasetSummary,
  EdaCharts,
  EdaMetrics,
  FarmComparison,
  FarmDetail,
  FarmsPage,
  MeResponse,
  ModelMetricsResponse,
  Notification,
  NotificationPage,
  PredictionInput,
  PredictionRecord,
  PredictionResult,
  PredictionsPage,
  PublicStats,
  RecommendationAction,
  RecommendationsHub,
  RecordsPage,
  RegionRanking,
  RiskAssessment,
  SeasonalTrends,
  SoilResponse,
  Task,
  TokenResponse,
  WeatherResponse,
} from './types';

type Q = ContextQuery;

export const authApi = {
  login: (username: string, password: string) =>
    apiRequest<TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      skipAuthRedirect: true,
    }),
  register: (input: { username: string; email: string; password: string; role: string; full_name?: string }) =>
    apiRequest<TokenResponse>('/api/auth/register', { method: 'POST', body: input, skipAuthRedirect: true }),
  me: () => apiRequest<MeResponse>('/api/auth/me', { skipAuthRedirect: true }),
};

export const publicApi = {
  stats: () => apiRequest<PublicStats>('/api/public/stats'),
};

export const dataApi = {
  summary: () => apiRequest<DatasetSummary>('/api/data/summary'),
  records: (q: Q & { page: number; page_size: number; search?: string }) =>
    apiRequest<RecordsPage>('/api/data/records', { query: q }),
};

export const analyticsApi = {
  edaMetrics: () => apiRequest<EdaMetrics>('/api/analytics/metrics'),
  edaCharts: (q: Q) => apiRequest<EdaCharts>('/api/analytics/eda-charts', { query: q }),
  regions: (q: { crop?: string; limit?: number }) => apiRequest<RegionRanking>('/api/analytics/regions', { query: q }),
  seasonalTrends: (q: Q) => apiRequest<SeasonalTrends>('/api/analytics/seasonal-trends', { query: q }),
  farmComparison: (q: Q & { limit?: number; sort?: 'yield_desc' | 'yield_asc' }) =>
    apiRequest<FarmComparison>('/api/analytics/farm-comparison', { query: q }),
};

export const predictApi = {
  predict: (input: PredictionInput) => apiRequest<PredictionResult>('/api/predict', { method: 'POST', body: input }),
  insights: (input: PredictionInput) =>
    apiRequest<AIInsights>('/api/predict/insights', { method: 'POST', body: input }),
  models: () => apiRequest<ModelMetricsResponse>('/api/predict/models'),
  activeModel: () => apiRequest<ActiveModel>('/api/predict/models/active'),
  recommendationsHub: (q: Q) => apiRequest<RecommendationsHub>('/api/predict/recommendations-hub', { query: q }),
  history: (q: { page: number; page_size: number; crop?: string; region?: string; farm_id?: string }) =>
    apiRequest<PredictionsPage>('/api/predictions', { query: q }),
  historyItem: (id: string) => apiRequest<PredictionRecord>(`/api/predictions/${encodeURIComponent(id)}`),
};

export const recommendationsApi = {
  act: (id: string, body: { action: RecommendationAction; note?: string; snooze_days?: number }) =>
    apiRequest<ActionResponse>(`/api/recommendations/${encodeURIComponent(id)}/actions`, { method: 'POST', body }),
  tasks: () => apiRequest<Task[]>('/api/recommendations/tasks'),
};

export const weatherApi = {
  analysis: (region: string, live: boolean) =>
    apiRequest<WeatherResponse>('/api/weather/analysis', { query: { region, live: live || undefined } }),
};

export const soilApi = {
  assessment: (crop: string, region?: string) =>
    apiRequest<SoilResponse>('/api/soil/assessment', { query: { crop, region } }),
};

export const riskApi = {
  get: (q: Q) => apiRequest<RiskAssessment>('/api/risk', { query: q }),
};

export const farmsApi = {
  list: (q: Q & { page: number; page_size: number; search?: string; sort?: string }) =>
    apiRequest<FarmsPage>('/api/farms', { query: q }),
  get: (id: string) => apiRequest<FarmDetail>(`/api/farms/${encodeURIComponent(id)}`),
};

export const notificationsApi = {
  list: (q: Q & { page?: number; page_size?: number; category?: string; unread_only?: boolean }) =>
    apiRequest<NotificationPage>('/api/notifications', { query: q }),
  setRead: (id: string, read: boolean) =>
    apiRequest<Notification>(`/api/notifications/${encodeURIComponent(id)}`, { method: 'PATCH', body: { read } }),
  readAll: () => apiRequest<{ updated: number }>('/api/notifications/read-all', { method: 'PATCH' }),
};

export const adminApi = {
  users: (q: { page?: number; page_size?: number } = {}) =>
    apiRequest<AdminUsersPage>('/api/admin/users', { query: q }),
  updateUser: (username: string, patch: { role?: string; active?: boolean }) =>
    apiRequest<AdminUser>(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'PATCH', body: patch }),
  audit: (q: { page?: number; page_size?: number } = {}) => apiRequest<AuditPage>('/api/admin/audit', { query: q }),
};

export const reportsApi = {
  export: (body: {
    format: 'csv' | 'xlsx';
    crop_type?: string | null;
    region?: string | null;
    year_from?: number;
    year_to?: number;
  }) => apiBlob('/api/reports/export', { method: 'POST', body }),
};
