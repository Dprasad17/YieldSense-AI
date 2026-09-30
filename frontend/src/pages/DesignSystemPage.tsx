import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CloudRain, Droplets, Leaf, Search, Sprout, Thermometer, Trash2 } from 'lucide-react';
import {
  BandCurveChart,
  BarCompareChart,
  ChartCard,
  ComposedRainTempChart,
  RankBarChart,
  ScatterFitChart,
  Sparkline,
  TrendChart,
  type TrendPoint,
} from '../components/charts';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  FormField,
  IconButton,
  InfoTip,
  InsightCallout,
  Input,
  Kbd,
  Modal,
  ModelChip,
  PageHeader,
  Pagination,
  ProgressBar,
  ProgressRing,
  RangeBar,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  StatusDot,
  Switch,
  Tabs,
  TooltipProvider,
  type Column,
} from '../components/ui';
import { sortRows } from '../components/ui/helpers';
import { ErrorState } from '../components/ui/States';

// Showcase values for rendering components. Not app data.
const TREND_WITH_FORECAST: TrendPoint[] = [
  { x: 2019, actual: 3800 },
  { x: 2020, actual: 4000 },
  { x: 2021, actual: 4080 },
  { x: 2022, actual: 4280 },
  { x: 2023, actual: 4360, forecast: 4360 },
  { x: 2024, forecast: 4520, band: [4300, 4760] },
];
const RANK = ['Region A', 'Region B', 'Region C', 'Region D', 'Region E'].map((label, i) => ({
  label,
  value: 6200 - i * 700,
}));
const HIST = Array.from({ length: 12 }, (_, i) => ({
  label: `${i * 500}`,
  value: Math.round(900 * Math.exp(-((i - 4) ** 2) / 8)),
}));
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({
  label,
  rain: [4, 12, 0, 8, 22, 3, 1][i],
  temp: [24, 26, 29, 27, 23, 25, 28][i],
}));
const SCATTER = Array.from({ length: 60 }, (_, i) => ({ x: 200 + i * 30, y: 2500 + i * 18 + ((i * 37) % 11) * 90 }));
const CURVE = Array.from({ length: 16 }, (_, i) => ({ x: 5 + i * 0.2, y: 4200 - (5 + i * 0.2 - 6.5) ** 2 * 900 }));

interface Row {
  id: string;
  crop: string;
  yield: number;
  ndvi: number;
  status: string;
}
const ROWS: Row[] = [
  { id: 'R-001', crop: 'Rice', yield: 4210, ndvi: 0.71, status: 'Low' },
  { id: 'R-002', crop: 'Wheat', yield: 3120, ndvi: 0.58, status: 'Medium' },
  { id: 'R-003', crop: 'Potato', yield: 19800, ndvi: 0.86, status: 'Low' },
  { id: 'R-004', crop: 'Maize', yield: 3650, ndvi: 0.63, status: 'High' },
];
const COLUMNS: Column<Row>[] = [
  { key: 'id', header: 'ID', render: r => r.id, sortValue: r => r.id, sticky: true },
  { key: 'crop', header: 'Crop', render: r => <Badge tone="success">{r.crop}</Badge>, sortValue: r => r.crop },
  {
    key: 'yield',
    header: 'Yield (kg/ha)',
    align: 'right',
    render: r => r.yield.toLocaleString('en-US'),
    sortValue: r => r.yield,
  },
  { key: 'ndvi', header: 'NDVI', align: 'right', render: r => r.ndvi.toFixed(2), sortValue: r => r.ndvi },
  {
    key: 'risk',
    header: 'Risk',
    render: r => (
      <Badge tone={r.status === 'High' ? 'danger' : r.status === 'Medium' ? 'warning' : 'success'}>{r.status}</Badge>
    ),
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--text-lg)',
          fontWeight: 'var(--weight-semibold)',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 'var(--space-2)',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

const Row2 = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>{children}</div>
);

const SWATCHES = [
  'canvas',
  'surface',
  'surface-2',
  'border',
  'ink',
  'muted',
  'primary',
  'data-water',
  'data-temperature',
  'data-soil',
  'data-vegetation',
  'data-model',
  'success',
  'warning',
  'danger',
  'info',
];

function Showcase() {
  const [seg, setSeg] = useState<'dataset' | 'live'>('dataset');
  const [sw, setSw] = useState(true);
  const [tab, setTab] = useState('a');
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'yield', dir: 'desc' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-10)' }}>
      <Section title="Colour tokens">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 'var(--space-2)',
          }}
        >
          {SWATCHES.map(t => (
            <div key={t} style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
              <div
                style={{
                  height: 40,
                  borderRadius: 'var(--radius-sm)',
                  background: `var(--${t})`,
                  border: '1px solid var(--border)',
                }}
              />
              --{t}
            </div>
          ))}
        </div>
        <div
          style={{
            height: 12,
            borderRadius: 'var(--radius-full)',
            background:
              'linear-gradient(90deg, var(--ndvi-0), var(--ndvi-1), var(--ndvi-2), var(--ndvi-3), var(--ndvi-4))',
          }}
          aria-label="NDVI scale"
          role="img"
        />
      </Section>

      <Section title="Typography">
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-display)', lineHeight: 1 }}>
          Know your harvest.
        </div>
        <PageHeader title="Page title · 24px" description="Body 14px Inter. Labels are never below 12px." />
        <div className="num" style={{ fontSize: 'var(--text-3xl)' }}>
          7,705 <span style={{ fontSize: 'var(--text-md)', color: 'var(--muted)' }}>kg/ha</span>
        </div>
      </Section>

      <Section title="Buttons">
        <Row2>
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={Trash2}>
            Danger
          </Button>
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button size="sm">Small</Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <IconButton icon={Search} label="Search" variant="secondary" />
          <ButtonLink to="/app/dashboard" variant="ghost">
            Link button
          </ButtonLink>
        </Row2>
      </Section>

      <Section title="Form controls">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <FormField label="Search" htmlFor="ds-search" hint="Farm ID, region or crop">
            <Input id="ds-search" icon={Search} placeholder="Search…" />
          </FormField>
          <FormField label="Rainfall" htmlFor="ds-rain" optimal="600–1,200 mm">
            <Input id="ds-rain" type="number" defaultValue={850} suffix="mm" />
          </FormField>
          <FormField label="Soil pH" htmlFor="ds-ph" error="pH must be between 3 and 10">
            <Input id="ds-ph" type="number" defaultValue={12} invalid />
          </FormField>
          <FormField label="Crop" htmlFor="ds-crop">
            <Select id="ds-crop" options={['Rice', 'Wheat', 'Maize']} placeholder="All crops" defaultValue="" />
          </FormField>
        </div>
        <Row2>
          <SegmentedControl
            label="Source"
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'dataset', label: 'Dataset' },
              { value: 'live', label: 'Live' },
            ]}
          />
          <Switch label="Live updates" checked={sw} onCheckedChange={setSw} />
          <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            Shortcut <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
          </span>
          <span style={{ display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'center' }}>
            Tooltip <InfoTip text="Explains a metric in one or two sentences." />
          </span>
        </Row2>
      </Section>

      <Section title="Badges and status">
        <Row2>
          <Badge>Neutral</Badge>
          <Badge tone="success">Optimal</Badge>
          <Badge tone="warning">Watch</Badge>
          <Badge tone="danger">Critical</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="model">Model</Badge>
          <StatusDot tone="success" label="Online" />
          <StatusDot tone="warning" label="Degraded" />
          <ModelChip name="Random Forest" r2={0.9447} rmse={2003} />
        </Row2>
      </Section>

      <Section title="Stat cards">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <StatCard
            label="Average yield"
            value="7,705"
            unit="kg/ha"
            delta={3.4}
            deltaLabel="vs previous"
            subtitle="Global mean · 28,242 records"
            icon={Sprout}
            info="Mean of yield across all records."
            footer={<Sparkline values={[3, 4, 3.6, 4.2, 4.8]} label="Trend" color="var(--data-vegetation)" />}
          />
          <StatCard
            label="Seasonal rainfall"
            value="1,149"
            unit="mm"
            delta={-2.1}
            subtitle="Global mean"
            icon={CloudRain}
            accent="var(--data-water)"
          />
          <StatCard
            label="Vegetation (NDVI)"
            value="0.62"
            subtitle="Global mean"
            icon={Leaf}
            accent="var(--data-vegetation)"
          />
        </div>
      </Section>

      <Section title="Progress, gauges and ranges">
        <Row2>
          <ProgressRing value={72} label="Rainfall adequacy" color="var(--data-water)" />
          <ProgressRing value={35} label="Heat stress" color="var(--data-temperature)" />
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <ProgressBar value={64} label="Completion" />
            <RangeBar label="Soil pH" value={6.4} min={4.5} max={8.5} optimalLow={6} optimalHigh={7} />
          </div>
        </Row2>
      </Section>

      <Section title="Feedback">
        <Banner tone="info">Live data comes from Open-Meteo.</Banner>
        <Banner tone="warning">Some values are sample data.</Banner>
        <Banner tone="danger">The server could not be reached.</Banner>
        <Banner tone="success">Report downloaded.</Banner>
        <Row2>
          <Button onClick={() => toast.success('Saved')}>Success toast</Button>
          <Button onClick={() => toast.error('Something failed')}>Error toast</Button>
        </Row2>
        <Card>
          <Skeleton width="40%" height={20} />
          <div style={{ height: 12 }} />
          <Skeleton height={120} />
        </Card>
        <Card>
          <EmptyState
            title="No records match"
            description="Try a different crop or clear the filters."
            action={<Button size="sm">Clear filters</Button>}
          />
        </Card>
        <ErrorState error={new Error('Request failed (500)')} onRetry={() => toast('Retrying…')} />
        <InsightCallout>Rainfall explains 1% of yield variance in this dataset.</InsightCallout>
      </Section>

      <Section title="Tabs, dialogs and drawers">
        <Tabs
          label="Example tabs"
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: 'a', label: 'Overview', content: <p style={{ margin: 0 }}>Overview panel.</p> },
            { value: 'b', label: 'Scheduled reports', content: <p style={{ margin: 0 }}>Second panel.</p> },
          ]}
        />
        <Row2>
          <Button onClick={() => setModal(true)}>Open modal</Button>
          <Button onClick={() => setConfirm(true)}>Confirm dialog</Button>
          <Button onClick={() => setDrawer(true)}>Open drawer</Button>
        </Row2>
        <Modal
          open={modal}
          onOpenChange={setModal}
          title="Modal title"
          description="Supporting description."
          footer={
            <Button variant="primary" onClick={() => setModal(false)}>
              Done
            </Button>
          }
        >
          <p style={{ margin: 0 }}>Modal body.</p>
        </Modal>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Create field task?"
          description="This adds a task for the selected recommendation."
          confirmLabel="Create task"
          onConfirm={() => {
            setConfirm(false);
            toast.success('Task created');
          }}
        />
        <Drawer open={drawer} onOpenChange={setDrawer} title="Record details">
          <p style={{ margin: 0 }}>Drawer content.</p>
        </Drawer>
      </Section>

      <Section title="Data table">
        <DataTable
          caption="Example records"
          columns={COLUMNS}
          rows={sortRows(ROWS, COLUMNS, sort)}
          rowKey={r => r.id}
          sort={sort}
          onSortChange={setSort}
        />
        <Pagination
          page={page}
          pageSize={15}
          total={28242}
          onPageChange={setPage}
          pageSizes={[15, 30, 50]}
          onPageSizeChange={() => undefined}
        />
      </Section>

      <Section title="Charts">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <ChartCard
            title="Trend with forecast band"
            subtitle="Actual, forecast and P10–P90 band"
            summary="Yield rises from 3,800 to 4,520."
            insight="Forecast is 5% above the latest year."
            legend={[
              { label: 'Actual', color: 'data-vegetation' },
              { label: 'Forecast', color: 'data-model' },
            ]}
          >
            {(c, h) => <TrendChart data={TREND_WITH_FORECAST} colors={c} height={h} />}
          </ChartCard>
          <ChartCard title="Ranking" subtitle="Horizontal bars with benchmark" summary="Region A ranks first.">
            {(c, h) => <RankBarChart data={RANK} colors={c} height={h} benchmark={4200} />}
          </ChartCard>
          <ChartCard title="Histogram" subtitle="Distribution with a reference line" summary="Peak around 2,000.">
            {(c, h) => (
              <BarCompareChart data={HIST} colors={c} height={h} refLines={[{ x: '2000', label: 'Median' }]} />
            )}
          </ChartCard>
          <ChartCard
            title="Rainfall and temperature"
            subtitle="Bars and line on two axes"
            summary="Wettest day Friday."
            legend={[
              { label: 'Rainfall', color: 'data-water' },
              { label: 'Temperature', color: 'data-temperature' },
            ]}
          >
            {(c, h) => <ComposedRainTempChart data={WEEK} colors={c} height={h} />}
          </ChartCard>
          <ChartCard title="Scatter with fit" subtitle="Least-squares line" summary="Positive relationship.">
            {(c, h) => <ScatterFitChart points={SCATTER} colors={c} height={h} xLabel="Rainfall" yLabel="Yield" />}
          </ChartCard>
          <ChartCard title="Curve with optimal band" subtitle="Shaded optimum" summary="Peaks at pH 6.5.">
            {(c, h) => (
              <BandCurveChart data={CURVE} colors={c} height={h} band={{ from: 6, to: 7, label: 'Optimal' }} />
            )}
          </ChartCard>
        </div>
      </Section>

      <Section title="Cards">
        <Card>
          <CardHeader
            title="Card title"
            subtitle="One-line subtitle"
            info="What this card shows."
            actions={<Button size="sm">Action</Button>}
          />
          <Row2>
            <Droplets size={16} color="var(--data-water)" aria-hidden="true" /> Water
            <Thermometer size={16} color="var(--data-temperature)" aria-hidden="true" /> Temperature
            <Leaf size={16} color="var(--data-vegetation)" aria-hidden="true" /> Vegetation
          </Row2>
        </Card>
      </Section>
    </div>
  );
}

/** Every component in both themes, side by side on wide screens. */
export function DesignSystemPage() {
  return (
    <TooltipProvider>
      <div style={{ background: 'var(--canvas)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 1760, margin: '0 auto', padding: 'var(--space-8) var(--gutter)' }}>
          <PageHeader
            title="Design system"
            description="Field Intelligence components and tokens, rendered in the dark and light themes."
            actions={
              <ButtonLink to="/app/dashboard" variant="secondary">
                Back to app
              </ButtonLink>
            }
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 720px), 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            {(['dark', 'light'] as const).map(theme => (
              <div
                key={theme}
                data-theme={theme}
                style={{
                  background: 'var(--canvas)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-6)',
                  minWidth: 0,
                }}
              >
                <Badge tone="model">{theme === 'dark' ? 'Dark theme' : 'Light theme'}</Badge>
                <div style={{ height: 'var(--space-6)' }} />
                <Showcase />
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
