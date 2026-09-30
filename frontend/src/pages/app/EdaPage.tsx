import { useMemo } from 'react';
import { BandCurveChart, BarCompareChart, ChartCard, RankBarChart, ScatterFitChart } from '../../components/charts';
import { regression } from '../../components/charts/regression';
import { Badge, Card, PageHeader, Skeleton } from '../../components/ui';
import { ErrorState } from '../../components/ui/States';
import { useEdaMetrics, useRecordSample, useSoil } from '../../hooks/queries';
import { formatCount, formatIndex, formatRainfall, formatYield, formatYieldWithUnit } from '../../lib/format';
import { selectCropRanking, selectYieldStats } from '../../lib/selectors';
import { useGlobalFilters } from '../../store/filters';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';

function parseRange(text?: string): [number, number] | null {
  const m = text?.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function EdaPage() {
  const { unit } = usePreferences();
  const { filters } = useGlobalFilters();
  const eda = useEdaMetrics();
  const sample = useRecordSample({ crop: filters.crop, region: filters.region });
  const soil = useSoil(filters.crop || 'Wheat');
  const band = filters.crop ? parseRange(soil.data?.soil_metrics?.optimal_pH_range as string | undefined) : null;

  const ranking = useMemo(() => selectCropRanking(eda.data?.crop_breakdown), [eda.data]);
  const stats = selectYieldStats(eda.data);
  const rows = useMemo(() => sample.data?.rows ?? [], [sample.data]);

  const hist = useMemo(() => {
    if (!rows.length) return [];
    const ys = rows.map(r => r.yield_kg_per_hectare).sort((a, b) => a - b);
    const cap = ys[Math.floor(ys.length * 0.98)] || ys[ys.length - 1];
    const bins = 16;
    const width = Math.max(1, cap / bins);
    const counts = Array.from({ length: bins }, () => 0);
    for (const y of ys) counts[Math.min(bins - 1, Math.floor(y / width))]++;
    return counts.map((n, i) => ({ label: String(Math.round(i * width)), value: n, start: i * width }));
  }, [rows]);
  const binLabel = (v: number) => {
    const b = hist.reduce(
      (best, h) => (Math.abs(h.start - v) < Math.abs(best.start - v) ? h : best),
      hist[0] ?? { start: 0, label: '0' },
    );
    return b.label;
  };

  const scatter = useMemo(() => rows.map(r => ({ x: r.rainfall_mm, y: r.yield_kg_per_hectare })), [rows]);
  const fit = regression(scatter);

  const phCurve = useMemo(() => {
    const bins = new Map<number, { sum: number; n: number }>();
    for (const r of rows) {
      const k = Math.round(r.soil_pH * 4) / 4;
      const b = bins.get(k) ?? { sum: 0, n: 0 };
      b.sum += r.yield_kg_per_hectare;
      b.n++;
      bins.set(k, b);
    }
    return [...bins.entries()]
      .filter(([, b]) => b.n >= 5)
      .map(([x, b]) => ({ x, y: b.sum / b.n }))
      .sort((a, b) => a.x - b.x);
  }, [rows]);
  const phPeak = phCurve.length ? phCurve.reduce((a, b) => (b.y > a.y ? b : a)) : null;

  const sampleNote = sample.data
    ? `Sample of ${formatCount(rows.length)} records spread across ${formatCount(sample.data.total)}`
    : 'Loading sample…';
  const scope = `${filters.region || 'All regions'} · ${filters.crop || 'All crops'}`;

  if (eda.isError) return <ErrorState error={eda.error} onRetry={() => eda.refetch()} />;

  return (
    <div className={s.page}>
      <PageHeader
        title="Exploratory data analysis"
        description="Distributions, crop rankings and the relationship between conditions and yield."
        meta={
          <>
            <Badge tone="info">{formatCount(eda.data?.total_records)} records</Badge>
            {stats && <Badge>Mean {formatYieldWithUnit(stats.mean, unit)}</Badge>}
            {stats && <Badge>Median {formatYieldWithUnit(stats.median, unit)}</Badge>}
          </>
        }
      />

      <section aria-label="Mean yield by crop">
        {ranking.length ? (
          <div className={s.scrollX}>
            {ranking.map(c => (
              <Card key={c.crop}>
                <div className={s.small}>{c.crop}</div>
                <div
                  className={s.num}
                  style={{
                    fontSize: 'var(--text-xl)',
                    fontWeight: 'var(--weight-semibold)',
                    margin: 'var(--space-1) 0',
                  }}
                >
                  {formatYield(c.avgYield, unit)} <span className={s.small}>{unit}</span>
                </div>
                <div className={s.small}>{formatCount(c.count)} records</div>
              </Card>
            ))}
          </div>
        ) : (
          <Skeleton height={96} />
        )}
      </section>

      <div className={`${s.grid} ${s.stretch}`}>
        <div className={s.s6}>
          <ChartCard
            title="Yield distribution"
            subtitle={`${sampleNote} · ${scope}. Top 2% trimmed for readability`}
            summary={
              stats
                ? `Median ${formatYieldWithUnit(stats.median, unit)}, mean ${formatYieldWithUnit(stats.mean, unit)}.`
                : 'Loading.'
            }
            insight={
              stats
                ? stats.isRightSkewed
                  ? `Right-skewed: the mean (${formatYieldWithUnit(stats.mean, unit)}) is ${stats.meanToMedian.toFixed(1)}× the median, pulled up by high-yield root crops. The median is the better “typical” value.`
                  : 'Mean and median are close, so yields are roughly symmetric.'
                : undefined
            }
            legend={[
              { label: 'Records per bin', color: 'data-vegetation' },
              { label: 'Median (all records)', color: 'info' },
              { label: 'Mean (all records)', color: 'warning' },
            ]}
          >
            {(c, h) =>
              hist.length && stats ? (
                <BarCompareChart
                  data={hist}
                  colors={c}
                  height={h}
                  fx={v => formatYield(Number(v), unit)}
                  fy={v => formatCount(v)}
                  refLines={[
                    { x: binLabel(stats.median), label: 'Median', color: c.info },
                    { x: binLabel(stats.mean), label: 'Mean', color: c.warning },
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
            subtitle={`All ${ranking.length || '—'} crops, sorted by mean yield · all records`}
            summary={ranking[0] ? `${ranking[0].crop} ranks first.` : 'Loading.'}
            insight={
              ranking[0]
                ? `Top: ${ranking[0].crop} at ${formatYieldWithUnit(ranking[0].avgYield, unit)}; lowest: ${ranking[ranking.length - 1].crop} at ${formatYieldWithUnit(ranking[ranking.length - 1].avgYield, unit)}.`
                : undefined
            }
          >
            {(c, h) =>
              ranking.length ? (
                <RankBarChart
                  data={ranking.map(r => ({ label: r.crop, value: r.avgYield }))}
                  colors={c}
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
            subtitle={`${sampleNote} · least-squares fit`}
            summary={fit ? `Correlation r = ${fit.r.toFixed(2)}.` : 'Loading.'}
            insight={
              fit
                ? `Rainfall explains ${(fit.r2 * 100).toFixed(1)}% of yield variance in this sample (r = ${fit.r.toFixed(2)}, R² = ${fit.r2.toFixed(2)}).`
                : undefined
            }
            actions={fit ? <Badge tone="model">R² {fit.r2.toFixed(2)}</Badge> : undefined}
          >
            {(c, h) =>
              scatter.length ? (
                <ScatterFitChart
                  points={scatter}
                  colors={c}
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
            subtitle={`Mean yield per 0.25 pH bin (5+ records) · ${sampleNote}`}
            summary={phPeak ? `Highest mean yield around pH ${formatIndex(phPeak.x)}.` : 'Loading.'}
            insight={
              phPeak
                ? `Yield peaks near pH ${formatIndex(phPeak.x)} in this sample${band ? `; the optimal range for ${filters.crop} is ${band[0]}–${band[1]}` : '. Pick a crop to shade its optimal range'}.`
                : undefined
            }
          >
            {(c, h) =>
              phCurve.length ? (
                <BandCurveChart
                  data={phCurve}
                  colors={c}
                  height={h}
                  fx={v => formatIndex(v)}
                  fy={v => formatYield(v, unit)}
                  band={band ? { from: band[0], to: band[1], label: 'Optimal' } : undefined}
                  name={`Mean yield (${unit})`}
                />
              ) : (
                <Skeleton height={h} />
              )
            }
          </ChartCard>
        </div>
      </div>
      {sample.isError && <ErrorState error={sample.error} onRetry={() => sample.refetch()} />}
    </div>
  );
}
