import React, { useState } from 'react';
import { Cpu, Award, AlertTriangle, Activity, BarChart2, CheckCircle, RefreshCw, Sparkles, ShieldAlert, CheckSquare } from 'lucide-react';
import type { AIInsights, PredictionInput, PredictionResult } from '../api/types';
import { errorMessage } from '../api/client';
import { Can } from '../auth/guards';
import { useActiveModel, useInsights, useModelMetrics, usePredict } from '../hooks/queries';
import { formatCount, formatIndex, formatLatency, formatYield } from '../lib/format';
import { normalizeModelName, selectModelRows } from '../lib/selectors';
import { usePreferences } from '../store/preferences';

export const YieldPredictor: React.FC = () => {
  const { unit } = usePreferences();
  const [formData, setFormData] = useState({
    crop_type: 'Wheat',
    region: 'India',
    irrigation_type: 'Drip',
    fertilizer_type: 'NPK 14-35-14',
    crop_disease_status: 'None',
    soil_pH: 6.5,
    'soil_moisture_%': 45.0,
    temperature_C: 24.5,
    rainfall_mm: 185.0,
    'humidity_%': 62.0,
    sunlight_hours: 7.5,
    pesticide_usage_ml: 450.0,
    total_days: 120,
    NDVI_index: 0.68
  });

  const predictMutation = usePredict();
  const insightsMutation = useInsights();
  const activeModelQuery = useActiveModel();
  const modelMetricsQuery = useModelMetrics();

  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = predictMutation.isPending;

  const activeModel = activeModelQuery.data;
  const activeModelName = activeModel ? normalizeModelName(activeModel.name).name : null;
  const modelRows = selectModelRows(modelMetricsQuery.data);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPrediction(null);
    setAiInsights(null);

    const input = formData as PredictionInput;
    try {
      setPrediction(await predictMutation.mutateAsync(input));
    } catch (err) {
      setError(errorMessage(err));
      return;
    }

    // AI insights are a bonus: a failure here must not hide the prediction.
    try {
      setAiInsights(await insightsMutation.mutateAsync(input));
    } catch {
      setAiInsights(null);
    }
  };

  return (
    <div className="section-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Top Header Card */}
      <div className="glass-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(59,130,246,0.08) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <Cpu className="gradient-text-green" size={28} />
          <h2 style={{ fontSize: '1.4rem', color: '#ffffff', margin: 0, fontWeight: 700 }}>
            AI Crop Yield Prediction Engine
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
          Enter 14 agricultural telemetry parameters to infer harvest yield (kg/ha), productivity class, risk rating, and real-time AI-generated agricultural insights.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        
        {/* Prediction Form */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', color: '#ffffff', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={18} color="#10b981" />
            Telemetry Input Features (14 Parameters)
          </h3>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            
            {/* 1. Crop Information */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                1. Crop & Region Information
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.6rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Crop Type</label>
                  <select name="crop_type" value={formData.crop_type} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }}>
                    {['Wheat', 'Rice', 'Maize', 'Soybeans', 'Potatoes', 'Cassava', 'Sweet potatoes', 'Plantains', 'Yams', 'Sorghum'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Region</label>
                  <select name="region" value={formData.region} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }}>
                    {['India', 'United States', 'Brazil', 'China', 'France', 'Germany', 'Mexico', 'Egypt', 'Australia', 'South Africa', 'Pakistan', 'Nigeria', 'Spain', 'Turkey', 'Canada'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Crop Disease Status</label>
                  <select name="crop_disease_status" value={formData.crop_disease_status} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }}>
                    <option value="None">None</option>
                    <option value="Mild">Mild</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Severe">Severe</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Soil Characteristics */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                2. Soil Characteristics
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.6rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Soil pH ({formData.soil_pH})</label>
                  <input type="number" step="0.1" name="soil_pH" value={formData.soil_pH} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Soil Moisture (%)</label>
                  <input type="number" step="0.5" name="soil_moisture_%" value={formData['soil_moisture_%']} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }} />
                </div>
              </div>
            </div>

            {/* 3. Weather Conditions */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                3. Weather Parameters
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.6rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Temperature (°C)</label>
                  <input type="number" step="0.5" name="temperature_C" value={formData.temperature_C} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rainfall (mm)</label>
                  <input type="number" step="1" name="rainfall_mm" value={formData.rainfall_mm} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Humidity (%)</label>
                  <input type="number" step="1" name="humidity_%" value={formData['humidity_%']} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sunlight (hrs/day)</label>
                  <input type="number" step="0.5" name="sunlight_hours" value={formData.sunlight_hours} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }} />
                </div>
              </div>
            </div>

            {/* 4. Farm Operations & Vegetation */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                4. Farm Operations & NDVI Index
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.6rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Irrigation Type</label>
                  <select name="irrigation_type" value={formData.irrigation_type} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }}>
                    <option value="Drip">Drip</option>
                    <option value="Sprinkler">Sprinkler</option>
                    <option value="Flood">Flood</option>
                    <option value="Rainfed">Rainfed</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fertilizer Type</label>
                  <select name="fertilizer_type" value={formData.fertilizer_type} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }}>
                    <option value="NPK 14-35-14">NPK 14-35-14</option>
                    <option value="Urea">Urea</option>
                    <option value="DAP">DAP</option>
                    <option value="Organic">Organic</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pesticide Usage (ml)</label>
                  <input type="number" step="10" name="pesticide_usage_ml" value={formData.pesticide_usage_ml} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Growing Days</label>
                  <input type="number" name="total_days" value={formData.total_days} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }} />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NDVI Vegetation Index (0.0 - 1.0)</label>
                  <input type="number" step="0.01" min="0" max="1" name="NDVI_index" value={formData.NDVI_index} onChange={handleChange} className="search-input" style={{ width: '100%', marginTop: '0.2rem' }} />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.85rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
              }}
            >
              {loading ? (
                <>
                  <RefreshCw className="spin" size={18} />
                  Calculating AI Yield Prediction...
                </>
              ) : (
                <>
                  <Cpu size={18} />
                  Calculate AI Yield Prediction
                </>
              )}
            </button>

          </form>
        </div>

        {/* Prediction Results & Model Comparison */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Prediction Output Card */}
          <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '240px' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Award size={18} color="#f59e0b" />
              AI Prediction Output Result
            </h3>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', padding: '0.85rem', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem' }}>
                <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
                {error}
              </div>
            )}

            {!prediction && !error && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Cpu size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Fill out the 14 telemetry features on the left and click "Calculate AI Yield Prediction".</p>
              </div>
            )}

            {prediction && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* Predicted Yield Highlight */}
                <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '12px', padding: '1.2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#34d399', fontWeight: 600, letterSpacing: '0.05em' }}>
                    Predicted Crop Yield
                  </div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#ffffff', margin: '0.2rem 0' }}>
                    <span className="num">{formatYield(prediction.predicted_yield_kg_ha, unit)}</span> <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-medium)', color: 'var(--primary)' }}>{unit}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {activeModel ? `${activeModelName} · R² ${formatIndex(activeModel.r2)} · RMSE ${formatCount(activeModel.rmse)} kg/ha` : 'Model details unavailable'}
                  </div>
                </div>

                {/* Rating Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.85rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Productivity Rating</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: prediction.productivity_rating === 'High' ? '#34d399' : prediction.productivity_rating === 'Medium' ? '#f59e0b' : '#ef4444', marginTop: '0.2rem' }}>
                      {prediction.productivity_rating}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.85rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Agricultural Risk Rating</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: prediction.risk_rating === 'Low' ? '#34d399' : prediction.risk_rating === 'Medium' ? '#f59e0b' : '#ef4444', marginTop: '0.2rem' }}>
                      {prediction.risk_rating}
                    </div>
                  </div>

                </div>

              </div>
            )}
          </div>

          {/* Real-Time AI Insights & Risk Mitigation Panel */}
          {aiInsights && (
            <div className="glass-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(139,92,246,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.05rem', color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={18} color="#c084fc" />
                  AI Agricultural Insights & Risk Mitigation Engine
                </h3>
                <span className="badge badge-purple" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}>
                  {aiInsights.llm_provider}
                </span>
              </div>

              {/* Summary Insight */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem', borderLeft: '3px solid #c084fc', fontSize: '0.88rem', color: '#e9d5ff' }}>
                {aiInsights.ai_insights}
              </div>

              {/* Risk Alerts List */}
              <div style={{ marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <ShieldAlert size={14} /> Active Crop Risk Flags
                </span>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {aiInsights.risk_alerts.map((alert, idx) => (
                    <li key={idx} style={{ color: alert.includes('CRITICAL') || alert.includes('WARNING') ? '#fca5a5' : '#d1d5db' }}>
                      {alert}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendations List */}
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <CheckSquare size={14} /> Actionable Agronomic Recommendations
                </span>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {aiInsights.recommendations.map((rec, idx) => (
                    <li key={idx} style={{ color: '#a7f3d0' }}>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Model comparison (agronomist/admin). Farmers see the served model in the result card. */}
          <Can permission="models">
          <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <BarChart2 size={18} color="var(--data-model)" aria-hidden="true" />
                Model comparison (held-out test set)
              </h3>
              <button type="button" onClick={() => modelMetricsQuery.refetch()} className="tab-btn" aria-label="Refresh model metrics">
                <RefreshCw size={12} aria-hidden="true" /> Refresh
              </button>
            </div>

            {modelMetricsQuery.isError && (
              <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', margin: 0 }}>{errorMessage(modelMetricsQuery.error)}</p>
            )}

            {modelRows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                      <th style={{ padding: 'var(--space-2)' }}>Model</th>
                      <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>R²</th>
                      <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>RMSE (kg/ha)</th>
                      <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>MAE (kg/ha)</th>
                      <th style={{ padding: 'var(--space-2)', textAlign: 'right' }}>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelRows.map(m => (
                      <tr
                        key={m.key}
                        aria-current={m.isSelected ? 'true' : undefined}
                        style={{ borderBottom: '1px solid var(--border)', background: m.isSelected ? 'var(--primary-soft)' : 'transparent' }}
                      >
                        <td style={{ padding: 'var(--space-2)', fontWeight: m.isSelected ? 'var(--weight-semibold)' : 'var(--weight-regular)', color: 'var(--ink)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                            {m.isSelected && <CheckCircle size={14} color="var(--primary)" aria-label="Selected model" />}
                            {m.name}
                            {m.tuning && <span style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>· {m.tuning}</span>}
                            {m.isBaseline && <span style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>· baseline</span>}
                          </span>
                        </td>
                        <td className="num" style={{ padding: 'var(--space-2)', textAlign: 'right', color: 'var(--ink)' }}>{formatIndex(m.r2)}</td>
                        <td className="num" style={{ padding: 'var(--space-2)', textAlign: 'right', color: 'var(--muted)' }}>{formatCount(m.rmse)}</td>
                        <td className="num" style={{ padding: 'var(--space-2)', textAlign: 'right', color: 'var(--muted)' }}>{formatCount(m.mae)}</td>
                        <td className="num" style={{ padding: 'var(--space-2)', textAlign: 'right', color: 'var(--muted)' }}>{formatLatency(m.inference_latency_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', margin: 'var(--space-3) 0 0' }}>
                  Highlighted: the model serving predictions, chosen for the lowest test RMSE.
                </p>
              </div>
            )}
          </div>
          </Can>

        </div>

      </div>
    </div>
  );
};
