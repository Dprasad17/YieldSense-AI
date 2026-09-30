import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Download, TrendingUp } from 'lucide-react';
import { errorMessage } from '../../api/client';
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
  FormField,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  type Column,
} from '../../components/ui';
import { ratingTone, sortRows } from '../../components/ui/helpers';
import { ErrorState, SampleDataPill } from '../../components/ui/States';
import { useFarmComparison, useReportExport, useSeasonalTrends } from '../../hooks/queries';
import { formatDeltaPercent, formatIndex, formatPercent, formatYield, formatYieldWithUnit } from '../../lib/format';
import { useGlobalFilters } from '../../store/filters';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';

// Crops the seasonal-trends endpoint has specific figures for; others fall back to all crops.
const TREND_CROPS = ['Rice', 'Maize', 'Cotton', 'Wheat', 'Soybean'];

interface Farm {
  sector_id: string;
  name: string;
  hectares: number;
  crop_type: string;
  avg_yield_kg_ha: number;
  soil_health_index: number;
  soil_pH: number;
  moisture_percent: number;
  risk_rating: string;
  ndvi_index: number;
}

export function AnalyticsPage() {
  const { unit } = usePreferences();
  const { filters, setFilters } = useGlobalFilters();
  const trendCrop = TREND_CROPS.includes(filters.crop) ? filters.crop : '';
  const trends = useSeasonalTrends(trendCrop);
  const farmsQ = useFarmComparison();
  const exportM = useReportExport();
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'yield', dir: 'desc' });
  const [selected, setSelected] = useState<Farm | null>(null);

  const series = useMemo(
    () => (trends.data?.yearly_trends ?? []) as { year: number; avg_yield_kg_ha: number; is_projection?: boolean }[],
    [trends.data],
  );
  const actual = series.filter(p => !p.is_projection);
  const projection = series.find(p => p.is_projection);
  const first = actual[0];
  const last = actual[actual.length - 1];
  const prev = actual[actual.length - 2];
  const years = first && last ? last.year - first.year : 0;
  const cagr =
    first && last && years > 0 ? (Math.pow(last.avg_yield_kg_ha / first.avg_yield_kg_ha, 1 / years) - 1) * 100 : null;
  const yoy = last && prev ? ((last.avg_yield_kg_ha - prev.avg_yield_kg_ha) / prev.avg_yield_kg_ha) * 100 : null;

  const chart: TrendPoint[] = series.map(p =>
    p.is_projection
      ? { x: p.year, forecast: p.avg_yield_kg_ha }
      : { x: p.year, actual: p.avg_yield_kg_ha, forecast: p === last && projection ? p.avg_yield_kg_ha : undefined },
  );

  const farms = (farmsQ.data?.farm_comparisons ?? []) as Farm[];
  const best = farms.length ? [...farms].sort((a, b) => b.avg_yield_kg_ha - a.avg_yield_kg_ha)[0] : null;
  const riskOrder = { high: 3, medium: 2, low: 1 } as Record<string, number>;
  const riskiest = farms.length
    ? [...farms].sort(
        (a, b) =>
          (riskOrder[b.risk_rating.toLowerCase()] ?? 0) - (riskOrder[a.risk_rating.toLowerCase()] ?? 0) ||
          a.soil_health_index - b.soil_health_index,
      )[0]
    : null;

  const columns: Column<Farm>[] = [
    {
      key: 'id',
      header: 'Sector',
      render: f => <strong>{f.sector_id}</strong>,
      sortValue: f => f.sector_id,
      sticky: true,
    },
    { key: 'name', header: 'Parcel', render: f => f.name, sortValue: f => f.name },
    {
      key: 'crop',
      header: 'Crop',
      render: f => <Badge tone="success">{f.crop_type}</Badge>,
      sortValue: f => f.crop_type,
    },
    {
      key: 'ha',
      header: 'Area (ha)',
      align: 'right',
      render: f => f.hectares.toLocaleString('en-US'),
      sortValue: f => f.hectares,
    },
    {
      key: 'yield',
      header: `Avg yield (${unit})`,
      align: 'right',
      render: f => formatYield(f.avg_yield_kg_ha, unit),
      sortValue: f => f.avg_yield_kg_ha,
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
      render: f => formatPercent(f.moisture_percent).replace('%', ''),
      sortValue: f => f.moisture_percent,
    },
    {
      key: 'risk',
      header: 'Risk',
      render: f => <Badge tone={ratingTone(f.risk_rating, false)}>{f.risk_rating}</Badge>,
      sortValue: f => riskOrder[f.risk_rating.toLowerCase()] ?? 0,
    },
  ];

  const doExport = async (format: 'csv' | 'json') => {
    try {
      const blob = await exportM.mutateAsync({
        format,
        crop_type: filters.crop || null,
        region: filters.region || null,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yieldsense-report${filters.crop ? `-${filters.crop.toLowerCase()}` : ''}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (err) {
      toast.error(`Export failed: ${errorMessage(err)}`);
    }
  };

  return (
    <div className={s.page}>
      <PageHeader
        title="Analytics & Reports"
        description="Multi-year yield trends and a performance comparison across farm sectors."
        meta={
          <SampleDataPill reason="The trends and sector comparison endpoints currently return fixed example data." />
        }
        actions={
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
                <DropdownItem onSelect={() => doExport('csv')}>CSV</DropdownItem>
                <DropdownItem onSelect={() => doExport('json')}>JSON</DropdownItem>
              </DropdownContent>
            </DropdownMenu>
          </div>
        }
      />

      <Card>
        <div className={s.row}>
          <div style={{ minWidth: 220 }}>
            <FormField
              label="Crop"
              htmlFor="an-crop"
              hint={
                filters.crop && !trendCrop ? 'Trends aren’t available for this crop; showing all crops.' : undefined
              }
            >
              <Select
                id="an-crop"
                value={filters.crop}
                onChange={e => setFilters({ crop: e.target.value })}
                options={TREND_CROPS}
                placeholder="All crops"
              />
            </FormField>
          </div>
          <span className={s.muted}>Region filter applies to exports.</span>
        </div>
      </Card>

      <div className={s.kpis}>
        <StatCard
          label="Latest yield"
          value={last ? formatYield(last.avg_yield_kg_ha, unit) : '—'}
          unit={unit}
          subtitle={last ? `${last.year} average` : undefined}
          icon={TrendingUp}
          accent="var(--data-vegetation)"
        />
        <StatCard
          label="Year-over-year"
          value={yoy != null ? formatDeltaPercent(yoy) : '—'}
          subtitle={last && prev ? `${prev.year} → ${last.year}` : undefined}
          delta={null}
        />
        <StatCard
          label="Best sector"
          value={best?.sector_id ?? '—'}
          subtitle={best ? `${best.name} · ${formatYieldWithUnit(best.avg_yield_kg_ha, unit)}` : undefined}
        />
        <StatCard
          label="Highest risk"
          value={riskiest?.sector_id ?? '—'}
          subtitle={riskiest ? `${riskiest.name} · ${riskiest.risk_rating} risk` : undefined}
        />
      </div>

      {trends.isError ? (
        <ErrorState error={trends.error} onRetry={() => trends.refetch()} />
      ) : (
        <ChartCard
          title={
            first && last ? `Yield trajectory (${first.year}–${projection?.year ?? last.year})` : 'Yield trajectory'
          }
          subtitle={`Average yield per year${projection ? ', with the projected next year dashed' : ''} · ${trends.data?.crop_filter ?? 'All crops'}`}
          summary={
            first && last
              ? `Yield moved from ${formatYieldWithUnit(first.avg_yield_kg_ha, unit)} in ${first.year} to ${formatYieldWithUnit(last.avg_yield_kg_ha, unit)} in ${last.year}.`
              : 'Loading.'
          }
          insight={
            cagr != null
              ? `Compound annual growth of ${formatDeltaPercent(cagr)} between ${first?.year} and ${last?.year}.`
              : undefined
          }
          actions={cagr != null ? <Badge tone="model">CAGR {formatDeltaPercent(cagr)}</Badge> : undefined}
          legend={[
            { label: 'Actual', color: 'data-vegetation' },
            { label: 'Projection', color: 'data-model' },
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
                forecastLabel="Projection"
              />
            ) : (
              <Skeleton height={h} />
            )
          }
        </ChartCard>
      )}

      <Card>
        <CardHeader
          title="Farm performance matrix"
          subtitle={`${farms.length || '—'} sectors · select a row for details`}
          actions={<SampleDataPill />}
        />
        {farmsQ.isError ? (
          <ErrorState error={farmsQ.error} onRetry={() => farmsQ.refetch()} />
        ) : farms.length ? (
          <DataTable
            caption="Farm performance by sector"
            columns={columns}
            rows={sortRows(farms, columns, sort)}
            rowKey={f => f.sector_id}
            sort={sort}
            onSortChange={setSort}
            onRowClick={setSelected}
            maxHeight={480}
          />
        ) : (
          <Skeleton height={240} />
        )}
      </Card>

      <Drawer
        open={!!selected}
        onOpenChange={v => !v && setSelected(null)}
        title={selected ? `${selected.sector_id} · ${selected.name}` : ''}
      >
        {selected && (
          <dl className={s.dl}>
            <dt>Crop</dt>
            <dd>{selected.crop_type}</dd>
            <dt>Area</dt>
            <dd>{selected.hectares.toLocaleString('en-US')} ha</dd>
            <dt>Average yield</dt>
            <dd>{formatYieldWithUnit(selected.avg_yield_kg_ha, unit)}</dd>
            <dt>Soil health index</dt>
            <dd>{formatIndex(selected.soil_health_index)}</dd>
            <dt>Soil pH</dt>
            <dd>{formatIndex(selected.soil_pH)}</dd>
            <dt>Moisture</dt>
            <dd>{formatPercent(selected.moisture_percent)}</dd>
            <dt>NDVI</dt>
            <dd>{formatIndex(selected.ndvi_index)}</dd>
            <dt>Risk rating</dt>
            <dd>
              <Badge tone={ratingTone(selected.risk_rating, false)}>{selected.risk_rating}</Badge>
            </dd>
          </dl>
        )}
      </Drawer>
    </div>
  );
}
