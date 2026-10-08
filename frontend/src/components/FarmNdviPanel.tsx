import { Satellite } from 'lucide-react';
import { useState } from 'react';
import { useFarmNdvi } from '../hooks/queries';
import { formatDeltaPercent, formatNumber } from '../lib/format';
import { ChartCard, MultiLineChart } from './charts';
import { Badge, Banner, Button, Card, CardHeader, EmptyState, Skeleton } from './ui';

const STATUS = {
  good: { tone: 'success', label: 'Healthy' },
  watch: { tone: 'warning', label: 'Watch' },
  alert: { tone: 'danger', label: 'Below normal' },
  unknown: { tone: 'neutral', label: 'Not enough images' },
} as const;

/** Satellite vegetation index (MODIS NDVI) at the farm, this year vs last year. Loaded on request:
 * the NASA service takes up to a minute the first time. */
export function FarmNdviPanel({ farmId }: { farmId: number }) {
  const [requested, setRequested] = useState(false);
  const q = useFarmNdvi(farmId, requested);
  const d = q.data;

  if (!requested) {
    return (
      <Card>
        <CardHeader title="Satellite crop health" subtitle="NASA MODIS vegetation index (NDVI) at this farm" />
        <EmptyState
          icon={Satellite}
          title="See how green your field is from space"
          description="Compares the last 12 months of satellite images with the same months last year. The first load takes up to a minute."
          action={<Button onClick={() => setRequested(true)}>Load satellite data</Button>}
        />
      </Card>
    );
  }
  if (q.isLoading) {
    return (
      <Card>
        <CardHeader
          title="Satellite crop health"
          subtitle="Fetching images from NASA MODIS… this can take up to a minute the first time."
        />
        <Skeleton height={220} />
      </Card>
    );
  }
  if (q.isError || !d) {
    return (
      <Card>
        <CardHeader title="Satellite crop health" />
        <Banner
          tone="warning"
          action={
            <Button variant="secondary" onClick={() => q.refetch()}>
              Try again
            </Button>
          }
        >
          {(q.error as Error)?.message ?? 'Satellite data is unavailable right now.'}
        </Banner>
      </Card>
    );
  }
  const status = STATUS[d.status];
  const rows = d.points.map(p => ({
    x: p.date,
    ndvi: p.ndvi ?? Number.NaN,
    last: p.ndvi_last_year ?? Number.NaN,
  }));
  return (
    <ChartCard
      title="Satellite crop health"
      subtitle={`${d.source} · ${d.location_basis}`}
      info={d.note}
      height={240}
      legend={[
        { label: 'Last 12 months', color: 'data-vegetation' },
        { label: 'Same period last year', color: 'muted' },
      ]}
      insight={
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone={status.tone}>{status.label}</Badge>
          {d.latest?.ndvi != null && (
            <span>
              Latest NDVI {formatNumber(d.latest.ndvi as number, 2)} ({String(d.latest.date)})
            </span>
          )}
          {d.change_vs_last_year_pct != null && (
            <span>· {formatDeltaPercent(d.change_vs_last_year_pct)} vs last year</span>
          )}
          <span>· {d.message}</span>
        </span>
      }
      summary={`NDVI over ${d.points.length} satellite images. ${d.message}`}
    >
      {colors => (
        <MultiLineChart
          data={rows}
          colors={colors}
          height={240}
          fx={v => new Date(String(v)).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
          fy={v => formatNumber(Number(v), 2)}
          series={[
            { key: 'ndvi', label: 'NDVI', color: colors['data-vegetation'] },
            { key: 'last', label: 'NDVI last year', color: colors.muted },
          ]}
        />
      )}
    </ChartCard>
  );
}
