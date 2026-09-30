import { useMemo, useState } from 'react';
import { Clock, Gauge, Target, Timer } from 'lucide-react';
import type { ModelResult, SplitKey } from '../../api/types';
import { BarCompareChart, ChartCard } from '../../components/charts';
import { ProvenanceBadge, ProvenanceLegend } from '../../components/Provenance';
import {
  Badge,
  Banner,
  Card,
  CardHeader,
  DataTable,
  PageHeader,
  SegmentedControl,
  Skeleton,
  StatCard,
  type Column,
} from '../../components/ui';
import { ErrorState } from '../../components/ui/States';
import { useModelCard, useProvenance } from '../../hooks/queries';
import { formatCount, formatIndex, formatLatency, formatNumber, formatPercent } from '../../lib/format';
import s from './app.module.css';
import x from './extras.module.css';

const SPLITS: { value: SplitKey; label: string }[] = [
  { value: 'temporal', label: 'Temporal' },
  { value: 'random', label: 'Random' },
  { value: 'unseen_region', label: 'Unseen regions' },
];
type Target = 'all' | 'raw' | 'log1p';

/** Model performance straight from models/v2/model_card.json: every model × target × split, as trained. */
export function ModelPerformancePage() {
  const q = useModelCard();
  const provenance = useProvenance().data;
  const [split, setSplit] = useState<SplitKey>('temporal');
  const [target, setTarget] = useState<Target>('all');
  const card = q.data;
  const sel = card?.selected;
  const isServed = (r: ModelResult) => !!sel && r.model === sel.model && r.target === sel.target;

  const rows = useMemo(
    () =>
      (card?.results ?? [])
        .filter(r => r.split === split && (target === 'all' || r.target === target))
        .sort((a, b) => a.rmse - b.rmse),
    [card, split, target],
  );
  const best = rows[0];
  const byColumn = useMemo(() => new Map((provenance?.columns ?? []).map(c => [c.column, c])), [provenance]);

  const columns: Column<ModelResult>[] = [
    {
      key: 'model',
      header: 'Model',
      sticky: true,
      render: r => (
        <span className={isServed(r) ? x.served : undefined}>
          {r.model}
          {isServed(r) && (
            <>
              {' '}
              <Badge tone="success">Served</Badge>
            </>
          )}
          {r.model.includes('Keras') && (
            <>
              {' '}
              <Badge title="Evaluated only; serving it would add TensorFlow to the API runtime.">Not served</Badge>
            </>
          )}
        </span>
      ),
    },
    { key: 'target', header: 'Target', render: r => (r.target === 'log1p' ? 'log1p' : 'raw') },
    { key: 'mae', header: 'MAE', align: 'right', render: r => formatCount(r.mae), sortValue: r => r.mae },
    { key: 'rmse', header: 'RMSE', align: 'right', render: r => formatCount(r.rmse), sortValue: r => r.rmse },
    { key: 'r2', header: 'R²', align: 'right', render: r => formatNumber(r.r2, 4), sortValue: r => r.r2 },
    { key: 'mape', header: 'MAPE', align: 'right', render: r => formatPercent(r.mape), sortValue: r => r.mape },
    {
      key: 'p50',
      header: 'p50',
      align: 'right',
      render: r => formatLatency(r.latency_p50_ms),
      sortValue: r => r.latency_p50_ms,
    },
    {
      key: 'p95',
      header: 'p95',
      align: 'right',
      render: r => formatLatency(r.latency_p95_ms),
      sortValue: r => r.latency_p95_ms,
    },
    {
      key: 'cov',
      header: 'P10–P90 coverage',
      align: 'right',
      render: r => formatPercent(r.interval_coverage * 100),
      sortValue: r => r.interval_coverage,
    },
  ];

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = sel?.metrics;
  const heldout = card?.interval?.heldout;
  const ablation = card?.weather_ablation;
  const prev = card?.previous_version?.selected;
  return (
    <div className={s.page}>
      <PageHeader
        title="Model performance"
        description="Every model evaluated on three splits, exactly as reported by the training run."
        meta={
          card ? (
            <Badge tone="model">
              {card.name} · v{card.version} · trained {new Date(card.trained_at).toLocaleDateString()}
            </Badge>
          ) : undefined
        }
      />
      <div className={s.kpis}>
        {m ? (
          <>
            <StatCard
              label="R² · temporal test"
              value={formatNumber(m.r2, 4)}
              icon={Gauge}
              accent="var(--data-model)"
              subtitle={`${sel.model} (${sel.target}) · 2009–2013`}
              info="Share of yield variation explained on years the model never saw."
            />
            <StatCard
              label="RMSE"
              value={formatCount(m.rmse)}
              unit="kg/ha"
              subtitle={`MAE ${formatCount(m.mae)} kg/ha`}
            />
            <StatCard
              label="P10–P90 coverage · held out"
              value={heldout ? formatPercent(heldout.coverage * 100) : formatPercent(m.interval_coverage * 100)}
              icon={Target}
              subtitle={
                heldout
                  ? `Nominal 80% · mean width ${formatCount(heldout.mean_width_kg_ha)} kg/ha · 2011–2013`
                  : 'Nominal 80% · random calibration'
              }
              info={heldout?.method ?? 'Calibrated on a random slice of the training years.'}
            />
            <StatCard
              label="Latency p50 / p95"
              value={`${formatNumber(m.latency_p50_ms, 1)} / ${formatNumber(m.latency_p95_ms, 1)}`}
              unit="ms"
              icon={Clock}
              subtitle="Single-row prediction"
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
        <div className={s.s12}>
          <Card>
            <CardHeader
              title="Model comparison"
              subtitle={card ? card.splits[split] : 'Loading'}
              actions={
                <div className={s.row}>
                  <SegmentedControl<SplitKey>
                    label="Evaluation split"
                    value={split}
                    onChange={setSplit}
                    options={SPLITS}
                  />
                  <SegmentedControl<Target>
                    label="Target"
                    value={target}
                    onChange={setTarget}
                    options={[
                      { value: 'all', label: 'Both targets' },
                      { value: 'raw', label: 'Raw' },
                      { value: 'log1p', label: 'log1p' },
                    ]}
                  />
                </div>
              }
            />
            {rows.length ? (
              <DataTable
                caption="Model comparison"
                columns={columns}
                rows={rows}
                rowKey={r => `${r.model}-${r.target}-${r.split}`}
                compact
              />
            ) : (
              <Skeleton height={320} />
            )}
            {best && (
              <p className={`${s.small} ${x.mt3Only}`}>
                Sorted by RMSE (kg/ha). Lowest on this split: {best.model} ({best.target}), RMSE{' '}
                {formatCount(best.rmse)}, trained on {formatCount(best.train_rows)} rows and tested on{' '}
                {formatCount(best.test_rows)}.
              </p>
            )}
          </Card>
        </div>

        <div className={s.s7}>
          <ChartCard
            title="RMSE by model"
            subtitle={`${SPLITS.find(x => x.value === split)?.label} split · lower is better`}
            summary={best ? `${best.model} (${best.target}) has the lowest RMSE on this split.` : 'Loading.'}
          >
            {(c, h) =>
              rows.length ? (
                <BarCompareChart
                  data={rows.map(r => ({ label: `${r.model} · ${r.target}`, value: r.rmse }))}
                  colors={c}
                  height={h}
                  color={c['data-model']}
                  fy={v => formatCount(v)}
                />
              ) : (
                <Skeleton height={h} />
              )
            }
          </ChartCard>
        </div>

        <div className={s.s5}>
          <Card>
            <CardHeader title="Selection rule" subtitle="How the served model was chosen" />
            {card ? (
              <div className={s.stack}>
                <p className={x.m0}>{card.selection_rule}</p>
                {card.previous_model && (
                  <Banner tone="info">
                    <strong>Previous model: {card.previous_model.model}.</strong> R²{' '}
                    {formatIndex(card.previous_model.r2)}, RMSE {formatCount(card.previous_model.rmse)} kg/ha.{' '}
                    {card.previous_model.note}
                  </Banner>
                )}
              </div>
            ) : (
              <Skeleton height={140} />
            )}
          </Card>
        </div>

        <div className={s.s6}>
          <Card>
            <CardHeader title="Prediction interval" subtitle="How the P10–P90 band is built" />
            {card ? (
              <dl className={s.dl}>
                <dt>Method</dt>
                <dd>{card.interval.method}</dd>
                <dt>Residual P10 / P90</dt>
                <dd className={s.num}>
                  {formatCount(card.interval.residual_q10)} / +{formatCount(card.interval.residual_q90)} kg/ha
                </dd>
                <dt>Held-out coverage</dt>
                <dd>
                  {heldout
                    ? `${formatPercent(heldout.coverage * 100)} of ${formatCount(heldout.evaluation_rows)} yields (2011–2013) fall inside a band calibrated on ${formatCount(heldout.calibration_rows)} rows from 2009–2010. Mean width ${formatCount(heldout.mean_width_kg_ha)} kg/ha, median ${formatCount(heldout.median_width_kg_ha)} kg/ha. Nominal 80%.`
                    : 'Not measured.'}
                </dd>
                <dt>Coverage column</dt>
                <dd>
                  The table&apos;s coverage uses a band calibrated on a random slice of the training years; on the
                  temporal split it covers {m ? formatPercent(m.interval_coverage * 100) : '—'} of test yields.
                </dd>
              </dl>
            ) : (
              <Skeleton height={140} />
            )}
          </Card>
        </div>

        {ablation && (
          <div className={s.s6}>
            <Card>
              <CardHeader
                title="Weather impact (ablation)"
                subtitle={`Temporal split · ${ablation.model} (${ablation.target}) with and without weather inputs`}
              />
              <DataTable
                caption="Weather feature ablation"
                compact
                rows={ablation.results}
                rowKey={r => r.variant}
                columns={[
                  { key: 'v', header: 'Variant', render: r => r.variant },
                  { key: 'rmse', header: 'RMSE', align: 'right', render: r => formatCount(r.rmse) },
                  {
                    key: 'd',
                    header: 'ΔRMSE',
                    align: 'right',
                    render: r =>
                      r.delta_rmse === 0 ? '—' : `${r.delta_rmse > 0 ? '+' : ''}${formatCount(r.delta_rmse)}`,
                  },
                  { key: 'r2', header: 'R²', align: 'right', render: r => formatNumber(r.r2, 4) },
                  {
                    key: 'dr2',
                    header: 'ΔR²',
                    align: 'right',
                    render: r =>
                      r.delta_r2 === 0 ? '—' : `${r.delta_r2 > 0 ? '+' : ''}${formatNumber(r.delta_r2, 4)}`,
                  },
                ]}
              />
              <p className={s.small}>{ablation.note}</p>
            </Card>
          </div>
        )}

        {prev && m && (
          <div className={s.s6}>
            <Card>
              <CardHeader
                title={`Before / after · v${card?.previous_version?.version ?? '?'} → v${card?.version}`}
                subtitle="Temporal split, served model"
              />
              <DataTable
                caption="Model version comparison"
                compact
                rows={[
                  {
                    v: `v${card?.previous_version?.version}`,
                    features: card?.previous_version?.features,
                    r: prev.metrics,
                  },
                  { v: `v${card?.version}`, features: card?.features, r: m },
                ]}
                rowKey={x => x.v}
                columns={[
                  { key: 'v', header: 'Version', render: x => x.v },
                  {
                    key: 'f',
                    header: 'Inputs',
                    render: x => [...(x.features?.categorical ?? []), ...(x.features?.numeric ?? [])].length,
                  },
                  { key: 'mae', header: 'MAE', align: 'right', render: x => formatCount(x.r.mae) },
                  { key: 'rmse', header: 'RMSE', align: 'right', render: x => formatCount(x.r.rmse) },
                  { key: 'r2', header: 'R²', align: 'right', render: x => formatNumber(x.r.r2, 4) },
                  { key: 'mape', header: 'MAPE', align: 'right', render: x => formatPercent(x.r.mape) },
                ]}
              />
              <p className={s.small}>
                v{card?.version} drops total_days, a synthetic per-crop constant plus noise that re-encoded the crop.
              </p>
            </Card>
          </div>
        )}

        <div className={s.s6}>
          <Card>
            <CardHeader
              title="Features and provenance"
              subtitle="Which columns the model uses, and where they come from"
              actions={<ProvenanceLegend />}
            />
            {card ? (
              <ul className={s.list}>
                {[...card.features.categorical, ...card.features.numeric].map(f => (
                  <li key={f} className={s.between}>
                    <span>
                      <strong>{byColumn.get(f)?.label ?? f}</strong>{' '}
                      <span className={s.small}>{byColumn.get(f)?.origin}</span>
                    </span>
                    <ProvenanceBadge entry={byColumn.get(f)} />
                  </li>
                ))}
                {card.excluded_features.map(f => (
                  <li key={f.feature} className={`${s.between} ${x.dim}`}>
                    <span>
                      <s>{byColumn.get(f.feature)?.label ?? f.feature}</s> <span className={s.small}>{f.reason}</span>
                    </span>
                    <ProvenanceBadge entry={byColumn.get(f.feature)} />
                  </li>
                ))}
              </ul>
            ) : (
              <Skeleton height={200} />
            )}
          </Card>
        </div>

        <div className={s.s6}>
          <Card>
            <CardHeader
              title="Permutation importance"
              subtitle="Temporal split · drop in R² when a column is shuffled"
            />
            {card ? (
              <DataTable
                caption="Permutation importance"
                compact
                rows={card.permutation_importance}
                rowKey={r => r.feature}
                columns={[
                  { key: 'f', header: 'Column', render: r => byColumn.get(r.feature)?.label ?? r.feature },
                  {
                    key: 'i',
                    header: 'Importance',
                    align: 'right',
                    render: r => `${formatNumber(r.importance, 4)} ± ${formatNumber(r.std, 4)}`,
                    sortValue: r => r.importance,
                  },
                  {
                    key: 'k',
                    header: 'Kept',
                    render: r => <Badge tone={r.kept ? 'success' : 'neutral'}>{r.kept ? 'Kept' : 'Dropped'}</Badge>,
                  },
                ]}
              />
            ) : (
              <Skeleton height={200} />
            )}
          </Card>
        </div>

        <div className={s.s6}>
          <Card>
            <CardHeader title="Model card" subtitle="Intended use and limitations" />
            {card ? (
              <div className={s.stack}>
                <p className={x.m0}>{card.intended_use}</p>
                <dl className={s.dl}>
                  <dt>Training data</dt>
                  <dd>
                    {formatCount(card.data.rows)} records · {card.data.crops} crops · {card.data.regions} regions ·{' '}
                    {card.data.years[0]}–{card.data.years[1]}
                  </dd>
                </dl>
                <ul className={s.list}>
                  {card.limitations.map(l => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <Skeleton height={160} />
            )}
          </Card>
        </div>

        <div className={s.s6}>
          <Card>
            <CardHeader title="How to read these metrics" />
            <ul className={s.list}>
              <li>
                <strong>Temporal</strong> is the primary split: train on 1990–2008, test on 2009–2013, like forecasting
                a future season.
              </li>
              <li>
                <strong>Unseen regions</strong> holds out 20% of countries entirely; it shows how the model does on a
                country it has never seen.
              </li>
              <li>
                <strong>RMSE / MAE</strong> are errors in kg/ha; <strong>MAPE</strong> is the average error as a share
                of the true yield.
              </li>
              <li>
                <strong>p50 / p95</strong> are single-prediction latencies <Timer size={12} aria-hidden="true" />.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
