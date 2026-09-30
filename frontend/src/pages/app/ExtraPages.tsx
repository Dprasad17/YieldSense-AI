import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BookOpen,
  Clock,
  Cpu,
  Gauge,
  History,
  Keyboard,
  Monitor,
  Moon,
  Printer,
  RotateCcw,
  Search,
  Sun,
  Trash2,
  UserCircle2,
} from 'lucide-react';
import { BarCompareChart, ChartCard } from '../../components/charts';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Kbd,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  Switch,
  type Column,
} from '../../components/ui';
import { ratingTone } from '../../components/ui/helpers';
import { ErrorState } from '../../components/ui/States';
import { useAuth } from '../../auth/context';
import { useDatasetSummary, useModelMetrics, useRegions } from '../../hooks/queries';
import { formatCount, formatIndex, formatLatency, formatYield, formatYieldWithUnit } from '../../lib/format';
import {
  clearRecent,
  deleteRecent,
  listRecent,
  markTourSeen,
  readReport,
  setPrefill,
  type SavedPrediction,
} from '../../lib/localStore';
import { selectModelRows, type ModelRow } from '../../lib/selectors';
import { YIELD_UNITS, type YieldUnit } from '../../lib/units';
import { usePreferences, type Density, type ThemePreference } from '../../store/preferences';
import s from './app.module.css';

// ================================================================ Model performance

export function ModelPerformancePage() {
  const q = useModelMetrics();
  const rows = selectModelRows(q.data);
  const best = rows.find(r => r.isSelected);
  const meta = q.data?.metadata;
  const tuning = (q.data?.gridsearch_cv_tuning ?? null) as Record<string, Record<string, number>> | null;

  const columns: Column<ModelRow>[] = [
    {
      key: 'name',
      header: 'Model',
      render: r => (
        <span style={{ fontWeight: r.isSelected ? 600 : 400 }}>
          {r.name}
          {r.tuning && <span className={s.small}> · {r.tuning}</span>}
          {r.isSelected && (
            <>
              {' '}
              <Badge tone="success">In use</Badge>
            </>
          )}
          {r.isBaseline && (
            <>
              {' '}
              <Badge>Baseline</Badge>
            </>
          )}
        </span>
      ),
    },
    { key: 'r2', header: 'R²', align: 'right', render: r => formatIndex(r.r2), sortValue: r => r.r2 },
    { key: 'rmse', header: 'RMSE (kg/ha)', align: 'right', render: r => formatCount(r.rmse), sortValue: r => r.rmse },
    { key: 'mae', header: 'MAE (kg/ha)', align: 'right', render: r => formatCount(r.mae), sortValue: r => r.mae },
    {
      key: 'lat',
      header: 'Latency',
      align: 'right',
      render: r => formatLatency(r.inference_latency_ms),
      sortValue: r => r.inference_latency_ms,
    },
  ];

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className={s.page}>
      <PageHeader
        title="Model performance"
        description="How the trained models compare on data they never saw during training."
        meta={
          meta?.test_size ? (
            <Badge>
              {formatCount(meta.test_size)} test records · {formatCount(meta.dataset_size)} total
            </Badge>
          ) : undefined
        }
      />
      <div className={s.kpis}>
        {best ? (
          <>
            <StatCard
              label="R² (in use)"
              value={formatIndex(best.r2)}
              icon={Gauge}
              accent="var(--data-model)"
              subtitle={best.name}
              info="Share of yield variation the model explains. 1.00 is perfect."
            />
            <StatCard
              label="RMSE"
              value={formatCount(best.rmse)}
              unit="kg/ha"
              subtitle="Typical error, penalising big misses"
            />
            <StatCard label="MAE" value={formatCount(best.mae)} unit="kg/ha" subtitle="Average absolute error" />
            <StatCard
              label="Latency"
              value={formatLatency(best.inference_latency_ms)}
              icon={Clock}
              subtitle="Per prediction"
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
        <div className={s.s7}>
          <Card>
            <CardHeader title="Model comparison" subtitle="Sorted by R² · the highlighted model serves predictions" />
            {rows.length ? (
              <DataTable caption="Model comparison" columns={columns} rows={rows} rowKey={r => r.key} />
            ) : (
              <Skeleton height={240} />
            )}
          </Card>
        </div>
        <div className={s.s5}>
          <ChartCard
            title="R² by model"
            subtitle="Higher is better"
            summary={best ? `${best.name} has the highest R² at ${formatIndex(best.r2)}.` : 'Loading.'}
            insight={
              best && rows.length > 1
                ? `${best.name} beats the next model by ${formatIndex(best.r2 - rows[1].r2)} R².`
                : undefined
            }
          >
            {(c, h) =>
              rows.length ? (
                <BarCompareChart
                  data={rows.filter(r => !r.isBaseline).map(r => ({ label: r.name, value: r.r2 }))}
                  colors={c}
                  height={h}
                  color={c['data-model']}
                  fy={v => v.toFixed(2)}
                />
              ) : (
                <Skeleton height={h} />
              )
            }
          </ChartCard>
        </div>
        <div className={s.s7}>
          <Card>
            <CardHeader title="How to read these metrics" />
            <ul className={s.list}>
              <li>
                <strong>R²</strong> — how much of the variation in yield the model explains, from 0 to 1. Above 0.9 is
                strong.
              </li>
              <li>
                <strong>RMSE</strong> — the typical size of an error in kg/ha. Large misses count more.
              </li>
              <li>
                <strong>MAE</strong> — the average error in kg/ha, treating every miss equally.
              </li>
              <li>
                <strong>Latency</strong> — time to produce one prediction.
              </li>
              <li>
                <strong>Baseline</strong> — always predicts the average; any useful model must beat it.
              </li>
            </ul>
          </Card>
        </div>
        <div className={s.s5}>
          <Card>
            <CardHeader title="Methodology" subtitle="Training setup reported by the model pipeline" />
            {meta ? (
              <dl className={s.dl}>
                <dt>Records</dt>
                <dd>{formatCount(meta.dataset_size)}</dd>
                <dt>Training / test</dt>
                <dd>
                  {formatCount(meta.train_size)} / {formatCount(meta.test_size)}
                </dd>
                <dt>Input features</dt>
                <dd>{meta.features?.length ?? '—'}</dd>
                {tuning &&
                  Object.entries(tuning).map(([k, params]) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt>{k.replace(/_best_params$/, '').replace(/_/g, ' ')}</dt>
                      <dd>
                        {Object.entries(params)
                          .map(([p, v]) => `${p}=${v}`)
                          .join(', ')}
                      </dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <Skeleton height={120} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ================================================================ Prediction report (print)

export function PredictionReportPage() {
  const report = readReport();
  const { unit } = usePreferences();
  if (!report) {
    return (
      <div style={{ padding: 'var(--space-12)' }}>
        <EmptyState
          title="No report to show"
          description="Open a report from the Yield Predictor after running a prediction."
        />
      </div>
    );
  }
  const { input, result, insights } = report;
  const rows: [string, string][] = [
    ['Crop', input.crop_type],
    ['Region', input.region],
    ['Disease status', input.crop_disease_status],
    ['Soil pH', formatIndex(input.soil_pH)],
    ['Soil moisture', `${input['soil_moisture_%']}%`],
    ['Temperature', `${input.temperature_C} °C`],
    ['Rainfall', `${formatCount(input.rainfall_mm)} mm`],
    ['Humidity', `${input['humidity_%']}%`],
    ['Sunlight', `${input.sunlight_hours} h/day`],
    ['Irrigation', input.irrigation_type],
    ['Fertilizer', input.fertilizer_type],
    ['Pesticide', `${formatCount(input.pesticide_usage_ml)} ml`],
    ['Growing period', `${input.total_days} days`],
    ['NDVI', formatIndex(input.NDVI_index)],
  ];
  return (
    <div data-theme="light" style={{ background: 'var(--surface-2)', minHeight: '100vh', padding: 'var(--space-6)' }}>
      <div
        className="no-print"
        style={{
          maxWidth: 794,
          margin: '0 auto var(--space-4)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--space-2)',
        }}
      >
        <Button variant="primary" icon={Printer} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>
      <article
        style={{
          maxWidth: 794,
          margin: '0 auto',
          background: 'var(--surface)',
          padding: '48px 56px',
          border: '1px solid var(--border)',
          color: 'var(--ink)',
        }}
      >
        <header
          className={s.between}
          style={{ borderBottom: '2px solid var(--primary)', paddingBottom: 'var(--space-4)' }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-xl)' }}>
              YieldSense <span style={{ color: 'var(--primary)' }}>AI</span>
            </div>
            <div className={s.small}>Yield prediction report</div>
          </div>
          <div className={s.small} style={{ textAlign: 'right' }}>
            {new Date(report.savedAt).toLocaleString()}
            <br />
            {report.modelName ?? 'Model'}
          </div>
        </header>
        <section style={{ margin: 'var(--space-6) 0' }}>
          <div className={s.small}>Predicted yield</div>
          <div className={s.big}>
            {formatYield(result.predicted_yield_kg_ha, unit)} <span style={{ fontSize: 'var(--text-lg)' }}>{unit}</span>
          </div>
          <div className={s.row} style={{ marginTop: 'var(--space-2)' }}>
            <Badge tone={ratingTone(result.productivity_rating)}>Productivity: {result.productivity_rating}</Badge>
            <Badge tone={ratingTone(result.risk_rating, false)}>Risk: {result.risk_rating}</Badge>
          </div>
        </section>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Inputs</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-md)' }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 0', color: 'var(--muted)' }}>{k}</td>
                <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {insights && (
          <>
            <h2 style={{ fontSize: 'var(--text-lg)', marginTop: 'var(--space-6)' }}>Insight</h2>
            <p>{insights.ai_insights}</p>
            {insights.recommendations.length > 0 && (
              <ul>
                {insights.recommendations.map(r => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <p className={s.small}>Written by {insights.llm_provider}.</p>
          </>
        )}
        <footer
          className={s.small}
          style={{ marginTop: 'var(--space-8)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}
        >
          Predictions are estimates from a statistical model trained on historical data and should be used alongside
          local expertise.
        </footer>
      </article>
    </div>
  );
}

// ================================================================ Recent predictions

export function HistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unit } = usePreferences();
  const [items, setItems] = useState<SavedPrediction[]>(() => (user ? listRecent(user.username) : []));
  const [confirmClear, setConfirmClear] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => user && setItems(listRecent(user.username));

  const columns: Column<SavedPrediction>[] = [
    { key: 'date', header: 'Saved', render: p => new Date(p.savedAt).toLocaleString(), sortValue: p => p.savedAt },
    { key: 'crop', header: 'Crop', render: p => <Badge tone="success">{p.input.crop_type}</Badge> },
    { key: 'region', header: 'Region', render: p => p.input.region },
    {
      key: 'yield',
      header: `Predicted (${unit})`,
      align: 'right',
      render: p => formatYield(p.result.predicted_yield_kg_ha, unit),
    },
    {
      key: 'risk',
      header: 'Risk',
      render: p => <Badge tone={ratingTone(p.result.risk_rating, false)}>{p.result.risk_rating}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: p => (
        <span
          className={s.row}
          style={{ gap: 'var(--space-1)', flexWrap: 'nowrap' }}
          onClick={e => e.stopPropagation()}
        >
          <Button
            size="sm"
            icon={RotateCcw}
            onClick={() => {
              setPrefill(p.input);
              navigate('/app/predict');
            }}
          >
            Re-run
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label="Delete"
            onClick={() => {
              if (user) {
                deleteRecent(user.username, p.id);
                refresh();
                toast('Deleted');
              }
            }}
          >
            Delete
          </Button>
        </span>
      ),
    },
  ];
  const selected = items.find(i => i.id === open);

  return (
    <div className={s.page}>
      <PageHeader
        title="Recent predictions"
        description="The last 20 predictions you saved. They’re stored in this browser only."
        meta={<Badge tone="info">Saved on this device</Badge>}
        actions={
          items.length ? (
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirmClear(true)}>
              Clear all
            </Button>
          ) : undefined
        }
      />
      <Card>
        {items.length ? (
          <DataTable
            caption="Recent predictions"
            columns={columns}
            rows={items}
            rowKey={p => p.id}
            onRowClick={p => setOpen(p.id === open ? null : p.id)}
          />
        ) : (
          <EmptyState
            icon={History}
            title="No saved predictions"
            description="Run a prediction and choose “Save to recent” to keep it here."
            action={
              <Button variant="primary" icon={Cpu} onClick={() => navigate('/app/predict')}>
                Open Yield Predictor
              </Button>
            }
          />
        )}
      </Card>
      {selected && (
        <Card>
          <CardHeader
            title={`${selected.input.crop_type} · ${selected.input.region}`}
            subtitle={new Date(selected.savedAt).toLocaleString()}
          />
          <div className={s.big}>{formatYieldWithUnit(selected.result.predicted_yield_kg_ha, unit)}</div>
          {selected.insights && <p>{selected.insights.ai_insights}</p>}
        </Card>
      )}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all saved predictions?"
        description="This removes every saved prediction from this browser. It can’t be undone."
        confirmLabel="Clear all"
        tone="danger"
        onConfirm={() => {
          if (user) clearRecent(user.username);
          refresh();
          setConfirmClear(false);
          toast('Cleared');
        }}
      />
    </div>
  );
}

// ================================================================ Settings

export function SettingsPage() {
  const { user, role } = useAuth();
  const p = usePreferences();
  const regions = useRegions().data ?? [];
  const crops = useDatasetSummary().data?.crops_supported ?? [];
  return (
    <div className={s.page}>
      <PageHeader title="Profile & settings" description="Your account details and preferences for this browser." />
      <div className={s.grid}>
        <div className={s.s5}>
          <Card>
            <CardHeader title="Account" subtitle="Managed by your administrator" />
            <div className={s.row} style={{ marginBottom: 'var(--space-4)' }}>
              <UserCircle2 size={40} color="var(--primary)" aria-hidden="true" />
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-lg)' }}>{user?.full_name}</div>
                <Badge tone="success">{role}</Badge>
              </div>
            </div>
            <dl className={s.dl}>
              <dt>Username</dt>
              <dd>{user?.username}</dd>
              <dt>Email</dt>
              <dd>{user?.email}</dd>
            </dl>
            <p className={s.small} style={{ marginTop: 'var(--space-4)' }}>
              To change your details or password, contact your administrator.
            </p>
          </Card>
        </div>
        <div className={s.s7}>
          <Card>
            <CardHeader title="Preferences" subtitle="Saved in this browser" />
            <div className={s.stack} style={{ gap: 'var(--space-5)' }}>
              <FormField label="Theme">
                <SegmentedControl<ThemePreference>
                  label="Theme"
                  value={p.theme}
                  onChange={p.setTheme}
                  options={[
                    { value: 'light', label: 'Light', icon: Sun },
                    { value: 'dark', label: 'Dark', icon: Moon },
                    { value: 'system', label: 'System', icon: Monitor },
                  ]}
                />
              </FormField>
              <FormField label="Yield unit">
                <SegmentedControl<YieldUnit>
                  label="Yield unit"
                  value={p.unit}
                  onChange={p.setUnit}
                  options={YIELD_UNITS.map(u => ({ value: u, label: u }))}
                />
              </FormField>
              <div className={s.row} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <FormField
                    label="Default region"
                    htmlFor="st-region"
                    hint="Applied when a screen opens without a region"
                  >
                    <Select
                      id="st-region"
                      value={p.defaultRegion}
                      onChange={e => p.setDefaultRegion(e.target.value)}
                      options={regions}
                      placeholder="None (all regions)"
                    />
                  </FormField>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <FormField label="Default crop" htmlFor="st-crop">
                    <Select
                      id="st-crop"
                      value={p.defaultCrop}
                      onChange={e => p.setDefaultCrop(e.target.value)}
                      options={[...crops].sort()}
                      placeholder="None (all crops)"
                    />
                  </FormField>
                </div>
              </div>
              <FormField label="Table density">
                <SegmentedControl<Density>
                  label="Table density"
                  value={p.density}
                  onChange={p.setDensity}
                  options={[
                    { value: 'comfortable', label: 'Comfortable' },
                    { value: 'compact', label: 'Compact' },
                  ]}
                />
              </FormField>
              <Switch label="Reduce motion" checked={p.reducedMotion} onCheckedChange={p.setReducedMotion} />
              <div>
                <Button
                  icon={BookOpen}
                  onClick={() => {
                    if (user) markTourSeen(user.username, false);
                    toast('The product tour will show on your next page load');
                  }}
                >
                  Replay product tour
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ================================================================ Help

const FAQ: [string, string][] = [
  [
    'How is the predicted yield calculated?',
    'A Random Forest model trained on 28,242 historical records combines your 14 inputs (crop, region, soil, weather and farm operations) to estimate yield per hectare.',
  ],
  [
    'Why does my region or crop change on every screen?',
    'The context bar at the top sets Region, Crop and units for every screen that supports them, and keeps them in the page address so you can share a view.',
  ],
  [
    'Where are my saved predictions stored?',
    'In this browser only. Clearing site data or switching devices removes them.',
  ],
  [
    'Why do some cards say “Sample data”?',
    'Those endpoints still return fixed example content. The label makes clear the numbers are not computed for your data yet.',
  ],
  [
    'How do I export data?',
    'Use Export on the Dashboard, Analytics & Reports or the Dataset Explorer. Files download as CSV.',
  ],
  [
    'What does live weather use?',
    'Live mode asks Open-Meteo for current conditions in the selected region. If it can’t be reached, dataset values are shown with a notice.',
  ],
];

const GLOSSARY: [string, string][] = [
  ['NDVI', 'Normalised Difference Vegetation Index, 0–1. Higher values mean denser, healthier vegetation.'],
  ['R²', 'Share of variation in yield a model explains, 0–1. Higher is better.'],
  ['RMSE', 'Root mean squared error: typical prediction error in kg/ha, weighting large misses more.'],
  ['MAE', 'Mean absolute error: the average prediction error in kg/ha.'],
  ['kg/ha', 'Kilograms per hectare. 1,000 kg/ha = 1 t/ha. Switch units in the context bar or Settings.'],
  ['Soil health index', 'A 0–1 composite of pH suitability, moisture and vegetation vigour for a crop.'],
];

const SHORTCUTS: [string[], string][] = [
  [['Ctrl', 'K'], 'Open search and commands (⌘K on Mac)'],
  [['Esc'], 'Close dialogs, drawers and menus'],
  [['Tab'], 'Move between controls'],
  [['Enter'], 'Open the focused table row'],
];

export function HelpPage() {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const faq = useMemo(
    () => FAQ.filter(([a, b]) => !term || a.toLowerCase().includes(term) || b.toLowerCase().includes(term)),
    [term],
  );
  const glossary = useMemo(
    () => GLOSSARY.filter(([a, b]) => !term || a.toLowerCase().includes(term) || b.toLowerCase().includes(term)),
    [term],
  );
  return (
    <div className={s.page}>
      <PageHeader title="Help center" description="Answers, definitions and shortcuts." />
      <div style={{ maxWidth: 520 }}>
        <Input
          icon={Search}
          placeholder="Search help…"
          value={q}
          onChange={e => setQ(e.target.value)}
          aria-label="Search help"
        />
      </div>
      <div className={s.grid}>
        <div className={s.s7}>
          <Card>
            <CardHeader title="Frequently asked questions" />
            {faq.length ? (
              <div className={s.stack}>
                {faq.map(([question, answer]) => (
                  <details key={question} className={s.tile}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{question}</summary>
                    <p style={{ margin: 'var(--space-2) 0 0' }}>{answer}</p>
                  </details>
                ))}
              </div>
            ) : (
              <EmptyState title="No matching questions" />
            )}
          </Card>
          <div style={{ height: 'var(--space-6)' }} />
          <Card>
            <CardHeader title="How predictions work" />
            <ol style={{ margin: 0, paddingLeft: 'var(--space-5)', lineHeight: 1.7 }}>
              <li>You describe the field: crop, region, soil, weather and farm operations.</li>
              <li>The inputs are encoded exactly as during training.</li>
              <li>The Random Forest averages the estimates of many decision trees.</li>
              <li>You get yield in kg/ha, a productivity class and a risk rating.</li>
              <li>An insight summarises what drives the estimate and what to watch.</li>
            </ol>
          </Card>
        </div>
        <div className={`${s.s5} ${s.stack}`}>
          <Card>
            <CardHeader title="Glossary" />
            {glossary.length ? (
              <dl style={{ margin: 0 }}>
                {glossary.map(([t, d]) => (
                  <div key={t} style={{ marginBottom: 'var(--space-3)' }}>
                    <dt style={{ fontWeight: 600 }}>{t}</dt>
                    <dd style={{ margin: 0 }} className={s.muted}>
                      {d}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <EmptyState title="No matching terms" />
            )}
          </Card>
          <Card>
            <CardHeader title="Keyboard shortcuts" actions={<Keyboard size={16} aria-hidden="true" />} />
            <ul className={s.list}>
              {SHORTCUTS.map(([keys, label]) => (
                <li key={label} className={s.between}>
                  <span>{label}</span>
                  <span className={s.row} style={{ gap: 4 }}>
                    {keys.map(k => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Banner tone="info">Need more help? Contact your administrator.</Banner>
        </div>
      </div>
    </div>
  );
}
