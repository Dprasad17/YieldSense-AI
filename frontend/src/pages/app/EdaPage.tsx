import { useMemo } from 'react';
import { BandCurveChart, BarCompareChart, ChartCard, RankBarChart, ScatterFitChart } from '../../components/charts';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../../components/ui';
import { ErrorState } from '../../components/ui/States';
import { contextQuery, useEdaCharts, useEdaMetrics } from '../../hooks/queries';
import { formatCount, formatIndex, formatRainfall, formatYield, formatYieldWithUnit } from '../../lib/format';
import { selectCropRanking, selectYieldStats } from '../../lib/selectors';
import { useGlobalFilters } from '../../store/filters';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';

export function EdaPage() {
  const { unit } = usePreferences();
  const { filters } = useGlobalFilters();
  const eda = useEdaMetrics();
  const charts = useEdaCharts(contextQuery(filters));
  const c = charts.data;

  const ranking = useMemo(() => selectCropRanking(eda.data?.crop_breakdown), [eda.data]);
  const stats = selectYieldStats(eda.data);
  const scope = c?.scope ?? `${filters.region || 'All regions'} · ${filters.crop || 'All crops'}`;

  const hist = useMemo(
    () =>
      c ? c.yield_histogram.map(b => ({ label: String(Math.round(b.start)), value: b.count, start: b.start })) : [],
    [c],
  );
  const binLabel = (v: number) => {
    const b = hist.reduce(
      (best, h) => (Math.abs(h.start - v) < Math.abs(best.start - v) ? h : best),
      hist[0] ?? { start: 0, label: '0' },
    );
    return b.label;
  };
  const phCurve = useMemo(
    () => (c ? c.ph_bins.map(b => ({ x: (b.start + b.end) / 2, y: b.mean_yield_kg_ha })) : []),
    [c],
  );
  const phPeak = phCurve.length ? phCurve.reduce((a, b) => (b.y > a.y ? b : a)) : null;
  const band =
    c?.ph_optimal_low != null && c?.ph_optimal_high != null
      ? { from: c.ph_optimal_low, to: c.ph_optimal_high, label: 'Optimal' }
      : undefined;
  const skew = c ? c.yield_mean_kg_ha / (c.yield_median_kg_ha || 1) : null;
  // Null when rainfall has a single value in this context (it is constant per country).
  const reg = c?.rainfall_regression;
  const fit = reg && reg.r != null && reg.r2 != null ? { r: reg.r, r2: reg.r2 } : null;
  const rainfallFlat =
    'Rainfall is a single long-term value per country, so within this selection there is no rainfall–yield relationship to fit. Choose all regions to compare countries.';

  if (eda.isError) return <ErrorState error={eda.error} onRetry={() => eda.refetch()} />;

  return (
    <div className={s.page}>
      <PageHeader
        title="Exploratory data analysis"
        description="Distributions, crop rankings and the relationship between conditions and yield."
        meta={
          <>
            <Badge tone="info">{scope}</Badge>
            {c && <Badge>{formatCount(c.record_count)} records</Badge>}
            {stats && <Badge>Global median {formatYieldWithUnit(stats.median, unit)}</Badge>}
          </>
        }
      />

      <section aria-label="Mean yield by crop">
        {ranking.length ? (
          <div className={s.scrollX}>
            {ranking.map(r => (
              <Card key={r.crop}>
                <div className={s.small}>{r.crop}</div>
                <div
                  className={s.num}
                  style={{
                    fontSize: 'var(--text-xl)',
                    fontWeight: 'var(--weight-semibold)',
                    margin: 'var(--space-1) 0',
                  }}
                >
                  {formatYield(r.avgYield, unit)} <span className={s.small}>{unit}</span>
                </div>
                <div className={s.small}>{formatCount(r.count)} records</div>
              </Card>
            ))}
          </div>
        ) : (
          <Skeleton height={96} />
        )}
      </section>

      {charts.isError && <ErrorState error={charts.error} onRetry={() => charts.refetch()} />}

      {c?.record_count === 0 ? (
        <Card>
          <EmptyState
            title="No records for this context"
            description={`The dataset has no records for ${c.scope}. Choose another region, crop or year in the context bar.`}
          />
        </Card>
      ) : (
        <div className={`${s.grid} ${s.stretch}`}>
          <div className={s.s6}>
            <ChartCard
              title="Yield distribution"
              subtitle={`Records per yield bin · ${scope}`}
              summary={
                c
                  ? `Median ${formatYieldWithUnit(c.yield_median_kg_ha, unit)}, mean ${formatYieldWithUnit(c.yield_mean_kg_ha, unit)}.`
                  : 'Loading.'
              }
              insight={
                c && skew
                  ? skew > 1.15
                    ? `Right-skewed: the mean is ${skew.toFixed(1)}× the median, pulled up by a few very high yields. The median is the better “typical” value.`
                    : 'Mean and median are close, so yields are roughly symmetric.'
                  : undefined
              }
              legend={[
                { label: 'Records per bin', color: 'data-vegetation' },
                { label: 'Median', color: 'info' },
                { label: 'Mean', color: 'warning' },
              ]}
            >
              {(col, h) =>
                c && hist.length ? (
                  <BarCompareChart
                    data={hist}
                    colors={col}
                    height={h}
                    fx={v => formatYield(Number(v), unit)}
                    fy={v => formatCount(v)}
                    refLines={[
                      { x: binLabel(c.yield_median_kg_ha), label: 'Median', color: col.info },
                      { x: binLabel(c.yield_mean_kg_ha), label: 'Mean', color: col.warning },
                    ]}
                  />
                ) : (
                  <Skeleton height={h} />
                )
              }
            </ChartCard>
          </div>

          <div className={s.s6}>
            <ChartCard
              title="Average productivity by crop"
              subtitle={`All ${ranking.length || '—'} crops sorted by mean yield · all records`}
              summary={ranking[0] ? `${ranking[0].crop} ranks first.` : 'Loading.'}
              insight={
                ranking[0]
                  ? `Top: ${ranking[0].crop} at ${formatYieldWithUnit(ranking[0].avgYield, unit)}; lowest: ${ranking[ranking.length - 1].crop} at ${formatYieldWithUnit(ranking[ranking.length - 1].avgYield, unit)}.`
                  : undefined
              }
            >
              {(col, h) =>
                ranking.length ? (
                  <RankBarChart
                    data={ranking.map(r => ({ label: r.crop, value: r.avgYield }))}
                    colors={col}
                    height={h}
                    fy={v => formatYield(v, unit)}
                    benchmark={stats?.mean}
                    benchmarkLabel="Mean"
                  />
                ) : (
                  <Skeleton height={h} />
                )
              }
            </ChartCard>
          </div>

          <div className={s.s6}>
            <ChartCard
              title="Rainfall vs yield"
              subtitle={
                c
                  ? `${formatCount(c.rainfall_vs_yield.length)} sampled points shown · fit and r over all ${formatCount(c.record_count)} records`
                  : undefined
              }
              summary={!c ? 'Loading.' : fit ? `Correlation r = ${fit.r.toFixed(2)}.` : rainfallFlat}
              insight={
                !c
                  ? undefined
                  : fit
                    ? `Across these records, rainfall accounts for ${(fit.r2 * 100).toFixed(1)}% of yield variance (r = ${fit.r.toFixed(2)}, R² = ${fit.r2.toFixed(2)}). Rainfall is one value per country, so this is a cross-country association.`
                    : rainfallFlat
              }
              actions={
                c ? (
                  <Badge tone={fit ? 'model' : 'neutral'}>{fit ? `R² ${fit.r2.toFixed(2)}` : 'No fit'}</Badge>
                ) : undefined
              }
            >
              {(col, h) =>
                c ? (
                  <ScatterFitChart
                    points={c.rainfall_vs_yield}
                    colors={col}
                    height={h}
                    fx={v => formatRainfall(v)}
                    fy={v => formatYield(v, unit)}
                    xLabel="Rainfall"
                    yLabel={`Yield (${unit})`}
                  />
                ) : (
                  <Skeleton height={h} />
                )
              }
            </ChartCard>
          </div>

          <div className={s.s6}>
            <ChartCard
              title="Soil pH vs yield"
              subtitle="Mean yield per 0.25 pH bin (bins with 5+ records)"
              summary={phPeak ? `Highest mean yield around pH ${formatIndex(phPeak.x)}.` : 'Loading.'}
              insight={
                phPeak
                  ? `Yield peaks near pH ${formatIndex(phPeak.x)}${band ? `; the optimal band for ${filters.crop} is ${formatIndex(band.from)}–${formatIndex(band.to)}` : '. Pick a crop to shade its optimal band'}.`
                  : undefined
              }
            >
              {(col, h) =>
                phCurve.length ? (
                  <BandCurveChart
                    data={phCurve}
                    colors={col}
                    height={h}
                    fx={v => formatIndex(v)}
                    fy={v => formatYield(v, unit)}
                    band={band}
                    name={`Mean yield (${unit})`}
                  />
                ) : (
                  <Skeleton height={h} />
                )
              }
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}
