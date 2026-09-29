// Response shapes of the YieldSense FastAPI backend.

export type Role = 'Farmer' | 'Agronomist' | 'Admin';

export interface SessionUser {
  username: string;
  role: string;
  email: string;
  full_name: string;
}

export interface TokenResponse extends SessionUser {
  access_token: string;
  token_type: string;
}

export interface MeResponse {
  status: string;
  user: SessionUser;
}

export interface DatasetSummary {
  total_farms: number; // row count of the dataset, shown as "Farm records"
  avg_yield_kg_ha: number;
  avg_rainfall_mm: number;
  avg_ndvi: number;
  total_regions: number;
  crops_supported: string[];
}

export interface CropRecord {
  farm_id: string;
  region: string;
  crop_type: string;
  yield_kg_per_hectare: number;
  rainfall_mm: number;
  temperature_C: number;
  pesticide_usage_ml: number;
  soil_pH: number;
  'soil_moisture_%': number;
  'humidity_%': number;
  sunlight_hours: number;
  total_days: number;
  sowing_date: string;
  harvest_date: string;
  irrigation_type: string;
  fertilizer_type: string;
  crop_disease_status: string;
  NDVI_index: number;
}

export interface RecordsPage {
  total_records: number;
  page: number;
  limit: number;
  total_pages: number;
  data: CropRecord[];
}

export interface DescriptiveStats {
  mean: number;
  std: number;
  min: number;
  '25%': number;
  median: number;
  '75%': number;
  max: number;
}

export interface CropBreakdownEntry {
  count: number;
  avg_yield: number;
  std_yield?: number;
  min_yield?: number;
  max_yield?: number;
}

export interface EdaMetrics {
  total_records: number;
  overall_stats: Record<string, DescriptiveStats>;
  crop_breakdown: Record<string, CropBreakdownEntry>;
  top_crop_by_yield?: string;
}

export interface ModelScore {
  mae: number;
  rmse: number;
  r2: number;
  inference_latency_ms: number;
}

/** /api/predict/models: model name → scores, plus a few non-model keys. */
export type ModelMetricsResponse = Record<string, unknown> & {
  best_model?: string;
  metadata?: { dataset_size?: number; train_size?: number; test_size?: number; features?: string[] };
};

export interface ActiveModel {
  name: string;
  r2: number;
  rmse: number;
  mae: number;
  inference_latency_ms: number;
  test_size?: number;
}

export interface PredictionInput {
  crop_type: string;
  region: string;
  irrigation_type: string;
  fertilizer_type: string;
  crop_disease_status: string;
  soil_pH: number;
  'soil_moisture_%': number;
  temperature_C: number;
  rainfall_mm: number;
  'humidity_%': number;
  sunlight_hours: number;
  pesticide_usage_ml: number;
  total_days: number;
  NDVI_index: number;
}

export interface PredictionResult {
  predicted_yield_kg_ha: number;
  productivity_rating: string;
  risk_rating: string;
}

export interface AIInsights {
  ai_insights: string;
  risk_alerts: string[];
  recommendations: string[];
  llm_provider: string;
}

export interface WeatherAnalytics {
  record_count: number;
  average_rainfall_mm: number;
  average_temperature_C?: number;
  average_humidity_percent: number;
  average_sunlight_hours: number;
  wind_speed_kmh?: number;
  rainfall_adequacy_score: number;
  temperature_stress_risk: number;
  humidity_balance_score: number;
  sunlight_exposure_score: number;
  overall_weather_score: number;
  [key: string]: unknown;
}

export interface WeatherResponse {
  status_claim: string;
  data_source?: string;
  region: string;
  analytics: WeatherAnalytics;
  available_regions: string[];
}

export interface SoilResponse {
  status_claim: string;
  crop_type: string;
  // Loosely typed until the Soil screen is rebuilt in Phase 7.
  soil_metrics: Record<string, any>;
  global_soil_averages: Record<string, unknown>;
  general_reference_note?: string;
}

/** Still backend-hardcoded until Phase 3; shape kept loose on purpose. */
export type RecommendationsHub = Record<string, any>;

export interface SeasonalTrends {
  status: string;
  crop_filter: string;
  yearly_trends: Array<{ year: number; avg_yield_kg_ha: number; is_projection?: boolean } & Record<string, unknown>>;
  crop_insights: Record<string, unknown>;
}

export interface FarmComparison {
  status: string;
  total_farms_compared: number;
  farm_comparisons: Array<Record<string, any>>;
}
