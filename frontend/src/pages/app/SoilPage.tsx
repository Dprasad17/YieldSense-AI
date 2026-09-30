import { CheckCircle2, Info, Layers, Leaf, TestTube, TriangleAlert, XCircle } from 'lucide-react';
import {
  Badge,
  Banner,
  Card,
  CardHeader,
  DataTable,
  PageHeader,
  RangeBar,
  Skeleton,
  StatCard,
  type Tone,
} from '../../components/ui';
import type { OptimalBand } from '../../api/types';
import { FarmSoilPanel } from '../../components/FarmSoilPanel';
import { ErrorState } from '../../components/ui/States';
import { useSoil } from '../../hooks/queries';
import { formatCount, formatIndex, formatPercent } from '../../lib/format';
import { useGlobalFilters } from '../../store/filters';
import s from './app.module.css';
import x from './extras.module.css';

const DEFAULT_CROP = 'Wheat';

function parseRange(text?: string): [number, number] | null {
  const m = text?.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function statusOf(text: string | undefined): { label: string; tone: Tone } {
  const t = (text ?? '').toLowerCase();
  if (t.includes('optimal') || t.includes('high')) return { label: 'Optimal', tone: 'success' };
  if (t.includes('moderate') || t.includes('slight')) return { label: 'Watch', tone: 'warning' };
  if (t) return { label: 'Critical', tone: 'danger' };
  return { label: 'Unknown', tone: 'neutral' };
}

function bandStatus(v: number, good: number, watch: number): { label: string; tone: Tone } {
  return v >= good
    ? { label: 'Optimal', tone: 'success' }
    : v >= watch
      ? { label: 'Watch', tone: 'warning' }
      : { label: 'Critical', tone: 'danger' };
}

/** Semicircle pH gauge (4–9) with acidic/neutral/alkaline zones, the crop's optimal band and a needle. */
function PhGauge({ value, band }: { value: number; band: [number, number] | null }) {
  const min = 4;
  const max = 9;
  const W = 320;
  const R = 130;
  const cx = W / 2;
  const cy = 150;
  const angle = (v: number) => Math.PI * (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min));
  const pt = (v: number, r: number) => [cx + r * Math.cos(angle(v)), cy - r * Math.sin(angle(v))];
  const arc = (from: number, to: number, r: number) => {
    const [x1, y1] = pt(from, r);
    const [x2, y2] = pt(to, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const [nx, ny] = pt(value, R - 28);
  return (
    <svg
      viewBox={`0 0 ${W} 180`}
      style={{ width: '100%', maxWidth: 420 }}
      role="img"
      aria-label={`Soil pH ${formatIndex(value)}${band ? `, optimal ${band[0]}–${band[1]}` : ''}`}
    >
      <path d={arc(4, 6.5, R)} style={{ stroke: 'var(--danger)' }} strokeWidth={14} fill="none" opacity={0.55} />
      <path d={arc(6.5, 7.5, R)} style={{ stroke: 'var(--success)' }} strokeWidth={14} fill="none" opacity={0.55} />
      <path d={arc(7.5, 9, R)} style={{ stroke: 'var(--data-model)' }} strokeWidth={14} fill="none" opacity={0.55} />
      {band && (
        <path
          d={arc(band[0], band[1], R - 20)}
          style={{ stroke: 'var(--primary)' }}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
        />
      )}
      <line x1={cx} y1={cy} x2={nx} y2={ny} style={{ stroke: 'var(--ink)' }} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={7} style={{ fill: 'var(--ink)' }} />
      {[4, 5, 6, 7, 8, 9].map(t => {
        const [x, y] = pt(t, R + 18);
        return (
          <text key={t} x={x} y={y + 4} textAnchor="middle" fontSize="12" style={{ fill: 'var(--muted)' }}>
            {t}
          </text>
        );
      })}
      <text
        x={cx}
        y={cy - 30}
        textAnchor="middle"
        fontSize="28"
        fontWeight="600"
        style={{ fill: 'var(--ink)', fontFamily: 'var(--font-mono)' }}
      >
        {formatIndex(value)}
      </text>
    </svg>
  );
}

export function SoilPage() {
  const { filters } = useGlobalFilters();
  const crop = filters.crop || DEFAULT_CROP;
  const q = useSoil(crop, filters.region, filters.farm ? Number(filters.farm) : undefined);
  const m = q.data?.soil_metrics as Record<string, number | string> | undefined;
  const g = q.data?.global_soil_averages as Record<string, number> | undefined;

  const ph = Number(m?.average_soil_pH);
  const band = parseRange(m?.optimal_pH_range as string | undefined);
  const health = Number(m?.soil_health_index);
  const suff = Number(m?.moisture_sufficiency_percent);
  const moist = Number(m?.average_soil_moisture_percent);
  const ndvi = Number(m?.average_NDVI_index);
  const phStatus = statusOf(m?.pH_suitability_status as string);
  const fert = statusOf(m?.fertility_assessment as string);

  return (
    <div className={s.page}>
      <PageHeader
        title="Soil"
        description={`Soil health, pH and vegetation vigour for ${q.data?.crop_type ?? crop}, averaged across the dataset.`}
        meta={
          <>
            <Badge tone="info">{q.data?.crop_type ?? crop}</Badge>
            {!filters.crop && <Badge>Default crop · change it in the context bar</Badge>}
            {m?.record_count != null && <Badge>{Number(m.record_count).toLocaleString('en-US')} records</Badge>}
          </>
        }
      />

      {filters.farm ? (
        <FarmSoilPanel farmId={Number(filters.farm)} />
      ) : (
        <Banner tone="info">
          Select a farm in the context bar to see real soil data for it (ISRIC SoilGrids and your soil tests, with
          nutrient ratings).
        </Banner>
      )}

      <div className={s.between}>
        <h2 className={x.h2Flat}>Reference dataset view</h2>
        <Badge tone="warning">Synthetic soil columns</Badge>
      </div>
      <p className={x.mutedP}>
        The figures below come from the reference dataset, where soil pH and moisture were generated, not measured. They
        show the workflow; they are not evidence about any real field.
      </p>

      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      <div className={s.kpis}>
        {m ? (
          <>
            <StatCard
              label="Soil health index"
              value={formatIndex(health)}
              unit="/ 1.00"
              icon={Layers}
              accent="var(--data-soil)"
              subtitle={String(m.fertility_assessment ?? '')}
              footer={<Badge tone={fert.tone}>{fert.label}</Badge>}
              info="Composite of pH suitability, moisture and vegetation vigour (0–1)."
            />
            <StatCard
              label="Soil pH"
              value={formatIndex(ph)}
              icon={TestTube}
              accent="var(--data-soil)"
              subtitle={band ? `Optimal ${band[0]}–${band[1]}` : undefined}
              footer={<Badge tone={phStatus.tone}>{phStatus.label}</Badge>}
            />
            <StatCard
              label="Moisture sufficiency"
              value={formatCount(suff)}
              unit="/ 100"
              icon={Layers}
              accent="var(--data-water)"
              subtitle={`Avg soil moisture ${formatPercent(moist)}`}
              footer={<Badge tone={bandStatus(suff, 70, 50).tone}>{bandStatus(suff, 70, 50).label}</Badge>}
              info="Score from 0 to 100 for how well soil moisture meets the crop’s needs. Average moisture is shown underneath."
            />
            <StatCard
              label="Vegetation vigour"
              value={formatIndex(ndvi)}
              unit="NDVI"
              icon={Leaf}
              accent="var(--data-vegetation)"
              subtitle={g?.NDVI_index != null ? `Global avg ${formatIndex(g.NDVI_index)}` : undefined}
              footer={<Badge tone={bandStatus(ndvi, 0.6, 0.45).tone}>{bandStatus(ndvi, 0.6, 0.45).label}</Badge>}
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => (
            <Card key={i}>
              <Skeleton height={90} />
            </Card>
          ))
        )}
      </div>

      <div className={s.grid}>
        <div className={s.s6}>
          <Card>
            <CardHeader
              title="Soil pH"
              subtitle={
                band
                  ? `Needle shows the average; highlighted arc is the optimal range for ${q.data?.crop_type ?? crop}`
                  : 'Needle shows the average pH'
              }
            />
            {m ? (
              <div className={s.stack} style={{ alignItems: 'center' }}>
                <PhGauge value={ph} band={band} />
                <div className={s.row} style={{ justifyContent: 'center' }}>
                  <Badge tone="danger">Acidic &lt; 6.5</Badge>
                  <Badge tone="success">Neutral 6.5–7.5</Badge>
                  <Badge tone="model">Alkaline &gt; 7.5</Badge>
                </div>
              </div>
            ) : (
              <Skeleton height={220} />
            )}
          </Card>
        </div>

        <div className={s.s6}>
          <Card>
            <CardHeader
              title="Soil metrics"
              subtitle="Marker is the crop average; the global average is listed for reference"
            />
            {m ? (
              <div className={s.stack} style={{ gap: 'var(--space-5)' }}>
                <div>
                  <div className={s.between}>
                    <strong>Soil moisture</strong>
                    <span className={s.num}>{formatPercent(moist)}</span>
                  </div>
                  <RangeBar
                    label="Soil moisture"
                    value={moist}
                    min={0}
                    max={100}
                    format={v => `${Math.round(v)}%`}
                    optimalLow={Number(m.optimal_moisture_low) || undefined}
                    optimalHigh={Number(m.optimal_moisture_high) || undefined}
                  />
                  {g?.soil_moisture_percent != null && (
                    <span className={s.small}>Global avg {formatPercent(g.soil_moisture_percent)}</span>
                  )}
                </div>
                <div>
                  <div className={s.between}>
                    <strong>Soil health index</strong>
                    <span className={s.num}>{formatIndex(health)}</span>
                  </div>
                  <RangeBar
                    label="Soil health index"
                    value={health}
                    min={0}
                    max={1}
                    optimalLow={0.75}
                    optimalHigh={1}
                  />
                  {g?.overall_soil_health_index != null && (
                    <span className={s.small}>Global avg {formatIndex(g.overall_soil_health_index)}</span>
                  )}
                </div>
                <div>
                  <div className={s.between}>
                    <strong>Vegetation index (NDVI)</strong>
                    <span className={s.num}>{formatIndex(ndvi)}</span>
                  </div>
                  <RangeBar
                    label="NDVI"
                    value={ndvi}
                    min={0}
                    max={1}
                    optimalLow={Number(m.optimal_ndvi_low) || undefined}
                    optimalHigh={Number(m.optimal_ndvi_high) || undefined}
                  />
                  {g?.NDVI_index != null && <span className={s.small}>Global avg {formatIndex(g.NDVI_index)}</span>}
                </div>
              </div>
            ) : (
              <Skeleton height={220} />
            )}
          </Card>
        </div>

        <div className={s.s12}>
          <Card>
            <CardHeader title="Guidance" subtitle={`Soil management for ${q.data?.crop_type ?? crop}`} />
            {q.data ? (
              <ul className={s.list}>
                {q.data.guidance.map(g => {
                  const Icon = g.status === 'optimal' ? CheckCircle2 : g.status === 'watch' ? TriangleAlert : XCircle;
                  const color =
                    g.status === 'optimal'
                      ? 'var(--success)'
                      : g.status === 'watch'
                        ? 'var(--warning)'
                        : 'var(--danger)';
                  return (
                    <li key={g.finding} className={s.listItem}>
                      <Icon size={20} color={color} aria-hidden="true" style={{ flexShrink: 0 }} />
                      <div>
                        <strong>{g.finding}</strong>
                        <p style={{ margin: 'var(--space-1) 0 0' }}>{g.action}</p>
                        <p className={s.small} style={{ margin: 'var(--space-1) 0 0' }}>
                          Why: {g.why}
                        </p>
                      </div>
                    </li>
                  );
                })}
                <li className={s.listItem}>
                  <Info size={20} color="var(--info)" aria-hidden="true" style={{ flexShrink: 0 }} />
                  <p className={s.muted} style={{ margin: 0 }}>
                    {q.data.general_reference_note}
                  </p>
                </li>
              </ul>
            ) : (
              <Skeleton height={80} />
            )}
          </Card>
        </div>

        <div className={s.s12}>
          <Card>
            <CardHeader
              title="Crop suitability for this soil profile"
              subtitle="Share of each crop’s optimal pH, moisture and NDVI bands that the current averages meet"
            />
            {q.data ? (
              <div className={s.tileGrid}>
                {q.data.crop_suitability.map(c => (
                  <div key={c.crop} className={s.tile}>
                    <div className={s.between}>
                      <strong>{c.crop}</strong>
                      <span className={s.num}>{formatIndex(c.suitability_index)}</span>
                    </div>
                    <span className={s.miniBar} style={{ width: '100%', margin: 'var(--space-2) 0' }}>
                      <i style={{ width: `${c.suitability_index * 100}%`, background: 'var(--data-soil)' }} />
                    </span>
                    <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }} className={s.small}>
                      {c.reasons.map(r => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <Skeleton height={160} />
            )}
          </Card>
        </div>
        <div className={s.s12}>
          <Card>
            <CardHeader
              title="Optimal bands for every metric"
              subtitle="Context mean against the P25–P75 band of the crop’s top-quartile-yield records"
              info="Real = measured country data; Synthetic = generated, not measured. Only rainfall and temperature feed the yield model."
            />
            {q.data ? (
              <DataTable
                caption="Optimal bands"
                compact
                rows={q.data.optimal_bands}
                rowKey={b => b.feature}
                columns={[
                  {
                    key: 'metric',
                    header: 'Metric',
                    render: (b: OptimalBand) => (
                      <span className={s.row} style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
                        <strong>{b.label}</strong>
                        {b.provenance && (
                          <Badge
                            tone={
                              b.provenance === 'real' ? 'success' : b.provenance === 'synthetic' ? 'warning' : 'info'
                            }
                          >
                            {b.provenance}
                          </Badge>
                        )}
                      </span>
                    ),
                  },
                  {
                    key: 'bar',
                    header: 'Position',
                    render: (b: OptimalBand) => {
                      const width = b.optimal_high - b.optimal_low || 1;
                      const lo = Math.min(b.observed, b.optimal_low) - width;
                      const hi = Math.max(b.observed, b.optimal_high) + width;
                      return (
                        <div style={{ minWidth: 160 }}>
                          <RangeBar
                            label={b.label}
                            value={b.observed}
                            min={Math.max(0, lo)}
                            max={hi}
                            optimalLow={b.optimal_low}
                            optimalHigh={b.optimal_high}
                            format={v => formatIndex(v)}
                          />
                        </div>
                      );
                    },
                  },
                  {
                    key: 'obs',
                    header: 'Mean',
                    align: 'right',
                    render: (b: OptimalBand) =>
                      `${formatIndex(b.observed)} ${b.unit === 'index' || b.unit === 'pH' ? '' : b.unit}`,
                  },
                  {
                    key: 'band',
                    header: 'Optimal',
                    align: 'right',
                    render: (b: OptimalBand) => `${formatIndex(b.optimal_low)}–${formatIndex(b.optimal_high)}`,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (b: OptimalBand) => (
                      <Badge tone={b.status === 'optimal' ? 'success' : 'warning'}>
                        {b.status === 'optimal' ? 'In band' : b.status === 'below' ? 'Below' : 'Above'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'share',
                    header: 'Records in band',
                    align: 'right',
                    render: (b: OptimalBand) => formatPercent(b.share_in_band * 100),
                  },
                ]}
              />
            ) : (
              <Skeleton height={260} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
