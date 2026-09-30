import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CloudRain,
  Cpu,
  Database,
  Download,
  History,
  Layers,
  Leaf,
  Sparkles,
  Sprout,
  TriangleAlert,
} from 'lucide-react';
import {
  Badge,
  BarList,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  InsightCallout,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { ErrorState, SampleDataPill } from '../../components/ui/States';
import { useAuth, useCan } from '../../auth/context';
import { useDatasetSummary, useEdaMetrics, useRecommendationsHub } from '../../hooks/queries';
import { formatCount, formatIndex, formatRainfall, formatYield, formatYieldWithUnit } from '../../lib/format';
import { listRecent } from '../../lib/localStore';
import { selectCropRanking, selectSummaryKpis, selectYieldStats } from '../../lib/selectors';
import { useGlobalFilters } from '../../store/filters';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DashboardPage() {
  const { user } = useAuth();
  const can = useCan();
  const navigate = useNavigate();
  const { unit } = usePreferences();
  const { filters, search } = useGlobalFilters();
  const summaryQ = useDatasetSummary();
  const edaQ = useEdaMetrics();
  const hubQ = useRecommendationsHub();
  const [recent] = useState(() => (user ? listRecent(user.username).slice(0, 4) : []));

  const kpis = selectSummaryKpis(summaryQ.data);
  const stats = selectYieldStats(edaQ.data);
  const ranking = useMemo(() => selectCropRanking(edaQ.data?.crop_breakdown), [edaQ.data]);
  const maxCrop = ranking[0]?.avgYield ?? 1;
  const first =
    user?.full_name.split(/\s+/).find(p => /^[A-Za-z]/.test(p) && !p.endsWith('.')) ?? user?.full_name ?? '';
  const scope = kpis ? `Global · ${formatCount(kpis.recordCount)} records` : undefined;

  const exportKpis = () => {
    if (!kpis) return;
    downloadCsv('yieldsense-dashboard.csv', [
      ['Metric', 'Value', 'Unit', 'Scope'],
      ['Farm records', kpis.recordCount, 'records', 'Dataset'],
      ['Average yield (mean)', Math.round(kpis.meanYield), 'kg/ha', 'Global'],
      ...(stats ? [['Median yield', Math.round(stats.median), 'kg/ha', 'Global']] : []),
      ['Average rainfall', Math.round(kpis.meanRainfall), 'mm', 'Global'],
      ['Vegetation index (NDVI)', kpis.meanNdvi, 'index', 'Global'],
      ...ranking.map(c => [`Mean yield · ${c.crop}`, Math.round(c.avgYield), 'kg/ha', `${c.count} records`]),
    ]);
  };

  const recs = [hubQ.data?.irrigation_dispatch, hubQ.data?.spray_window].filter(Boolean) as {
    title: string;
    explanation: string;
  }[];

  return (
    <div className={s.page}>
      <PageHeader
        title={`${greeting()}${first ? `, ${first}` : ''}`}
        description="Here’s an overview of yields, climate and vegetation across the dataset."
        meta={
          <>
            <Badge tone="info">
              {filters.region || 'All regions'} · {filters.crop || 'All crops'}
            </Badge>
            {summaryQ.dataUpdatedAt > 0 && (
              <Badge>
                Updated{' '}
                {new Date(summaryQ.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <Button icon={Download} onClick={exportKpis} disabled={!kpis}>
              Export
            </Button>
            <ButtonLink to={`/app/predict${search}`} variant="primary" icon={Cpu}>
              New prediction
            </ButtonLink>
          </>
        }
      />

      {summaryQ.isError ? (
        <ErrorState error={summaryQ.error} onRetry={() => summaryQ.refetch()} />
      ) : (
        <div className={s.kpis}>
          {kpis ? (
            <>
              <StatCard
                label="Farm records"
                value={formatCount(kpis.recordCount)}
                icon={Database}
                subtitle={`Dataset rows · ${formatCount(kpis.regionCount)} regions`}
                info="Each record is one region, crop and year in the dataset."
              />
              <StatCard
                label="Average yield"
                value={formatYield(kpis.meanYield, unit)}
                unit={unit}
                icon={Sprout}
                accent="var(--data-vegetation)"
                subtitle={`${scope} · mean`}
                info={
                  stats
                    ? `Mean ${formatYieldWithUnit(stats.mean, unit)}. Median ${formatYieldWithUnit(stats.median, unit)}: high-yield root crops pull the mean up.`
                    : 'Mean yield across all records.'
                }
              />
              <StatCard
                label="Average rainfall"
                value={formatRainfall(kpis.meanRainfall).replace(' mm', '')}
                unit="mm"
                icon={CloudRain}
                accent="var(--data-water)"
                subtitle={`${scope} · mean`}
                info="Mean annual rainfall across all records."
              />
              <StatCard
                label="Vegetation index"
                value={formatIndex(kpis.meanNdvi)}
                unit="NDVI"
                icon={Leaf}
                accent="var(--data-vegetation)"
                subtitle={`${scope} · mean`}
                info="NDVI ranges from 0 to 1; higher means denser, healthier vegetation."
              />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => (
              <Card key={i}>
                <Skeleton width="50%" />
                <div style={{ height: 12 }} />
                <Skeleton height={32} width="70%" />
              </Card>
            ))
          )}
        </div>
      )}

      <div className={s.grid}>
        <div className={s.s8}>
          {edaQ.isError ? (
            <ErrorState error={edaQ.error} onRetry={() => edaQ.refetch()} />
          ) : (
            <Card>
              <CardHeader
                title="Average yield by crop"
                subtitle="Mean yield per crop across all records"
                info="Root crops (potato, cassava, yams) produce far more mass per hectare than grains, so compare crops of the same type."
              />
              {ranking.length ? (
                <BarList
                  label="Mean yield by crop"
                  items={ranking.map(r => ({ label: r.crop, value: r.avgYield }))}
                  format={v => formatYieldWithUnit(v, unit)}
                  benchmark={stats?.mean}
                  benchmarkLabel="Global mean"
                />
              ) : (
                <Skeleton height={300} />
              )}
              {ranking.length > 1 && (
                <InsightCallout>
                  {ranking[0].crop} yields {Math.round(ranking[0].avgYield / ranking[ranking.length - 1].avgYield)}×
                  more per hectare than {ranking[ranking.length - 1].crop}; compare crops within the same type.
                </InsightCallout>
              )}
            </Card>
          )}
        </div>

        <div className={s.s4}>
          <Card>
            <CardHeader title="Quick actions" subtitle="Jump straight to a task" />
            <div className={s.stack}>
              {[
                {
                  to: '/app/predict',
                  icon: Cpu,
                  label: 'Predict yield',
                  text: 'Estimate yield from field conditions',
                  perm: 'predict' as const,
                },
                {
                  to: '/app/soil',
                  icon: Layers,
                  label: 'Check soil',
                  text: 'pH, moisture and vegetation for a crop',
                  perm: 'soil' as const,
                },
                {
                  to: '/app/weather',
                  icon: CloudRain,
                  label: 'Weather outlook',
                  text: 'Climate scores for your region',
                  perm: 'weather' as const,
                },
                {
                  to: '/app/data',
                  icon: Database,
                  label: 'Open dataset',
                  text: 'Search and inspect records',
                  perm: 'dataset' as const,
                },
              ]
                .filter(a => can(a.perm))
                .map(a => (
                  <Link
                    key={a.to}
                    to={`${a.to}${search}`}
                    className={s.tile}
                    style={{
                      display: 'flex',
                      gap: 'var(--space-3)',
                      alignItems: 'center',
                      textDecoration: 'none',
                      color: 'var(--ink)',
                    }}
                  >
                    <a.icon size={18} color="var(--primary)" aria-hidden="true" />
                    <span>
                      <span style={{ display: 'block', fontWeight: 'var(--weight-medium)' }}>{a.label}</span>
                      <span className={s.small}>{a.text}</span>
                    </span>
                  </Link>
                ))}
            </div>
          </Card>
        </div>

        <div className={s.s6}>
          <Card>
            <CardHeader
              title="Yield by crop"
              subtitle={`${ranking.length || '—'} crops ranked by mean yield · all records`}
              info="From the EDA metrics. The marker is the global mean across every record."
            />
            {edaQ.isError ? (
              <ErrorState error={edaQ.error} onRetry={() => edaQ.refetch()} />
            ) : ranking.length ? (
              <BarList
                label="Crops ranked by mean yield"
                items={ranking.map(r => ({ label: r.crop, value: r.avgYield }))}
                format={v => formatYieldWithUnit(v, unit)}
                benchmark={stats?.mean}
                benchmarkLabel="Global mean"
              />
            ) : (
              <Skeleton height={260} />
            )}
          </Card>
        </div>

        <div className={s.s6}>
          <Card>
            <CardHeader
              title="Crop portfolio"
              subtitle={`${ranking.length || '—'} crops in the dataset · mean yield and record count`}
            />
            {ranking.length ? (
              <div className={s.tileGrid}>
                {ranking.map(c => (
                  <div key={c.crop} className={s.tile}>
                    <div className={s.between}>
                      <strong>{c.crop}</strong>
                      <span className={s.small}>{formatCount(c.count)}</span>
                    </div>
                    <div className={s.num} style={{ fontSize: 'var(--text-lg)', marginTop: 'var(--space-1)' }}>
                      {formatYield(c.avgYield, unit)} <span className={s.small}>{unit}</span>
                    </div>
                    <span className={s.miniBar} style={{ width: '100%', marginTop: 'var(--space-2)' }}>
                      <i style={{ width: `${(c.avgYield / maxCrop) * 100}%`, background: 'var(--data-vegetation)' }} />
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Skeleton height={180} />
            )}
          </Card>
        </div>

        <div className={s.s8}>
          <Card>
            <CardHeader
              title="Top recommendations"
              subtitle="Highest-priority actions"
              actions={
                <>
                  <SampleDataPill />
                  <ButtonLink to={`/app/recommendations${search}`} size="sm" variant="ghost">
                    View all
                  </ButtonLink>
                </>
              }
            />
            {hubQ.isError ? (
              <ErrorState error={hubQ.error} onRetry={() => hubQ.refetch()} />
            ) : recs.length ? (
              <ul className={s.list}>
                {recs.map((r, i) => (
                  <li
                    key={r.title}
                    className={s.tile}
                    style={{ borderLeft: `3px solid ${i === 0 ? 'var(--danger)' : 'var(--warning)'}` }}
                  >
                    <div className={s.row}>
                      <Badge tone={i === 0 ? 'danger' : 'warning'} icon={TriangleAlert}>
                        {i === 0 ? 'Critical' : 'High'}
                      </Badge>
                      <strong style={{ fontSize: 'var(--text-md)' }}>{r.title}</strong>
                    </div>
                    <p className={s.muted} style={{ margin: 'var(--space-2) 0 0' }}>
                      {r.explanation}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Skeleton height={140} />
            )}
          </Card>
        </div>

        <div className={s.s4}>
          <Card>
            <CardHeader
              title="Recent predictions"
              subtitle="Saved on this device"
              actions={
                can('history') ? (
                  <ButtonLink to="/app/history" size="sm" variant="ghost">
                    View all
                  </ButtonLink>
                ) : undefined
              }
            />
            {recent.length ? (
              <ul className={s.list}>
                {recent.map(p => (
                  <li key={p.id} className={s.between}>
                    <span>
                      <span style={{ display: 'block', fontWeight: 'var(--weight-medium)' }}>
                        {p.input.crop_type} · {p.input.region}
                      </span>
                      <span className={s.small}>{new Date(p.savedAt).toLocaleDateString()}</span>
                    </span>
                    <span className={s.num}>{formatYieldWithUnit(p.result.predicted_yield_kg_ha, unit)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={History}
                title="No predictions yet"
                description="Predictions you save appear here."
                action={
                  <Button size="sm" variant="primary" icon={Sparkles} onClick={() => navigate('/app/predict')}>
                    Make a prediction
                  </Button>
                }
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
