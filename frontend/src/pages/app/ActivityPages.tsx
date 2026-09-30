import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, CheckCheck, Cpu, GitCompare, History, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { errorMessage } from '../../api/client';
import { predictApi } from '../../api/endpoints';
import type { Notification, PredictionInput, PredictionRecord } from '../../api/types';
import { useAuth } from '../../auth/context';
import { SEVERITY_TONE, timeAgo } from '../../lib/notifications';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  PageHeader,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
  type Column,
} from '../../components/ui';
import { ratingTone } from '../../components/ui/helpers';
import { ErrorState } from '../../components/ui/States';
import {
  useDatasetSummary,
  useDeletePrediction,
  useFarms,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  usePredictionHistory,
  useRegions,
} from '../../hooks/queries';
import { formatDeltaPercent, formatYield } from '../../lib/format';
import { setPrefill } from '../../lib/localStore';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';

// ================================================================ Prediction history

const INPUT_ROWS: [keyof PredictionInput, string][] = [
  ['crop_type', 'Crop'],
  ['region', 'Region'],
  ['year', 'Season year'],
  ['rainfall_mm', 'Rainfall (mm)'],
  ['temperature_C', 'Temperature (°C)'],
  ['pesticide_usage_ml', 'Pesticides (index)'],
  ['total_days', 'Growing period (days)'],
  ['irrigation_type', 'Irrigation'],
  ['fertilizer_type', 'Fertilizer'],
  ['crop_disease_status', 'Disease status'],
  ['soil_pH', 'Soil pH'],
  ['soil_moisture_%', 'Soil moisture (%)'],
  ['humidity_%', 'Humidity (%)'],
  ['sunlight_hours', 'Sunlight (h/day)'],
];

const show = (v: unknown) => (v == null || v === '' ? '—' : String(v));

function modelLabel(p: PredictionRecord) {
  return `${p.model_name}${p.model_version ? ` v${p.model_version}` : ''}`;
}

/** Server-side prediction history: filter, compare two, re-run with the current model, delete. */
export function HistoryPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { unit } = usePreferences();
  const crops = useDatasetSummary().data?.crops_supported ?? [];
  const regions = useRegions().data ?? [];
  const farms = useFarms({ page: 1, page_size: 100, mine: true }).data?.items ?? [];
  const [page, setPage] = useState(1);
  const [crop, setCrop] = useState('');
  const [region, setRegion] = useState('');
  const [farm, setFarm] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [reruns, setReruns] = useState<Record<string, { value?: number; loading: boolean }>>({});
  const [confirmDelete, setConfirmDelete] = useState<PredictionRecord | null>(null);
  const q = usePredictionHistory({
    page,
    page_size: 20,
    crop: crop || undefined,
    region: region || undefined,
    farm_id: farm || undefined,
  });
  const del = useDeletePrediction();
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const [a, b] = picked.map(id => items.find(i => i.id === id)).filter(Boolean) as PredictionRecord[];

  const togglePick = (id: string) =>
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]));

  const rerun = async (p: PredictionRecord) => {
    setReruns(r => ({ ...r, [p.id]: { loading: true } }));
    try {
      const res = await predictApi.whatIf({ ...(p.inputs as PredictionInput), farm_id: undefined });
      setReruns(r => ({ ...r, [p.id]: { value: res.predicted_yield_kg_ha, loading: false } }));
    } catch (err) {
      setReruns(r => ({ ...r, [p.id]: { loading: false } }));
      toast.error(errorMessage(err));
    }
  };

  const canDelete = (p: PredictionRecord) => p.username === user?.username || role === 'Admin';
  const setFilter = (fn: () => void) => {
    fn();
    setPage(1);
    setPicked([]);
  };

  const columns: Column<PredictionRecord>[] = [
    {
      key: 'pick',
      header: 'Compare',
      render: p => (
        <input
          type="checkbox"
          aria-label={`Compare prediction from ${new Date(p.created_at).toLocaleString()}`}
          checked={picked.includes(p.id)}
          onChange={() => togglePick(p.id)}
          onClick={e => e.stopPropagation()}
        />
      ),
    },
    { key: 'date', header: 'Predicted', render: p => new Date(p.created_at).toLocaleString() },
    ...(role !== 'Farmer' ? [{ key: 'user', header: 'User', render: (p: PredictionRecord) => p.username }] : []),
    { key: 'crop', header: 'Crop', render: p => <Badge tone="success">{p.crop_type}</Badge> },
    { key: 'region', header: 'Region', render: p => p.region },
    { key: 'year', header: 'Year', align: 'right', render: p => show(p.year) },
    {
      key: 'yield',
      header: `Predicted (${unit})`,
      align: 'right',
      render: p => <strong className={s.num}>{formatYield(p.predicted_yield_kg_ha, unit)}</strong>,
    },
    {
      key: 'range',
      header: 'P10–P90',
      align: 'right',
      render: p => (
        <span className={s.num}>
          {formatYield(p.low_kg_ha, unit)}–{formatYield(p.high_kg_ha, unit)}
        </span>
      ),
    },
    {
      key: 'risk',
      header: 'Risk',
      render: p => <Badge tone={ratingTone(p.risk_rating, false)}>{p.risk_rating}</Badge>,
    },
    { key: 'model', header: 'Model', render: p => <span className={s.small}>{modelLabel(p)}</span> },
    {
      key: 'rerun',
      header: 'Re-run now',
      align: 'right',
      render: p => {
        const r = reruns[p.id];
        if (!r) return <span className={s.small}>—</span>;
        if (r.loading) return <Skeleton width={70} height={16} />;
        if (r.value == null) return <span className={s.small}>failed</span>;
        const delta = ((r.value - p.predicted_yield_kg_ha) / p.predicted_yield_kg_ha) * 100;
        return (
          <span className={s.num} title="Same inputs, current model">
            {formatYield(r.value, unit)}{' '}
            <Badge tone={Math.abs(delta) < 0.5 ? 'neutral' : delta > 0 ? 'success' : 'warning'}>
              {formatDeltaPercent(delta)}
            </Badge>
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: p => (
        <span className={s.row} style={{ gap: 'var(--space-1)', flexWrap: 'nowrap' }}>
          <Button size="sm" icon={RotateCcw} onClick={() => rerun(p)} loading={reruns[p.id]?.loading}>
            Re-run
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Pencil}
            onClick={() => {
              setPrefill(p.inputs as Partial<PredictionInput>);
              navigate('/app/predict');
            }}
          >
            Edit
          </Button>
          {canDelete(p) && (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              aria-label="Delete prediction"
              onClick={() => setConfirmDelete(p)}
            >
              Delete
            </Button>
          )}
        </span>
      ),
    },
  ];

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const filtered = !!(crop || region || farm);
  return (
    <div className={s.page}>
      <PageHeader
        title="Prediction history"
        description={
          role === 'Farmer'
            ? 'Every prediction you’ve run, saved on the server. Pick two to compare, or re-run one with the current model.'
            : 'Predictions from every user. Pick two to compare, or re-run one with the current model.'
        }
        meta={q.data ? <Badge>{q.data.total} predictions</Badge> : undefined}
      />
      <Card>
        <div className={s.row} style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <FormField label="Crop" htmlFor="h-crop">
              <Select
                id="h-crop"
                value={crop}
                onChange={e => setFilter(() => setCrop(e.target.value))}
                options={[...crops].sort()}
                placeholder="All crops"
              />
            </FormField>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <FormField label="Region" htmlFor="h-region">
              <Select
                id="h-region"
                value={region}
                onChange={e => setFilter(() => setRegion(e.target.value))}
                options={regions}
                placeholder="All regions"
              />
            </FormField>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <FormField label="Farm" htmlFor="h-farm">
              <Select
                id="h-farm"
                value={farm}
                onChange={e => setFilter(() => setFarm(e.target.value))}
                options={farms.map(f => ({ value: String(f.id), label: f.name }))}
                placeholder="Any farm"
              />
            </FormField>
          </div>
          {filtered && (
            <Button
              variant="ghost"
              icon={X}
              onClick={() =>
                setFilter(() => {
                  setCrop('');
                  setRegion('');
                  setFarm('');
                })
              }
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {a && b && (
        <Card>
          <CardHeader
            title="Comparison"
            subtitle="Differences are highlighted"
            actions={
              <Button size="sm" variant="ghost" icon={X} onClick={() => setPicked([])}>
                Clear
              </Button>
            }
          />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Prediction comparison">
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left' }}>
                    Field
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    A · {new Date(a.created_at).toLocaleDateString()}
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    B · {new Date(b.created_at).toLocaleDateString()}
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...INPUT_ROWS.map(
                    ([k, label]) => [label, show(a.inputs[k as string]), show(b.inputs[k as string])] as const,
                  ),
                  [
                    `Predicted (${unit})`,
                    formatYield(a.predicted_yield_kg_ha, unit),
                    formatYield(b.predicted_yield_kg_ha, unit),
                  ] as const,
                  [
                    'P10–P90',
                    `${formatYield(a.low_kg_ha, unit)}–${formatYield(a.high_kg_ha, unit)}`,
                    `${formatYield(b.low_kg_ha, unit)}–${formatYield(b.high_kg_ha, unit)}`,
                  ] as const,
                  ['Risk', a.risk_rating, b.risk_rating] as const,
                  ['Model', modelLabel(a), modelLabel(b)] as const,
                ].map(([label, va, vb]) => (
                  <tr
                    key={label}
                    style={{
                      background: va !== vb ? 'color-mix(in srgb, var(--warning) 12%, transparent)' : undefined,
                    }}
                  >
                    <th scope="row" style={{ textAlign: 'left', fontWeight: 500, padding: '4px 8px' }}>
                      {label}
                    </th>
                    <td className={s.num} style={{ textAlign: 'right', padding: '4px 8px' }}>
                      {va}
                    </td>
                    <td className={s.num} style={{ textAlign: 'right', padding: '4px 8px' }}>
                      {vb}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.small} style={{ margin: 'var(--space-2) 0 0' }}>
            B vs A:{' '}
            {formatDeltaPercent(((b.predicted_yield_kg_ha - a.predicted_yield_kg_ha) / a.predicted_yield_kg_ha) * 100)}
          </p>
        </Card>
      )}

      <Card>
        {picked.length === 1 && (
          <p className={s.small} style={{ marginTop: 0 }}>
            <GitCompare size={12} aria-hidden="true" /> Pick one more prediction to compare.
          </p>
        )}
        {q.isPending ? (
          <Skeleton height={320} />
        ) : items.length ? (
          <>
            <DataTable caption="Prediction history" columns={columns} rows={items} rowKey={p => p.id} />
            <Pagination page={page} pageSize={20} total={q.data.total} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon={History}
            title={filtered ? 'No predictions match these filters' : 'No predictions yet'}
            description={
              filtered ? 'Clear the filters to see all predictions.' : 'Every prediction you run is saved here.'
            }
            action={
              <Button variant="primary" icon={Cpu} onClick={() => navigate('/app/predict')}>
                Open Yield Predictor
              </Button>
            }
          />
        )}
      </Card>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={v => !v && setConfirmDelete(null)}
        title="Delete this prediction?"
        description="It will be removed from the history for everyone. This can’t be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={del.isPending}
        onConfirm={() => {
          if (!confirmDelete) return;
          del.mutate(confirmDelete.id, {
            onSuccess: () => {
              toast.success('Prediction deleted');
              setPicked(p => p.filter(x => x !== confirmDelete.id));
              setConfirmDelete(null);
            },
            onError: err => toast.error(errorMessage(err)),
          });
        }}
      />
    </div>
  );
}

// ================================================================ Notifications

type Cat = 'all' | Notification['category'];
const CATEGORIES: { value: Cat; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'alerts', label: 'Risk alerts' },
  { value: 'recommendations', label: 'Recommendations' },
  { value: 'weather', label: 'Weather' },
  { value: 'system', label: 'System' },
];

export function NotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState<'all' | 'unread'>('all');
  const [category, setCategory] = useState<Cat>('all');
  const q = useNotifications({
    page,
    page_size: 20,
    unread_only: unreadOnly === 'unread' || undefined,
    category: category === 'all' ? undefined : category,
  });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const items = q.data?.items ?? [];

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className={s.page}>
      <PageHeader
        title="Notifications"
        description="Risk alerts and high-priority recommendations for the contexts you’ve looked at."
        meta={
          q.data ? (
            <Badge tone={q.data.unread_count ? 'warning' : 'neutral'}>{q.data.unread_count} unread</Badge>
          ) : undefined
        }
        actions={
          <Button
            icon={CheckCheck}
            disabled={!q.data?.unread_count}
            loading={markAll.isPending}
            onClick={() => markAll.mutate(undefined, { onSuccess: r => toast.success(`Marked ${r.updated} as read`) })}
          >
            Mark all read
          </Button>
        }
      />
      <Card>
        <div className={s.row}>
          <SegmentedControl<'all' | 'unread'>
            label="Read state"
            value={unreadOnly}
            onChange={v => {
              setUnreadOnly(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
            ]}
          />
          <SegmentedControl<Cat>
            label="Category"
            value={category}
            onChange={v => {
              setCategory(v);
              setPage(1);
            }}
            options={CATEGORIES}
          />
        </div>
      </Card>
      <Card>
        {q.isPending ? (
          <Skeleton height={300} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly === 'unread' ? 'No unread notifications' : 'No notifications'}
            description="Alerts appear when a risk reaches High or Critical, or a recommendation is critical or high, in a context you open."
          />
        ) : (
          <>
            <ul className={s.stack} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map(n => (
                <li
                  key={n.id}
                  className={s.tile}
                  style={{ borderLeft: n.read ? undefined : '3px solid var(--primary)' }}
                >
                  <div className={s.between}>
                    <span className={s.row} style={{ gap: 'var(--space-2)' }}>
                      <Badge tone={SEVERITY_TONE[n.severity] ?? 'neutral'}>{n.severity}</Badge>
                      <Badge>{n.category}</Badge>
                      <span className={s.small}>{timeAgo(n.created_at)}</span>
                    </span>
                    <span className={s.row} style={{ gap: 'var(--space-1)' }}>
                      {n.link && (
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!n.read) markRead.mutate({ id: n.id, read: true });
                            navigate(n.link as string);
                          }}
                        >
                          Open
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => markRead.mutate({ id: n.id, read: !n.read })}>
                        {n.read ? 'Mark unread' : 'Mark read'}
                      </Button>
                    </span>
                  </div>
                  <strong style={{ display: 'block', marginTop: 'var(--space-1)' }}>
                    {!n.read && <span className="sr-only">Unread: </span>}
                    {n.title}
                  </strong>
                  <span className={s.muted}>{n.body}</span>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={20} total={q.data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
