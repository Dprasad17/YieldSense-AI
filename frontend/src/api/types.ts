// API types, generated from the backend's OpenAPI schema (`npm run gen:api` → schema.d.ts).
import type { components } from './schema';

type S = components['schemas'];

export type Role = 'Farmer' | 'Agronomist' | 'Admin';

export type SessionUser = Omit<S['MeUser'], 'notification_prefs'>;
export type TokenResponse = S['TokenResponse'];
export type MeResponse = S['MeResponse'];
export type ErrorEnvelope = S['ErrorEnvelope'];

export type DatasetSummary = S['DatasetSummary'];
export type CropRecord = S['CropRecord'];
export type RecordsPage = S['Page_CropRecord_'];
export type EdaMetrics = S['EdaMetrics'];
export type CropBreakdownEntry = S['CropBreakdown'];
export type EdaCharts = S['EdaCharts'];
export type RegionRanking = S['RegionRanking'];
export type SeasonalTrends = S['SeasonalTrends'];
export type FarmComparison = S['FarmComparison'];

/** /api/predict/models: model name → scores, plus a few non-model keys. Untyped JSON artifact. */
export type SplitKey = 'random' | 'temporal' | 'unseen_region';
/** One model × target × split evaluation from models/v2/model_card.json. */
export interface ModelResult {
  model: string;
  target: 'raw' | 'log1p';
  split: SplitKey;
  mae: number;
  rmse: number;
  r2: number;
  mape: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  interval_coverage: number;
  train_rows: number;
  test_rows: number;
}
/** Model card served by GET /api/predict/models (written by scripts/train_models_v2.py). */
export interface ModelCard {
  name: string;
  version: string;
  trained_at: string;
  selected: { model: string; target: 'raw' | 'log1p'; split: SplitKey; metrics: ModelResult };
  selection_rule: string;
  features: { categorical: string[]; numeric: string[] };
  excluded_features: { feature: string; reason: string }[];
  permutation_importance: { feature: string; importance: number; std: number; synthetic: boolean; kept: boolean }[];
  splits: Record<SplitKey, string>;
  results: ModelResult[];
  interval: {
    method: string;
    space: string;
    residual_q10: number;
    residual_q90: number;
    heldout?: {
      method: string;
      calibration_rows: number;
      evaluation_rows: number;
      coverage: number;
      nominal: number;
      mean_width_kg_ha: number;
      median_width_kg_ha: number;
    };
  };
  weather_ablation?: {
    split: string;
    model: string;
    target: string;
    note: string;
    results: { variant: string; dropped: string[]; rmse: number; r2: number; mae: number; delta_rmse: number; delta_r2: number }[];
  };
  previous_version?: {
    version?: string;
    features?: { categorical: string[]; numeric: string[] };
    selected?: { model: string; target: string; metrics: ModelResult };
  };
  data: { rows: number; years: [number, number]; regions: number; crops: number };
  previous_model?: { model: string; r2: number; rmse: number; mae: number; note: string };
  intended_use: string;
  limitations: string[];
}
export type ProvenanceRegistry = S['ProvenanceRegistry'];
export type ColumnProvenance = S['ColumnProvenance'];
export type WhatIfResult = S['WhatIfResponse'];
export type MyFarmsResponse = S['MyFarmsResponse'];
export type MyFarmComparison = S['MyFarmComparison'];
export type ClimateTrend = S['ClimateTrend'];
export type OptimalBand = S['OptimalBand'];
export type SystemMetrics = S['SystemMetrics'];
export type ActiveModel = S['ActiveModel'];

export type PredictionInput = S['YieldPredictionRequest'];
export type PredictionResult = S['YieldPredictionResponse'];
export type PredictionRecord = S['PredictionRecord'];
export type PredictionsPage = S['Page_PredictionRecord_'];
export type AIInsights = S['AIInsightsResponse'];

export type RecommendationsHub = S['RecommendationsHub'];
export type Recommendation = S['Recommendation'];
export type RecommendationAction = S['ActionRequest']['action'];
export type ActionResponse = S['ActionResponse'];
export type Task = S['Task'];

export type WeatherResponse = S['WeatherResponse'];
export type SoilResponse = S['SoilAssessment'];
export type RiskAssessment = S['RiskAssessment'];
export type Farm = S['FarmOut'];
export type FarmsPage = S['Page_FarmOut_'];
export type FarmDetail = S['FarmDetail'];
export type FarmInput = S['FarmIn'];
export type FarmRecord = S['FarmRecordOut'];
export type FarmRecordInput = S['FarmRecordIn'];
export type RecordDetail = S['RecordDetail'];
export type SoilTest = S['SoilTestOut'];
export type SoilTestInput = S['SoilTestIn'];
export type Upload = S['UploadSummary'];
export type UploadsPage = S['Page_UploadSummary_'];
export type UploadKind = S['UploadSummary']['kind'];
export type MeUser = S['MeUser'];
export type NotificationPrefs = S['NotificationPrefs'];
export type NotificationPage = S['NotificationPage'];
export type Notification = S['Notification'];
export type AdminUser = S['AdminUser'];
export type AdminUsersPage = S['Page_AdminUser_'];
export type AuditPage = S['Page_AuditEntry_'];
export type PublicStats = S['PublicStats'];

/** Region · Crop · Year filters accepted by the analytics endpoints. */
export type ContextQuery = {
  region?: string;
  crop?: string;
  farm_id?: number;
  year_from?: number;
  year_to?: number;
};
