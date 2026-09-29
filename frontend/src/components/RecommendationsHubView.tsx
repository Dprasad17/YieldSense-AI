import React, { useState } from 'react';
import { Sparkles, AlertTriangle, CheckCircle, ShieldAlert, Zap } from 'lucide-react';
import { useRecommendationsHub } from '../hooks/queries';
import { ErrorState, LoadingState, SampleDataPill } from './ui/States';

export const RecommendationsHubView: React.FC = () => {
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [loadingPivot, setLoadingPivot] = useState(false);
  const hubQuery = useRecommendationsHub();
  const hubData = hubQuery.data;

  const handlePivotDispatch = () => {
    setLoadingPivot(true);
    setTimeout(() => {
      setLoadingPivot(false);
      setDispatchStatus('Variable-Rate Irrigation Cycle Dispatched: 25mm scheduled for Sector B4 via Field Router');
    }, 1200);
  };

  if (hubQuery.isPending) return <LoadingState label="Loading recommendations…" />;
  if (hubQuery.isError || !hubData) return <ErrorState error={hubQuery.error} onRetry={() => hubQuery.refetch()} />;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      
      {/* Top Banner */}
      <div className="glass-card slide-up hover-scale" style={{ padding: '1.5rem 1.75rem', background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(16,185,129,0.08) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
              <Sparkles className="gradient-text-green" size={26} />
              <h2 style={{ fontSize: '1.35rem', color: '#ffffff', margin: 0, fontWeight: 800 }}>
                AI Recommendations
              </h2>
              <SampleDataPill reason="Recommendations are fixed examples until the rule engine is computed from real data (Phase 3)." />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
              Automated multi-spectral & sensor-derived prescriptive actions. Prioritize intervention windows to insulate yield margins against diurnal extremes.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge badge-purple"><Zap size={14} /> Groq Llama-3 Active</span>
          </div>
        </div>
      </div>

      {dispatchStatus && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', padding: '1rem 1.25rem', borderRadius: '10px', color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CheckCircle size={20} color="#34d399" />
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{dispatchStatus}</span>
        </div>
      )}

      {/* Main Grid: Directives Stream (Left) + Phenology & Microclimate (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        
        {/* LEFT COLUMN: Action Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', gridColumn: 'span 2' }}>
          
          {/* Directive 1: Critical Irrigation Dispatch */}
          <div className="glass-card slide-up delay-1 hover-scale" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '4px solid #ef4444' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span className="badge badge-red" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ShieldAlert size={14} /> CRITICAL ACTION REQUIRED
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Expires in 36h · Sector B4</span>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', margin: '0 0 0.35rem 0' }}>
                {hubData.irrigation_dispatch.title}
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#a7f3d0', fontWeight: 700, margin: 0 }}>
                {hubData.irrigation_dispatch.yield_salvage} • {hubData.irrigation_dispatch.affected_area}
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Telemetry Trigger:</div>
              <p style={{ fontSize: '0.85rem', color: '#ffffff', margin: 0, fontWeight: 600 }}>
                {hubData.irrigation_dispatch.telemetry_trigger}
              </p>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {hubData.irrigation_dispatch.target_threshold}
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              {hubData.irrigation_dispatch.explanation}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <button
                onClick={handlePivotDispatch}
                disabled={loadingPivot}
                className="btn-primary"
              >
                <Zap size={16} />
                {loadingPivot ? 'Transmitting...' : 'Dispatch Pivot Command to Field Router'}
              </button>
            </div>
          </div>

          {/* Directive 2: Optimal Spray Window - Disease Risk */}
          <div className="glass-card slide-up delay-2 hover-scale" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span className="badge badge-amber" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <AlertTriangle size={14} /> HIGH PATHOGEN RISK
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Friday Dawn Window · Fields A1 & A3</span>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', margin: '0 0 0.35rem 0' }}>
                {hubData.spray_window.title}
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#fcd34d', fontWeight: 700, margin: 0 }}>
                {hubData.spray_window.prevention_potential}
              </p>
            </div>

            {/* Visual Window Bar */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#ffffff' }}>
                <span>Spray Window Viability Index</span>
                <span style={{ color: '#34d399' }}>{hubData.spray_window.window_status}</span>
              </div>
              <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: '20%', background: 'rgba(255,255,255,0.1)' }} title="Thermal Inversion Risk"></div>
                <div style={{ width: '35%', background: '#10b981' }} title="Optimal Window"></div>
                <div style={{ width: '25%', background: '#f59e0b' }} title="Marginal Wind"></div>
                <div style={{ width: '20%', background: 'rgba(255,255,255,0.1)' }} title="Unfavorable"></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span>04:00 (Thermal Inversion)</span>
                <span style={{ color: '#34d399', fontWeight: 700 }}>Wind 4.8 km/h · Zero Inversion</span>
                <span>11:00 (Gusts &gt;16 km/h)</span>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              {hubData.spray_window.explanation}
            </p>
          </div>

        </div>

        {/* RIGHT COLUMN: Phenology Stage Ribbon & Microclimate */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Phenology Growth Stage Ribbon */}
          <div className="glass-card slide-up delay-1 hover-scale" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Phenology Growth Stage</h3>
              <span className="badge badge-purple">Sector B4 Corn</span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
              Current biological vulnerability zone requires precision timing for moisture & tassel protection.
            </p>

            {/* Phenology Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              
              {/* Step 1: Completed */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
                  ✓
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>{hubData.phenology.completed[0]}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Completed May 28</span>
                </div>
              </div>
              <div style={{ width: '2px', height: '14px', background: '#10b981', marginLeft: '11px' }}></div>

              {/* Step 2: Completed */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
                  ✓
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>{hubData.phenology.completed[1]}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Completed June 19</span>
                </div>
              </div>
              <div style={{ width: '2px', height: '14px', background: '#f59e0b', marginLeft: '11px' }}></div>

              {/* Step 3: ACTIVE NOW */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(245, 158, 11, 0.15)', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#f59e0b', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>
                  {hubData.phenology.current_stage}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff' }}>{hubData.phenology.stage_name}</span>
                    <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>ACTIVE NOW</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#fcd34d', fontWeight: 600 }}>{hubData.phenology.warning}</span>
                </div>
              </div>
              <div style={{ width: '2px', height: '14px', background: 'rgba(255,255,255,0.1)', marginLeft: '11px' }}></div>

              {/* Step 4: Future */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: 0.6 }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
                  R3
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#ffffff' }}>{hubData.phenology.future[0]}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Est. July 14</span>
                </div>
              </div>
              <div style={{ width: '2px', height: '14px', background: 'rgba(255,255,255,0.1)', marginLeft: '11px' }}></div>

              {/* Step 5: Future */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: 0.4 }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
                  R6
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#ffffff' }}>{hubData.phenology.future[1]}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Est. Aug 28</span>
                </div>
              </div>

            </div>
          </div>

          {/* Microclimate Telemetry Grid */}
          <div className="glass-card slide-up delay-2 hover-scale" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Field Micro-Telemetry</h3>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Canopy Temp</span>
                <span className="num-tabular" style={{ display: 'block', fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>{hubData.microclimate.canopy_temp}</span>
                <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>{hubData.microclimate.canopy_threshold}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Wind Inversion</span>
                <span style={{ display: 'block', fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>{hubData.microclimate.wind_inversion}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Delta-T: {hubData.microclimate.delta_t}</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
