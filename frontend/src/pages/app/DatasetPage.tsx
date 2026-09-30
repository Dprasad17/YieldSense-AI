import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Cpu,
  Download,
  Search,
  X,
} from 'lucide-react';
import type { CropRecord } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
} from '../../components/ui';
import { ErrorState } from '../../components/ui/States';
import { useDatasetSummary, useRecords, useRegions } from '../../hooks/queries';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatCount, formatIndex, formatNumber, formatRange, formatYield } from '../../lib/format';
import { setPrefill } from '../../lib/localStore';
import { useGlobalFilters } from '../../store/filters';
import { usePreferences, type Density } from '../../store/preferences';
import ui from '../../components/ui/ui.module.css';
import s from './app.module.css';

const PAGE_SIZES = [15, 30, 50, 100];
const NDVI_COLORS = ['var(--ndvi-0)', 'var(--ndvi-1)', 'var(--ndvi-2)', 'var(--ndvi-3)', 'var(--ndvi-4)'];

function diseaseTone(v: string) {
  const d = (v || 'None').toLowerCase();
  return d === 'none' ? 'success' : d === 'mild' ? 'info' : d === 'moderate' ? 'warning' : 'danger';
}

export function DatasetPage() {
  const navigate = useNavigate();
  const { filters, setFilters } = useGlobalFilters();
  const { unit, density: defaultDensity } = usePreferences();
  const crops = useDatasetSummary().data?.crops_supported ?? [];
  const regions = useRegions().data ?? [];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 350);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState<Density>(defaultDensity);
  const [jump, setJump] = useState('');
  const [selected, setSelected] = useState<CropRecord | null>(null);

  const q = useRecords({
    page,
    page_size: pageSize,
    crop: filters.crop || undefined,
    region: filters.region || undefined,
    search: debounced || undefined,
  });
  const rows = useMemo(() => q.data?.items ?? [], [q.data]);
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns = useMemo<ColumnDef<CropRecord>[]>(
    () => [
      {
        id: 'farm_id',
        header: 'Farm ID',
        accessorKey: 'farm_id',
        cell: c => <strong className={s.num}>{c.getValue<string>()}</strong>,
        enableHiding: false,
      },
      { id: 'region', header: 'Region', accessorKey: 'region' },
      {
        id: 'crop_type',
        header: 'Crop',
        accessorKey: 'crop_type',
        cell: c => <Badge tone="success">{c.getValue<string>()}</Badge>,
      },
      {
        id: 'yield',
        header: `Yield (${unit})`,
        accessorKey: 'yield_kg_per_hectare',
        meta: { right: true },
        cell: c => formatYield(c.getValue<number>(), unit),
      },
      {
        id: 'soil_pH',
        header: 'Soil pH',
        accessorKey: 'soil_pH',
        meta: { right: true },
        cell: c => formatIndex(c.getValue<number>()),
      },
      {
        id: 'temperature_C',
        header: 'Temp (°C)',
        accessorKey: 'temperature_C',
        meta: { right: true },
        cell: c => formatNumber(c.getValue<number>(), 1),
      },
      {
        id: 'rainfall_mm',
        header: 'Rainfall (mm)',
        accessorKey: 'rainfall_mm',
        meta: { right: true },
        cell: c => formatNumber(c.getValue<number>(), 0),
      },
      {
        id: 'moisture',
        header: 'Moisture (%)',
        accessorFn: r => r['soil_moisture_%'],
        meta: { right: true },
        cell: c => formatNumber(c.getValue<number>(), 1),
      },
      { id: 'irrigation_type', header: 'Irrigation', accessorKey: 'irrigation_type' },
      { id: 'fertilizer_type', header: 'Fertilizer', accessorKey: 'fertilizer_type' },
      { id: 'total_days', header: 'Duration (days)', accessorKey: 'total_days', meta: { right: true } },
      {
        id: 'ndvi',
        header: 'NDVI',
        accessorKey: 'NDVI_index',
        cell: c => {
          const v = c.getValue<number>();
          return (
            <span style={{ whiteSpace: 'nowrap' }}>
              <span className={s.miniBar}>
                <i style={{ width: `${v * 100}%`, background: NDVI_COLORS[Math.min(4, Math.floor(v * 5))] }} />
              </span>
              <span className={s.num}>{formatIndex(v)}</span>
            </span>
          );
        },
      },
      {
        id: 'disease',
        header: 'Disease',
        accessorKey: 'crop_disease_status',
        cell: c => <Badge tone={diseaseTone(c.getValue<string>())}>{c.getValue<string>() || 'None'}</Badge>,
      },
    ],
    [unit],
  );

  // TanStack Table returns non-memoizable functions by design; this page does not rely on the React Compiler.
  // eslint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const go = (p: number) => setPage(Math.min(totalPages, Math.max(1, p)));
  const resetPage = () => setPage(1);

  const exportPage = () => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]) as (keyof CropRecord)[];
    const csv = [
      keys.join(','),
      ...rows.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `yieldsense-records-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const predictWith = (r: CropRecord) => {
    setPrefill({
      crop_type: r.crop_type,
      region: r.region,
      irrigation_type: r.irrigation_type,
      fertilizer_type: r.fertilizer_type,
      crop_disease_status: r.crop_disease_status || 'None',
      soil_pH: r.soil_pH,
      'soil_moisture_%': r['soil_moisture_%'],
      temperature_C: r.temperature_C,
      rainfall_mm: Math.min(2000, r.rainfall_mm),
      'humidity_%': r['humidity_%'],
      sunlight_hours: r.sunlight_hours,
      pesticide_usage_ml: r.pesticide_usage_ml,
      total_days: r.total_days,
      NDVI_index: r.NDVI_index,
    });
    navigate('/app/predict');
  };

  const chips = [
    filters.crop && {
      label: `Crop: ${filters.crop}`,
      clear: () => {
        setFilters({ crop: '' });
        resetPage();
      },
    },
    filters.region && {
      label: `Region: ${filters.region}`,
      clear: () => {
        setFilters({ region: '' });
        resetPage();
      },
    },
    debounced && {
      label: `Search: “${debounced}”`,
      clear: () => {
        setSearch('');
        resetPage();
      },
    },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className={s.page}>
      <PageHeader
        title="Dataset Explorer"
        description="Search, filter and inspect every record. Select a row to see all fields or send it to the predictor."
      />

      <Card>
        <div className={s.stack}>
          <div className={s.row}>
            <div style={{ flex: '1 1 260px' }}>
              <Input
                icon={Search}
                placeholder="Search farm ID, region or crop…"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                aria-label="Search records"
              />
            </div>
            <div style={{ width: 180 }}>
              <Select
                aria-label="Crop"
                value={filters.crop}
                onChange={e => {
                  setFilters({ crop: e.target.value });
                  resetPage();
                }}
                options={[...crops].sort()}
                placeholder="All crops"
              />
            </div>
            <div style={{ width: 200 }}>
              <Select
                aria-label="Region"
                value={filters.region}
                onChange={e => {
                  setFilters({ region: e.target.value });
                  resetPage();
                }}
                options={regions}
                placeholder="All regions"
              />
            </div>
            <SegmentedControl<Density>
              label="Row density"
              value={density}
              onChange={setDensity}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
            <RadixMenu.Root>
              <RadixMenu.Trigger asChild>
                <Button icon={Columns3}>Columns</Button>
              </RadixMenu.Trigger>
              <RadixMenu.Portal>
                <RadixMenu.Content className={ui.menu} align="end" sideOffset={6}>
                  {table
                    .getAllLeafColumns()
                    .filter(c => c.getCanHide())
                    .map(c => (
                      <RadixMenu.CheckboxItem
                        key={c.id}
                        className={ui.menuItem}
                        checked={c.getIsVisible()}
                        onCheckedChange={v => c.toggleVisibility(!!v)}
                        onSelect={e => e.preventDefault()}
                      >
                        <span style={{ width: 16 }}>{c.getIsVisible() ? '✓' : ''}</span>
                        {String(c.columnDef.header)}
                      </RadixMenu.CheckboxItem>
                    ))}
                </RadixMenu.Content>
              </RadixMenu.Portal>
            </RadixMenu.Root>
            <Button icon={Download} onClick={exportPage} disabled={!rows.length}>
              Export page
            </Button>
          </div>
          {chips.length > 0 && (
            <div className={s.chips}>
              {chips.map(c => (
                <span key={c.label} className={s.chip}>
                  {c.label}
                  <button type="button" onClick={c.clear} aria-label={`Remove ${c.label}`}>
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : q.isPending ? (
            <Skeleton height={420} />
          ) : rows.length === 0 ? (
            <EmptyState title="No records match" description="Try a different search or clear the filters." />
          ) : (
            <div className={ui.tableWrap} style={{ maxHeight: 'min(62vh, 640px)', opacity: q.isFetching ? 0.7 : 1 }}>
              <table className={`${ui.table} ${density === 'compact' ? ui.compact : ''}`}>
                <caption className="sr-only">
                  Dataset records, page {page} of {totalPages}
                </caption>
                <thead>
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id}>
                      {hg.headers.map(h => {
                        const right = (h.column.columnDef.meta as { right?: boolean } | undefined)?.right;
                        const dir = h.column.getIsSorted();
                        return (
                          <th
                            key={h.id}
                            scope="col"
                            className={`${right ? ui.alignRight : ''} ${h.column.id === 'farm_id' ? ui.stickyCol : ''}`}
                            aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                          >
                            <button type="button" className={ui.sortBtn} onClick={h.column.getToggleSortingHandler()}>
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              <span aria-hidden="true">{dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕'}</span>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(r => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelected(r.original)}
                      onKeyDown={e => e.key === 'Enter' && setSelected(r.original)}
                    >
                      {r.getVisibleCells().map(c => {
                        const right = (c.column.columnDef.meta as { right?: boolean } | undefined)?.right;
                        return (
                          <td
                            key={c.id}
                            className={`${right ? `${ui.alignRight} ${ui.num}` : ''} ${c.column.id === 'farm_id' ? ui.stickyCol : ''}`}
                          >
                            {flexRender(c.column.columnDef.cell, c.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={ui.pagination}>
            <span className={s.num}>{formatRange(page, pageSize, total)} records</span>
            <div className={ui.paginationControls}>
              <label className={s.row} style={{ gap: 'var(--space-2)' }}>
                Rows
                <Select
                  value={String(pageSize)}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    resetPage();
                  }}
                  options={PAGE_SIZES.map(String)}
                  style={{ width: 76, height: 30 }}
                  aria-label="Rows per page"
                />
              </label>
              <IconButton
                icon={ChevronsLeft}
                label="First page"
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => go(1)}
              />
              <IconButton
                icon={ChevronLeft}
                label="Previous page"
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => go(page - 1)}
              />
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const n = Number(jump);
                  if (Number.isFinite(n) && n > 0) go(Math.round(n));
                  setJump('');
                }}
                className={s.row}
                style={{ gap: 'var(--space-2)' }}
              >
                <span className={s.num}>
                  Page {formatCount(page)} of {formatCount(totalPages)}
                </span>
                <Input
                  aria-label="Jump to page"
                  placeholder="Go to"
                  value={jump}
                  onChange={e => setJump(e.target.value.replace(/\D/g, ''))}
                  style={{ width: 80, height: 30 }}
                  inputMode="numeric"
                />
              </form>
              <IconButton
                icon={ChevronRight}
                label="Next page"
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => go(page + 1)}
              />
              <IconButton
                icon={ChevronsRight}
                label="Last page"
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => go(totalPages)}
              />
            </div>
          </div>
          <p className={s.small} style={{ margin: 0 }}>
            Sorting applies to the rows on the current page.
          </p>
        </div>
      </Card>

      <Drawer
        open={!!selected}
        onOpenChange={v => !v && setSelected(null)}
        title={selected ? `Record ${selected.farm_id}` : ''}
      >
        {selected && (
          <div className={s.stack}>
            <dl className={s.dl}>
              {(
                [
                  ['Region', selected.region],
                  ['Crop', selected.crop_type],
                  [`Yield (${unit})`, formatYield(selected.yield_kg_per_hectare, unit)],
                  ['Rainfall (mm)', formatNumber(selected.rainfall_mm, 0)],
                  ['Temperature (°C)', formatNumber(selected.temperature_C, 1)],
                  ['Humidity (%)', formatNumber(selected['humidity_%'], 1)],
                  ['Sunlight (h/day)', formatNumber(selected.sunlight_hours, 1)],
                  ['Soil pH', formatIndex(selected.soil_pH)],
                  ['Soil moisture (%)', formatNumber(selected['soil_moisture_%'], 1)],
                  ['NDVI', formatIndex(selected.NDVI_index)],
                  ['Irrigation', selected.irrigation_type],
                  ['Fertilizer', selected.fertilizer_type],
                  ['Pesticide (ml)', formatNumber(selected.pesticide_usage_ml, 0)],
                  ['Disease', selected.crop_disease_status || 'None'],
                  ['Sowing date', selected.sowing_date],
                  ['Harvest date', selected.harvest_date],
                  ['Duration (days)', String(selected.total_days)],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <Button variant="primary" icon={Cpu} onClick={() => predictWith(selected)}>
              Predict with these values
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
