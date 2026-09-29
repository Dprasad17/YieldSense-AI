import React from 'react';
import { BarChart2, TrendingUp, Layers, TestTube } from 'lucide-react';
import { useEdaMetrics } from '../hooks/queries';
import { formatCount, formatIndex, formatRainfall, formatYield, formatYieldWithUnit } from '../lib/format';
import { describeList, selectCropRanking, selectTopCrop, selectYieldStats } from '../lib/selectors';
import { usePreferences } from '../store/preferences';
import { ErrorState, LoadingState, SampleDataPill } from './ui/States';

const RANKING_SIZE = 5;

export const EdaDashboard: React.FC = () => {
  const edaQuery = useEdaMetrics();
  const { unit } = usePreferences();

  if (edaQuery.isPending) return <LoadingState label="Loading analysis…" />;
  if (edaQuery.isError) return <ErrorState error={edaQuery.error} onRetry={() => edaQuery.refetch()} />;

  const metrics = edaQuery.data;
  const totalRecords = metrics.total_records;
  const ranking = selectCropRanking(metrics.crop_breakdown);
  const topCrop = selectTopCrop(metrics.crop_breakdown);
  const yieldStats = selectYieldStats(metrics);
  const rainfall = metrics.overall_stats?.rainfall_mm;
  const ph = metrics.overall_stats?.soil_pH;
  const shownRanking = ranking.slice(0, RANKING_SIZE);
  const maxYield = shownRanking[0]?.avgYield ?? 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      
      {/* Top Statistical Summary Banner */}
      <div className="glass-card" style={{ padding: '1.5rem 1.75rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(59,130,246,0.08) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
              <BarChart2 className="gradient-text-green" size={26} />
              <h2 style={{ fontSize: '1.35rem', color: '#ffffff', margin: 0, fontWeight: 800 }}>
                Exploratory Data Analysis (EDA) Insights
              </h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
              Statistical distributions, correlation heatmaps, and agricultural factor dependencies across {formatCount(totalRecords)} farm records.
            </p>
          </div>

          <span className="badge badge-green" style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}>
            {formatCount(totalRecords)} records analysed
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
          {ranking.map(item => (
            <div key={item.crop} style={{ background: 'var(--surface-2)', padding: 'var(--space-4)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', fontWeight: 'var(--weight-medium)' }}>{item.crop}</div>
              <div className="num-tabular" style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--ink)', margin: 'var(--space-1) 0' }}>
                {formatYield(item.avgYield, unit)} <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{unit} mean</span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{formatCount(item.count)} records</div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Theme-Matched EDA Visualizations Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
        
        {/* CHART 1: Crop Yield Distribution (Histogram & Density Curve) */}
        <div className="glass-card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Crop Yield Distribution</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>KDE & Frequency histogram showing yield spread (kg/ha)</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {yieldStats && <span className="badge badge-green" style={{ whiteSpace: 'nowrap' }}><TrendingUp size={12} /> Mean {formatYieldWithUnit(yieldStats.mean, unit)}</span>}
              {yieldStats && <span className="badge badge-blue" style={{ whiteSpace: 'nowrap' }}>Median {formatYieldWithUnit(yieldStats.median, unit)}</span>}
              <SampleDataPill reason="Bars are illustrative until the histogram is computed from the dataset (Phase 8)." />
            </div>
          </div>

          <div style={{ background: '#0a130d', borderRadius: '10px', padding: '1.25rem', border: '1px solid var(--border-color)', height: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <svg viewBox="0 0 400 140" style={{ width: '100%', height: '160px' }}>
              {/* Grid Lines */}
              <line x1="40" y1="20" x2="380" y2="20" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <line x1="40" y1="60" x2="380" y2="60" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <line x1="40" y1="100" x2="380" y2="100" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

              {/* Bars */}
              {[
                { x: 50, h: 25 },
                { x: 80, h: 45 },
                { x: 110, h: 75 },
                { x: 140, h: 105 },
                { x: 170, h: 115 },
                { x: 200, h: 95 },
                { x: 230, h: 70 },
                { x: 260, h: 40 },
                { x: 290, h: 20 },
                { x: 320, h: 10 }
              ].map((b, i) => (
                <rect key={i} x={b.x} y={120 - b.h} width="22" height={b.h} fill="rgba(16, 185, 129, 0.35)" stroke="#10b981" strokeWidth="1" rx="3" />
              ))}

              {/* KDE Curve */}
              <path d="M 50 110 Q 140 10, 180 5 T 340 115" fill="none" stroke="#34d399" strokeWidth="3" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', paddingLeft: '30px', paddingRight: '20px' }}>
              {yieldStats?.isRightSkewed ? (
                <span>
                  Right-skewed: the mean is {yieldStats.meanToMedian.toFixed(1)}× the median, pulled up by high-yield root crops. The median is the better &ldquo;typical&rdquo; value.
                </span>
              ) : (
                <span>Mean and median are close, so the distribution is roughly symmetric.</span>
              )}
            </div>
          </div>
        </div>

        {/* CHART 2: Yield Comparison by Crop Species */}
        <div className="glass-card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Average Productivity by Crop</h3>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>Top {shownRanking.length} of {ranking.length} crops by mean yield: {describeList(shownRanking.map(c => c.crop), RANKING_SIZE)}</span>
            </div>
            {topCrop && <span className="badge badge-blue" style={{ whiteSpace: 'nowrap' }}><Layers size={12} /> Top: {topCrop.crop} ({formatYieldWithUnit(topCrop.avgYield, unit)})</span>}
          </div>

          <div style={{ background: '#0a130d', borderRadius: '10px', padding: '1.25rem', border: '1px solid var(--border-color)', height: '220px', display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'center' }}>
            {shownRanking.map(c => (
              <div key={c.crop} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ width: '85px', fontSize: '0.8rem', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.crop}</span>
                <div style={{ flex: 1, height: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ width: `${(c.avgYield / maxYield) * 100}%`, height: '100%', background: 'var(--data-vegetation)', borderRadius: 'var(--radius-full)' }}></div>
                </div>
                <span className="num-tabular" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--ink)', width: '110px', textAlign: 'right' }}>
                  {formatYield(c.avgYield, unit)} <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CHART 3: Seasonal Rainfall vs. Yield Scatter & Trend */}
        <div className="glass-card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Seasonal Rainfall vs. Yield</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Scatter plot with linear regression trend</span>
            </div>
            <SampleDataPill reason="Points and trend line are illustrative until computed from the dataset (Phase 8)." />
          </div>

          <div style={{ background: '#0a130d', borderRadius: '10px', padding: '1.25rem', border: '1px solid var(--border-color)', height: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <svg viewBox="0 0 400 140" style={{ width: '100%', height: '160px' }}>
              {/* Grid Lines */}
              <line x1="40" y1="20" x2="380" y2="20" stroke="rgba(255,255,255,0.06)" />
              <line x1="40" y1="70" x2="380" y2="70" stroke="rgba(255,255,255,0.06)" />
              <line x1="40" y1="120" x2="380" y2="120" stroke="rgba(255,255,255,0.06)" />

              {/* Trend Line */}
              <line x1="50" y1="110" x2="370" y2="30" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="4 4" />

              {/* Scatter Points */}
              {[
                { x: 60, y: 105 }, { x: 80, y: 95 }, { x: 110, y: 88 }, { x: 130, y: 75 },
                { x: 160, y: 82 }, { x: 190, y: 65 }, { x: 220, y: 55 }, { x: 250, y: 48 },
                { x: 280, y: 40 }, { x: 310, y: 35 }, { x: 340, y: 28 }, { x: 365, y: 25 }
              ].map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" fill="#38bdf8" opacity="0.85" />
              ))}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', paddingLeft: '30px', paddingRight: '20px' }}>
              <span>Min {formatRainfall(rainfall?.min)}</span>
              <span>Median {formatRainfall(rainfall?.median)}</span>
              <span>Max {formatRainfall(rainfall?.max)}</span>
            </div>
          </div>
        </div>

        {/* CHART 4: Soil pH Impact Threshold Analysis */}
        <div className="glass-card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Soil pH Impact Curve</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Evaluating acidity/alkalinity impact on crop yield</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="badge badge-purple" style={{ whiteSpace: 'nowrap' }}><TestTube size={12} /> Optimal: pH 6.0–7.2</span>
              <SampleDataPill reason="Curve is illustrative until computed from the dataset (Phase 8). The optimal band is a general agronomic reference." />
            </div>
          </div>

          <div style={{ background: '#0a130d', borderRadius: '10px', padding: '1.25rem', border: '1px solid var(--border-color)', height: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <svg viewBox="0 0 400 140" style={{ width: '100%', height: '160px' }}>
              {/* Highlight Optimal Range Box */}
              <rect x="140" y="10" width="140" height="110" fill="rgba(16, 185, 129, 0.12)" stroke="rgba(16, 185, 129, 0.3)" strokeWidth="1" />
              
              {/* pH Bell Curve */}
              <path d="M 50 115 Q 210 15, 370 115" fill="none" stroke="#c084fc" strokeWidth="3" />
              
              <circle cx="210" cy="18" r="5" fill="#34d399" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', paddingLeft: '30px', paddingRight: '20px' }}>
              <span>Min pH {formatIndex(ph?.min)}</span>
              <span>Median pH {formatIndex(ph?.median)}</span>
              <span>Max pH {formatIndex(ph?.max)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
