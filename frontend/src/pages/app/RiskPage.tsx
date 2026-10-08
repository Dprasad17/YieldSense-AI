import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ShieldAlert, TrendingDown } from 'lucide-react';
import type { RiskAssessment } from '../../api/types';
import { ChartCard, MultiLineChart } from '../../components/charts';
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  type Column,
  type Tone,
} from '../../components/ui';
import { sortRows } from '../../components/ui/helpers';
import { ErrorState } from '../../components/ui/States';
import { contextQuery, useRisk } from '../../hooks/queries';
import { formatCount, formatPercent, formatYield } from '../../lib/format';
import { filtersSearch, useGlobalFilters } from '../../store/filters';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';
import x from './extras.module.css';

type Risk = RiskAssessment['risks'][number];
type Anomaly = RiskAssessment['anomalies'][number];

const LEVEL_TONE: Record<Risk['level'], Tone> = {
  Low: 'success',
  Moderate: 'warning',
  High: 'danger',
  Critical: 'danger',
};
// Since dataset v3 rainfall varies by year, so drought and flood are on the timeline with heat.
const SERIES: { key: Risk['type']; label: string; color: string }[] = [
  { key: 'drought', label: 'Drought', color: 'warning' },
  { key: 'flood', label: 'Flood', color: 'data-water' },
  { key: 'heat', label: 'Heat', color: 'danger' },
  { key: 'pest_disease', label: 'Pest & disease', color: 'data-vegetation' },
  { key: 'soil', label: 'Soil pH', color: 'data-soil' },
];

function cellLevel(score: number): Risk['level'] {
  return score <= 4 ? 'Low' : score <= 9 ? 'Moderate' : score <= 15 ? 'High' : 'Critical';
}
const CELL_CLASS: Record<Risk['level'], string> = {
  Low: x.cellLow,
  Moderate: x.cellModerate,
  High: x.cellHigh,
  Critical: x.cellCritical,
};

/** 5×5 likelihood × impact matrix with each risk placed in its cell. */
function RiskMatrix({ risks }: { risks: Risk[] }) {
  const at = (l: number, i: number) => risks.filter(r => r.likelihood === l && r.impact === i);
  return (
    <div role="table" aria-label="Risk matrix: impact by likelihood" className={x.scrollX}>
      <div className={x.matrix}>
        {[5, 4, 3, 2, 1].map(impact => (
          <div key={impact} role="row" className={x.contents}>
            <div role="rowheader" className={`${s.small} ${x.matrixRowHead}`}>
              Impact {impact}
            </div>
            {[1, 2, 3, 4, 5].map(l => {
              const here = at(l, impact);
              const level = cellLevel(l * impact);
              return (
                <div
                  key={l}
                  role="cell"
                  title={`Likelihood ${l} × impact ${impact} = ${l * impact} (${level})`}
                  className={`${x.matrixCell} ${CELL_CLASS[level]}`}
                >
                  {here.map(r => (
                    <span key={r.type} className={x.strongInk}>
                      {r.label}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
        <div role="row" className={x.contents}>
          <div />
          {[1, 2, 3, 4, 5].map(l => (
            <div key={l} role="columnheader" className={`${s.small} ${x.tc}`}>
              Likelihood {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RiskPage() {
  const { unit } = usePreferences();
  const { filters } = useGlobalFilters();
  const q = useRisk(contextQuery(filters));
  const data = q.data;
  const risks = useMemo(() => data?.risks ?? [], [data]);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const top = risks[0];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of risks) c[r.level] = (c[r.level] ?? 0) + 1;
    return c;
  }, [risks]);
  const timeline = useMemo(
    () => (data?.timeline ?? []).map(t => ({ ...t, x: t.year }) as unknown as Record<string, number>),
    [data],
  );
  const search = filtersSearch(new URLSearchParams(window.location.search));

  const anomalyColumns: Column<Anomaly>[] = [
    { key: 'id', header: 'Record', render: a => <strong className={s.num}>{a.farm_id}</strong> },
    { key: 'region', header: 'Region', render: a => a.region },
    { key: 'crop', header: 'Crop', render: a => a.crop_type },
    { key: 'year', header: 'Year', align: 'right', render: a => a.year, sortValue: a => a.year },
    {
      key: 'yield',
      header: `Yield (${unit})`,
      align: 'right',
      render: a => formatYield(a.yield_kg_ha, unit),
      sortValue: a => a.yield_kg_ha,
    },
    {
      key: 'mean',
      header: `Crop mean (${unit})`,
      align: 'right',
      render: a => formatYield(a.crop_mean_kg_ha, unit),
    },
    {
      key: 'z',
      header: 'z-score',
      align: 'right',
      render: a => <Badge tone={a.direction === 'high' ? 'info' : 'danger'}>{a.z_score.toFixed(2)}</Badge>,
      sortValue: a => Math.abs(a.z_score),
    },
  ];

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className={s.page}>
      <PageHeader
        title="Risk assessment"
        description="How often each risk occurs in this context, how much yield it costs, and what to do about it."
        meta={data ? <Badge>{`${data.scope} · ${formatCount(data.record_count)} records`}</Badge> : undefined}
      />

      {data && data.record_count === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No records for this context"
          description="Choose another region, crop or year in the context switcher."
        />
      ) : (
        <>
          <div className={s.kpis}>
            {data ? (
              <>
                <StatCard
                  label="Highest risk"
                  value={top?.label ?? '—'}
                  icon={AlertTriangle}
                  accent="var(--danger)"
                  subtitle={top ? `${top.level} · score ${top.score}/25` : undefined}
                />
                <StatCard
                  label="Critical or high"
                  value={String((counts.Critical ?? 0) + (counts.High ?? 0))}
                  subtitle={`of ${risks.length} risk types`}
                />
                <StatCard
                  label="Records affected"
                  value={top ? formatPercent(top.share_affected * 100) : '—'}
                  subtitle={top ? `by ${top.label.toLowerCase()}` : undefined}
                />
                <StatCard
                  label="Yield anomalies"
                  value={formatCount(data.anomalies.length)}
                  icon={TrendingDown}
                  subtitle="More than 3σ from the crop mean"
                />
              </>
            ) : (
              Array.from({ length: 4 }, (_, i) => (
                <Card key={i}>
                  <Skeleton height={80} />
                </Card>
              ))
            )}
          </div>

          <div className={s.grid}>
            <div className={s.s6}>
              <Card>
                <CardHeader title="Risk matrix" subtitle="Likelihood × impact, 1–5 each" info={data?.method} />
                {data ? <RiskMatrix risks={risks} /> : <Skeleton height={320} />}
              </Card>
            </div>
            <div className={s.s6}>
              <Card>
                <CardHeader title="Mitigation" subtitle="Highest score first" />
                {data ? (
                  <ul className={`${s.list} ${x.listPlain}`}>
                    {risks.map(r => (
                      <li key={r.type} className={`${s.stack} ${x.gap1}`}>
                        <div className={s.between}>
                          <strong>{r.label}</strong>
                          <span className={s.row}>
                            {r.structural && <Badge tone="info">Structural</Badge>}
                            <Badge tone={LEVEL_TONE[r.level]}>
                              {r.level} · {r.score}
                            </Badge>
                          </span>
                        </div>
                        <span className={s.small}>
                          {r.trigger}: {formatPercent(r.share_affected * 100)} of records; median yield{' '}
                          {r.median_yield_loss_pct > 0 ? `${r.median_yield_loss_pct}% lower` : 'not lower'} than
                          unaffected records.
                        </span>
                        {r.note && <span className={s.small}>{r.note}</span>}
                        <span>{r.mitigation}</span>
                        <Link
                          to={`/app/recommendations${search ? `${search}&` : '?'}category=${r.recommendation_category}`}
                          className={s.small}
                        >
                          Related recommendations <ArrowRight size={12} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Skeleton height={320} />
                )}
              </Card>
            </div>

            <div className={s.s12}>
              <ChartCard
                title="Risk timeline"
                subtitle="Share of records breaching each threshold, by year (rainfall and temperature are each year's CRU TS country values)"
                summary={
                  timeline.length
                    ? `Risk shares from ${timeline[0].x} to ${timeline[timeline.length - 1].x}.`
                    : 'No yearly data.'
                }
                legend={SERIES.map(x => ({ label: x.label, color: x.color }))}
                height={300}
              >
                {(c, h) =>
                  data ? (
                    <MultiLineChart
                      data={timeline}
                      colors={c}
                      height={h}
                      fx={v => String(v)}
                      fy={v => `${Math.round(v * 100)}%`}
                      series={SERIES.map(x => ({
                        key: x.key,
                        label: x.label,
                        color: c[x.color as keyof typeof c],
                      }))}
                    />
                  ) : (
                    <Skeleton height={h} />
                  )
                }
              </ChartCard>
            </div>

            <div className={s.s12}>
              <Card>
                <CardHeader
                  title="Yield anomalies"
                  subtitle="Records whose yield is more than 3 standard deviations from their crop’s mean"
                />
                {!data ? (
                  <Skeleton height={200} />
                ) : data.anomalies.length === 0 ? (
                  <EmptyState title="No anomalies" description="Every record is within 3σ of its crop’s mean yield." />
                ) : (
                  <DataTable
                    caption="Yield anomalies"
                    columns={anomalyColumns}
                    rows={sortRows(data.anomalies, anomalyColumns, sort)}
                    rowKey={a => a.farm_id}
                    sort={sort}
                    onSortChange={setSort}
                    maxHeight={420}
                  />
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
