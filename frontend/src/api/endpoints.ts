import { apiBlob, apiRequest } from './client';
import type {
  ActiveModel,
  AIInsights,
  DatasetSummary,
  EdaMetrics,
  FarmComparison,
  MeResponse,
  ModelMetricsResponse,
  PredictionInput,
  PredictionResult,
  RecommendationsHub,
  RecordsPage,
  SeasonalTrends,
  SoilResponse,
  TokenResponse,
  WeatherResponse,
} from './types';

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

export const dataApi = {
  summary: () => apiRequest<DatasetSummary>('/api/data/summary'),
  records: (params: { page: number; limit: number; crop_type?: string; region?: string; search?: string }) =>
    apiRequest<RecordsPage>('/api/data/records', { query: params }),
};

export const analyticsApi = {
  edaMetrics: () => apiRequest<EdaMetrics>('/api/analytics/metrics'),
  seasonalTrends: (crop?: string) =>
    apiRequest<SeasonalTrends>('/api/analytics/seasonal-trends', { query: { crop_type: crop } }),
  farmComparison: () => apiRequest<FarmComparison>('/api/analytics/farm-comparison'),
};

export const predictApi = {
  predict: (input: PredictionInput) => apiRequest<PredictionResult>('/api/predict', { method: 'POST', body: input }),
  insights: (input: PredictionInput) =>
    apiRequest<AIInsights>('/api/predict/insights', { method: 'POST', body: input }),
  models: () => apiRequest<ModelMetricsResponse>('/api/predict/models'),
  activeModel: () => apiRequest<ActiveModel>('/api/predict/models/active'),
  recommendationsHub: () => apiRequest<RecommendationsHub>('/api/predict/recommendations-hub'),
};

export const weatherApi = {
  analysis: (region: string, live: boolean) =>
    apiRequest<WeatherResponse>('/api/weather/analysis', { query: { region, live: live || undefined } }),
};

export const soilApi = {
  assessment: (crop: string) => apiRequest<SoilResponse>('/api/soil/assessment', { query: { crop_type: crop } }),
};

export const reportsApi = {
  export: (body: { format: string; crop_type?: string | null; region?: string | null }) =>
    apiBlob('/api/reports/export', { method: 'POST', body }),
};
