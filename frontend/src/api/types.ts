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
export type ModelMetricsResponse = Record<string, unknown> & {
  best_model?: string;
  metadata?: { dataset_size?: number; train_size?: number; test_size?: number; features?: string[] };
};
export interface ModelScore {
  mae: number;
  rmse: number;
  r2: number;
  inference_latency_ms: number;
}
export type ActiveModel = S['ActiveModel'];

export type PredictionInput = Omit<S['YieldPredictionRequest'], 'farm_id'> & { farm_id?: string | null };
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
