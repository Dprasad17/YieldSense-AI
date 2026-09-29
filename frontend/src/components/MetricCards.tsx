import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, Droplets, Activity, TrendingUp } from 'lucide-react';
import { useDatasetSummary } from '../hooks/queries';
import { formatCount, formatIndex, formatRainfall, formatYield } from '../lib/format';
import { selectSummaryKpis } from '../lib/selectors';
import { usePreferences } from '../store/preferences';
import { filtersSearch } from '../store/filters';
import { ErrorState, LoadingState, SampleDataPill } from './ui/States';

export const MetricCards: React.FC = () => {
  const summaryQuery = useDatasetSummary();
  const { unit } = usePreferences();
  const [params] = useSearchParams();
  const kpis = selectSummaryKpis(summaryQuery.data);

  if (summaryQuery.isPending) return <LoadingState label="Loading dashboard…" />;
  if (summaryQuery.isError || !kpis) return <ErrorState error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} />;

  const scope = `Global mean · ${formatCount(kpis.recordCount)} records`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="metrics-grid">
        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Farm records</span>
            <div className="metric-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <Layers size={20} />
            </div>
          </div>
          <div>
            <div className="metric-value num">{formatCount(kpis.recordCount)}</div>
            <div className="metric-subtitle">Dataset rows across {formatCount(kpis.regionCount)} regions</div>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Average yield</span>
            <div className="metric-icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <div>
            <div className="metric-value num">{formatYield(kpis.meanYield, unit)} <span style={{ fontSize: 'var(--text-lg)', color: 'var(--muted)' }}>{unit}</span></div>
            <div className="metric-subtitle">{scope} · {kpis.cropCount} crops</div>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Seasonal rainfall</span>
            <div className="metric-icon-wrapper" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
              <Droplets size={20} />
            </div>
          </div>
          <div>
            <div className="metric-value num">{formatRainfall(kpis.meanRainfall)}</div>
            <div className="metric-subtitle">{scope}</div>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Vegetation health (NDVI)</span>
            <div className="metric-icon-wrapper" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc' }}>
              <Activity size={20} />
            </div>
          </div>
          <div>
            <div className="metric-value num">{formatIndex(kpis.meanNdvi)} <span style={{ fontSize: 'var(--text-lg)', color: 'var(--muted)' }}>/ 1.00</span></div>
            <div className="metric-subtitle">{scope}</div>
          </div>
        </div>
      </div>

      {/* Regional & Crop Yield Benchmark Overview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Regional Yield Performance</span>
            <SampleDataPill reason="Regional averages are computed from the dataset in Phase 3." />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { region: 'North India', yield: 4450, share: '88%' },
              { region: 'South India', yield: 4320, share: '85%' },
              { region: 'South USA', yield: 4210, share: '82%' },
              { region: 'Central USA', yield: 4380, share: '86%' },
              { region: 'East Africa', yield: 4190, share: '80%' }
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff' }}>
                  <span>{r.region}</span>
                  <span className="num-tabular" style={{ color: '#34d399', fontWeight: 700 }}>{r.yield} kg/ha</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ width: r.share, height: '100%', background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)', borderRadius: '9999px' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Crops in the dataset</span>
              <span className="badge badge-purple">{kpis.cropCount} crops</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Yield predictions for these crops come from a model tuned with <strong style={{ color: 'var(--ink)' }}>GridSearchCV</strong> on the same dataset.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {kpis.crops.map((crop, idx) => (
              <span key={idx} style={{
                background: 'rgba(27, 94, 63, 0.35)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#a7f3d0',
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 700
              }}>
                {crop}
              </span>
            ))}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Want a quick yield prediction?</span>
            <Link to={{ pathname: '/app/predict', search: filtersSearch(params) }} style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--primary)' }}>Go to Yield Predictor →</Link>
          </div>
        </div>

      </div>
    </div>
  );
};
