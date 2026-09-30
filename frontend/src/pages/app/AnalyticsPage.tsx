import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Download, Printer, TrendingUp } from 'lucide-react';
import { errorMessage } from '../../api/client';
import type { FarmComparison } from '../../api/types';
import { ChartCard, TrendChart, type TrendPoint } from '../../components/charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Drawer,
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  PageHeader,
  SegmentedControl,
  Skeleton,
  StatCard,
  type Column,
} from '../../components/ui';
import { ratingTone, sortRows } from '../../components/ui/helpers';
import { ErrorState } from '../../components/ui/States';
import { contextQuery, useFarmComparison, useReportExport, useSeasonalTrends } from '../../hooks/queries';
import {
  formatCount,
  formatDeltaPercent,
  formatIndex,
  formatPercent,
  formatYield,
  formatYieldWithUnit,
} from '../../lib/format';
import { useGlobalFilters } from '../../store/filters';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';

type Farm = FarmComparison['farms'][number];
type Sort = 'yield_desc' | 'yield_asc';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AnalyticsPage() {
  const { unit } = usePreferences();
  const { filters } = useGlobalFilters();
  const ctx = contextQuery(filters);
  const [order, setOrder] = useState<Sort>('yield_desc');
  const trends = useSeasonalTrends(ctx);
  const farmsQ = useFarmComparison({ ...ctx, limit: 25, sort: order });
  const exportM = useReportExport();
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [selected, setSelected] = useState<Farm | null>(null);

  const series = useMemo(() => trends.data?.series ?? [], [trends.data]);
  const forecast = trends.data?.forecast;
  const first = series[0];
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const years = first && last ? last.year - first.year : 0;
  const cagr =
    first && last && years > 0 ? (Math.pow(last.mean_yield_kg_ha / first.mean_yield_kg_ha, 1 / years) - 1) * 100 : null;
  const yoy = last && prev ? ((last.mean_yield_kg_ha - prev.mean_yield_kg_ha) / prev.mean_yield_kg_ha) * 100 : null;

  const chart: TrendPoint[] = [
    ...series.map(p => ({
      x: p.year,
      actual: p.mean_yield_kg_ha,
      forecast: forecast && p === last ? p.mean_yield_kg_ha : undefined,
    })),
    ...(forecast
      ? [
          {
            x: forecast.year,
            forecast: forecast.mean_kg_ha,
            band: [forecast.p10_kg_ha, forecast.p90_kg_ha] as [number, number],
          },
        ]
      : []),
  ];

  const farms = farmsQ.data?.farms ?? [];
  const riskOrder: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  const riskiest = farms.length
    ? [...farms].sort(
        (a, b) => riskOrder[b.risk_rating] - riskOrder[a.risk_rating] || a.soil_health_index - b.soil_health_index,
      )[0]
    : null;

  const columns: Column<Farm>[] = [
    {
      key: 'id',
      header: 'Record',
      render: f => <strong className={s.num}>{f.farm_id}</strong>,
      sortValue: f => f.farm_id,
      sticky: true,
    },
    { key: 'region', header: 'Region', render: f => f.region, sortValue: f => f.region },
    {
      key: 'crop',
      header: 'Crop',
      render: f => <Badge tone="success">{f.crop_type}</Badge>,
      sortValue: f => f.crop_type,
    },
    { key: 'year', header: 'Year', align: 'right', render: f => f.year, sortValue: f => f.year },
    {
      key: 'yield',
      header: `Yield (${unit})`,
      align: 'right',
      render: f => formatYield(f.yield_kg_ha, unit),
      sortValue: f => f.yield_kg_ha,
    },
    {
      key: 'health',
      header: 'Soil health',
      align: 'right',
      render: f => formatIndex(f.soil_health_index),
      sortValue: f => f.soil_health_index,
    },
    { key: 'ph', header: 'Soil pH', align: 'right', render: f => formatIndex(f.soil_pH), sortValue: f => f.soil_pH },
    {
      key: 'moist',
      header: 'Moisture (%)',
      align: 'right',
      render: f => formatPercent(f.soil_moisture_percent).replace('%', ''),
      sortValue: f => f.soil_moisture_percent,
    },
    {
      key: 'risk',
      header: 'Risk',
      render: f => (
        <Badge tone={ratingTone(f.risk_rating, false)} title={f.risk_flags.join(', ') || 'No flags'}>
          {f.risk_rating}
        </Badge>
      ),
      sortValue: f => riskOrder[f.risk_rating],
    },
  ];

  const doExport = async (format: 'csv' | 'xlsx') => {
    try {
      const { blob, filename } = await exportM.mutateAsync({
        format,
        crop_type: ctx.crop ?? null,
        region: ctx.region ?? null,
      });
      download(blob, filename ?? `yieldsense-report.${format}`);
      toast.success('Export downloaded');
    } catch (err) {
      toast.error(`Export failed: ${errorMessage(err)}`);
    }
  };

  return (
    <div className={s.page}>
      <PageHeader
        title="Analytics & Reports"
        description="Yield by year with the model’s expectation, and the best and worst records for your context."
        meta={
          <Badge tone="info">
            {trends.data?.scope ?? `${filters.region || 'All regions'} · ${filters.crop || 'All crops'}`}
          </Badge>
        }
        actions={
          <>
            <Button
              icon={Printer}
              onClick={() => window.open(`/report/productivity${window.location.search}`, '_blank', 'noopener')}
            >
              Print report
            </Button>
            <div className={s.row} style={{ gap: 0 }}>
              <Button
                variant="primary"
                icon={Download}
                onClick={() => doExport('csv')}
                loading={exportM.isPending}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              >
                Export CSV
              </Button>
              <DropdownMenu>
                <DropdownTrigger asChild>
                  <Button
                    variant="primary"
                    aria-label="More export formats"
                    style={{
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      borderLeft: '1px solid var(--primary-hover)',
                      padding: '0 var(--space-2)',
                    }}
                  >
                    <ChevronDown size={16} aria-hidden="true" />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownItem onSelect={() => doExport('csv')}>CSV (filtered records)</DropdownItem>
                  <DropdownItem onSelect={() => doExport('xlsx')}>Excel (filtered records)</DropdownItem>
                </DropdownContent>
              </DropdownMenu>
            </div>
          </>
        }
      />

      <div className={s.kpis}>
        <StatCard
          label="Latest year"
          value={last ? formatYield(last.mean_yield_kg_ha, unit) : '—'}
          unit={unit}
          subtitle={last ? `${last.year} mean · ${formatCount(last.record_count)} records` : undefined}
          icon={TrendingUp}
          accent="var(--data-vegetation)"
        />
        <StatCard
          label="Year over year"
          value={yoy != null ? formatDeltaPercent(yoy) : '—'}
          subtitle={last && prev ? `${prev.year} → ${last.year}` : undefined}
        />
        <StatCard
          label="Growth per year"
          value={cagr != null ? formatDeltaPercent(cagr) : '—'}
          subtitle={first && last ? `CAGR ${first.year}–${last.year}` : undefined}
        />
        <StatCard
          label="Highest risk record"
          value={riskiest?.farm_id ?? '—'}
          subtitle={riskiest ? `${riskiest.risk_rating} · ${riskiest.risk_flags.join(', ') || 'no flags'}` : undefined}
        />
      </div>

      {trends.isError ? (
        <ErrorState error={trends.error} onRetry={() => trends.refetch()} />
      ) : (
        <ChartCard
          title={first && last ? `Yield by year (${first.year}–${last.year})` : 'Yield by year'}
          subtitle="Mean yield per sowing year; the dashed point is the model’s expectation under the latest year’s conditions, with a P10–P90 band"
          info={forecast?.method}
          summary={
            first && last
              ? `Mean yield moved from ${formatYieldWithUnit(first.mean_yield_kg_ha, unit)} in ${first.year} to ${formatYieldWithUnit(last.mean_yield_kg_ha, unit)} in ${last.year}.`
              : 'Loading.'
          }
          insight={
            forecast
              ? `Model expectation ${formatYieldWithUnit(forecast.mean_kg_ha, unit)} (P10–P90 ${formatYield(forecast.p10_kg_ha, unit)}–${formatYield(forecast.p90_kg_ha, unit)}).${trends.data?.missing_years.length ? ` No records for ${trends.data.missing_years.join(', ')}.` : ''}`
              : undefined
          }
          actions={cagr != null ? <Badge tone="model">CAGR {formatDeltaPercent(cagr)}</Badge> : undefined}
          legend={[
            { label: 'Actual', color: 'data-vegetation' },
            { label: 'Model expectation', color: 'data-model' },
          ]}
          height={320}
        >
          {(c, h) =>
            series.length ? (
              <TrendChart
                data={chart}
                colors={c}
                height={h}
                fx={v => String(v)}
                fy={v => formatYield(v, unit)}
                forecastLabel="Model expectation"
              />
            ) : (
              <Skeleton height={h} />
            )
          }
        </ChartCard>
      )}

      <Card>
        <CardHeader
          title={order === 'yield_desc' ? 'Top records by yield' : 'Lowest records by yield'}
          subtitle={
            farmsQ.data
              ? `${farmsQ.data.scope} · context mean ${formatYieldWithUnit(farmsQ.data.mean_yield_kg_ha, unit)} · select a row for details`
              : undefined
          }
          info={farmsQ.data?.risk_method}
          actions={
            <SegmentedControl<Sort>
              label="Order"
              value={order}
              onChange={setOrder}
              options={[
                { value: 'yield_desc', label: 'Top' },
                { value: 'yield_asc', label: 'Bottom' },
              ]}
            />
          }
        />
        {farmsQ.isError ? (
          <ErrorState error={farmsQ.error} onRetry={() => farmsQ.refetch()} />
        ) : farmsQ.isPending ? (
          <Skeleton height={260} />
        ) : (
          <DataTable
            caption="Record comparison"
            columns={columns}
            rows={sortRows(farms, columns, sort)}
            rowKey={f => f.farm_id}
            sort={sort}
            onSortChange={setSort}
            onRowClick={setSelected}
            maxHeight={520}
          />
        )}
      </Card>

      <Drawer
        open={!!selected}
        onOpenChange={v => !v && setSelected(null)}
        title={selected ? `Record ${selected.farm_id}` : ''}
      >
        {selected && (
          <dl className={s.dl}>
            <dt>Region</dt>
            <dd>{selected.region}</dd>
            <dt>Crop</dt>
            <dd>{selected.crop_type}</dd>
            <dt>Year</dt>
            <dd>{selected.year}</dd>
            <dt>Yield</dt>
            <dd>{formatYieldWithUnit(selected.yield_kg_ha, unit)}</dd>
            <dt>Soil health index</dt>
            <dd>{formatIndex(selected.soil_health_index)}</dd>
            <dt>Soil pH</dt>
            <dd>{formatIndex(selected.soil_pH)}</dd>
            <dt>Soil moisture</dt>
            <dd>{formatPercent(selected.soil_moisture_percent)}</dd>
            <dt>NDVI</dt>
            <dd>{formatIndex(selected.ndvi)}</dd>
            <dt>Risk</dt>
            <dd>
              <Badge tone={ratingTone(selected.risk_rating, false)}>{selected.risk_rating}</Badge>
            </dd>
            <dt>Risk flags</dt>
            <dd>{selected.risk_flags.join(', ') || 'None'}</dd>
          </dl>
        )}
      </Drawer>
    </div>
  );
}
