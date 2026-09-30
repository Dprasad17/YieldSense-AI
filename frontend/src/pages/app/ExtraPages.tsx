import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { authApi, profileApi } from '../../api/endpoints';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BookOpen,
  Cpu,
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
  Switch,
  type Column,
} from '../../components/ui';
import { ratingTone } from '../../components/ui/helpers';
import { useAuth } from '../../auth/context';
import { useDatasetSummary, useRegions } from '../../hooks/queries';
import { formatCount, formatIndex, formatYield, formatYieldWithUnit } from '../../lib/format';
import {
  clearRecent,
  deleteRecent,
  listRecent,
  markTourSeen,
  readReport,
  setPrefill,
  type SavedPrediction,
} from '../../lib/localStore';
import { YIELD_UNITS, type YieldUnit } from '../../lib/units';
import { usePreferences, type Density, type ThemePreference } from '../../store/preferences';
import s from './app.module.css';

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
  const na = (v: unknown, fmt: (x: never) => string = String as never) =>
    v == null || v === '' ? 'Not recorded' : fmt(v as never);
  const rows: [string, string][] = [
    ['Crop', input.crop_type],
    ['Region', input.region],
    ['Season year', na(input.year)],
    ['Rainfall', `${formatCount(input.rainfall_mm)} mm`],
    ['Temperature', `${input.temperature_C} °C`],
    ['Pesticides (index)', formatCount(input.pesticide_usage_ml)],
    ['Growing period', `${input.total_days} days`],
    ['Disease status', na(input.crop_disease_status)],
    ['Soil pH', na(input.soil_pH, (x: number) => formatIndex(x))],
    ['Soil moisture', na(input['soil_moisture_%'], (x: number) => `${x}%`)],
    ['Humidity', na(input['humidity_%'], (x: number) => `${x}%`)],
    ['Sunlight', na(input.sunlight_hours, (x: number) => `${x} h/day`)],
    ['Irrigation', na(input.irrigation_type)],
    ['Fertilizer', na(input.fertilizer_type)],
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
  const { user, role, updateUser } = useAuth();
  const p = usePreferences();
  const regions = useRegions().data ?? [];
  const crops = useDatasetSummary().data?.crops_supported ?? [];
  const me = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const [profile, setProfile] = useState<{ full_name: string; email: string } | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'profile' | 'password' | 'prefs' | null>(null);
  const form = profile ?? {
    full_name: me.data?.user.full_name ?? user?.full_name ?? '',
    email: me.data?.user.email ?? user?.email ?? '',
  };
  const prefs = me.data?.user.notification_prefs;

  const saveProfile = async () => {
    if (!form.full_name.trim()) return toast.error('Enter your name.');
    setSaving('profile');
    try {
      const res = await profileApi.update({ full_name: form.full_name.trim(), email: form.email.trim() });
      updateUser({
        username: res.user.username,
        role: res.user.role,
        email: res.user.email,
        full_name: res.user.full_name,
      });
      setProfile(null);
      me.refetch();
      toast.success('Profile saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const savePrefs = async (key: keyof NonNullable<typeof prefs>, value: boolean) => {
    if (!prefs) return;
    setSaving('prefs');
    try {
      await profileApi.update({ notification_prefs: { ...prefs, [key]: value } });
      await me.refetch();
      toast.success('Notification preferences saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const changePassword = async () => {
    setPwError(null);
    if (pw.next.length < 8) return setPwError('The new password needs at least 8 characters.');
    if (pw.next !== pw.confirm) return setPwError('The new passwords don’t match.');
    setSaving('password');
    try {
      await profileApi.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={s.page}>
      <PageHeader
        title="Profile & settings"
        description="Your account, security, notifications and display preferences."
      />
      <div className={s.grid}>
        <div className={`${s.s5} ${s.stack}`}>
          <Card>
            <CardHeader
              title="Profile"
              subtitle={`@${user?.username} · ${role}`}
              actions={<UserCircle2 size={28} color="var(--primary)" aria-hidden="true" />}
            />
            <div className={s.stack}>
              <FormField label="Full name" htmlFor="pf-name">
                <Input
                  id="pf-name"
                  value={form.full_name}
                  onChange={e => setProfile({ ...form, full_name: e.target.value })}
                />
              </FormField>
              <FormField label="Email" htmlFor="pf-email">
                <Input
                  id="pf-email"
                  type="email"
                  value={form.email}
                  onChange={e => setProfile({ ...form, email: e.target.value })}
                />
              </FormField>
              <div>
                <Button variant="primary" onClick={saveProfile} loading={saving === 'profile'} disabled={!profile}>
                  Save profile
                </Button>
              </div>
              <p className={s.small} style={{ margin: 0 }}>
                Your role is managed by an administrator.
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Change password" subtitle="You’ll need your current password" />
            <div className={s.stack}>
              {pwError && (
                <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
                  {pwError}
                </p>
              )}
              <FormField label="Current password" htmlFor="pw-cur">
                <Input
                  id="pw-cur"
                  type="password"
                  autoComplete="current-password"
                  value={pw.current}
                  onChange={e => setPw({ ...pw, current: e.target.value })}
                />
              </FormField>
              <FormField label="New password" htmlFor="pw-new" hint="At least 8 characters">
                <Input
                  id="pw-new"
                  type="password"
                  autoComplete="new-password"
                  value={pw.next}
                  onChange={e => setPw({ ...pw, next: e.target.value })}
                />
              </FormField>
              <FormField label="Confirm new password" htmlFor="pw-confirm">
                <Input
                  id="pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={pw.confirm}
                  onChange={e => setPw({ ...pw, confirm: e.target.value })}
                />
              </FormField>
              <div>
                <Button onClick={changePassword} loading={saving === 'password'} disabled={!pw.current || !pw.next}>
                  Change password
                </Button>
              </div>
            </div>
          </Card>
        </div>
        <div className={`${s.s7} ${s.stack}`}>
          <Card>
            <CardHeader title="Notifications" subtitle="Which notifications you receive in the app" />
            {prefs ? (
              <div className={s.stack}>
                <Switch
                  label="Recommendations (critical and high priority)"
                  checked={prefs.recommendations}
                  onCheckedChange={v => savePrefs('recommendations', v)}
                  disabled={saving === 'prefs'}
                />
                <Switch
                  label="Risk alerts (level changes)"
                  checked={prefs.alerts}
                  onCheckedChange={v => savePrefs('alerts', v)}
                  disabled={saving === 'prefs'}
                />
                <Switch
                  label="Weather"
                  checked={prefs.weather}
                  onCheckedChange={v => savePrefs('weather', v)}
                  disabled={saving === 'prefs'}
                />
                <Switch
                  label="System"
                  checked={prefs.system}
                  onCheckedChange={v => savePrefs('system', v)}
                  disabled={saving === 'prefs'}
                />
              </div>
            ) : (
              <Skeleton height={120} />
            )}
          </Card>
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
    'An XGBoost model trained on 28,242 country-level FAOSTAT records uses 7 inputs (crop, region, year, rainfall, temperature, pesticides and growing period) to estimate yield per hectare, with a P10–P90 range. Field conditions such as soil and irrigation add risk flags but do not change the estimate.',
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
  [
    'NDVI',
    'Normalised Difference Vegetation Index, 0–1. In this dataset it is derived from the yield itself, so it is shown for reference and not used by the model.',
  ],
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
              <li>
                You enter the model inputs: crop, region, season year, rainfall, temperature, pesticides and growing
                period.
              </li>
              <li>The inputs are encoded exactly as during training.</li>
              <li>
                The XGBoost model adds up many small decision trees; the P10–P90 range comes from its errors on
                2009–2013, years it never saw in training.
              </li>
              <li>
                You get yield in kg/ha with a likely range, a productivity class, and a risk rating from any field
                conditions you add.
              </li>
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
