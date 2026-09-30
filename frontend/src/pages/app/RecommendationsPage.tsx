import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, ChevronDown, ChevronUp, ClipboardPlus, Clock, Sparkles, X } from 'lucide-react';
import { errorMessage } from '../../api/client';
import type { Recommendation, RecommendationAction } from '../../api/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  FormField,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Tabs,
  type Tone,
} from '../../components/ui';
import { ErrorState } from '../../components/ui/States';
import { contextQuery, useFarms, useRecommendationAction, useRecommendationsHub } from '../../hooks/queries';
import { formatCount, formatNumber, formatPercent, formatYield } from '../../lib/format';
import { useGlobalFilters } from '../../store/filters';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';

type Severity = Recommendation['severity'];

const SEVERITY: Record<Severity, { label: string; tone: Tone; color: string }> = {
  critical: { label: 'Critical', tone: 'danger', color: 'var(--danger)' },
  high: { label: 'High', tone: 'warning', color: 'var(--warning)' },
  medium: { label: 'Medium', tone: 'info', color: 'var(--info)' },
  info: { label: 'Info', tone: 'neutral', color: 'var(--border-strong)' },
};

const CATEGORY: Record<Recommendation['category'], string> = {
  irrigation: 'Irrigation',
  disease_pest: 'Disease & pest',
  fertilizer: 'Fertilizer',
  crop_planning: 'Crop planning',
  best_practices: 'Best practices',
};

const STATUS_LABEL = { open: 'Task open', done: 'Done', dismissed: 'Dismissed', snoozed: 'Snoozed' } as const;

type View = 'active' | 'all';

export function RecommendationsPage() {
  const { unit } = usePreferences();
  const { filters, setFilters } = useGlobalFilters();
  const [params] = useSearchParams();
  const farms = useFarms({ page: 1, page_size: 100, mine: true }).data?.items ?? [];
  const q = useRecommendationsHub(contextQuery(filters));
  const act = useRecommendationAction();
  const hub = q.data;
  const [tab, setTab] = useState(() => params.get('category') ?? 'all');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [view, setView] = useState<View>('active');
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Recommendation | null>(null);

  const recs = useMemo(() => hub?.recommendations ?? [], [hub]);
  const isActive = (r: Recommendation) =>
    !r.task ||
    r.task.status === 'open' ||
    (r.task.status === 'snoozed' && !!r.task.snooze_until && new Date(r.task.snooze_until) < new Date());
  const visible = (view === 'active' ? recs.filter(isActive) : recs).filter(
    r => severity === 'all' || r.severity === severity,
  );
  const categories = Array.from(
    new Set([...recs.map(r => r.category), ...(tab in CATEGORY ? [tab as Recommendation['category']] : [])]),
  );
  const provenance = recs[0]?.rationale_source;
  const live = !!provenance?.startsWith('Groq');

  const run = async (r: Recommendation, action: RecommendationAction) => {
    try {
      const res = await act.mutateAsync({ id: r.id, action, snooze_days: 3 });
      toast.success(res.message);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const card = (r: Recommendation) => {
    const sev = SEVERITY[r.severity];
    return (
      <Card key={r.id} as="article" className={s.severityCard} style={{ borderLeftColor: sev.color }}>
        <div className={s.stack}>
          <div className={s.row}>
            <Badge tone={sev.tone}>{sev.label}</Badge>
            <Badge>{CATEGORY[r.category]}</Badge>
            <span className={s.small} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <Clock size={12} aria-hidden="true" /> Due in {r.deadline_days} days · {r.deadline}
            </span>
            <Badge tone={r.rationale_source.startsWith('Groq') ? 'model' : 'neutral'} title={r.rationale_source}>
              {r.rationale_source.startsWith('Groq') ? 'AI rationale' : 'Rule-based rationale (fallback)'}
            </Badge>
            {r.task && (
              <Badge tone="info">
                {STATUS_LABEL[r.task.status]}
                {r.task.status === 'snoozed' && r.task.snooze_until
                  ? ` until ${new Date(r.task.snooze_until).toLocaleDateString()}`
                  : ''}
              </Badge>
            )}
          </div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>{r.title}</h2>
          <span className={s.muted}>{r.affected_area}</span>
          <p style={{ margin: 0 }}>{r.action}</p>
          <div
            className={s.num}
            style={{ color: (r.impact_kg_ha ?? 0) > 0 ? 'var(--success)' : 'var(--muted)' }}
            title={r.impact_basis}
          >
            {r.impact_kg_ha == null ? (
              <>Impact not estimated: this column isn’t a model input (synthetic in the dataset).</>
            ) : (
              <>
                Expected impact: {r.impact_kg_ha > 0 ? '+' : ''}
                {formatYield(r.impact_kg_ha, unit)} {unit} on affected records
              </>
            )}
          </div>
          <div className={s.tile}>
            <div className={s.small} style={{ marginBottom: 'var(--space-1)' }}>
              Evidence
            </div>
            {r.evidence.map(e => (
              <p key={e.label} style={{ margin: 0 }}>
                <strong>{e.label}:</strong>{' '}
                <span className={s.num}>
                  {formatNumber(e.observed, 2)}
                  {e.unit}
                </span>{' '}
                median vs optimal{' '}
                <span className={s.num}>
                  {formatNumber(e.optimal_low, 2)}–{formatNumber(e.optimal_high, 2)}
                  {e.unit}
                </span>{' '}
                · {formatPercent(e.share_affected * 100)} of records affected
              </p>
            ))}
          </div>
          <button
            type="button"
            style={{
              all: 'unset',
              cursor: 'pointer',
              color: 'var(--primary)',
              fontSize: 'var(--text-sm)',
              display: 'inline-flex',
              gap: 4,
              alignItems: 'center',
              width: 'fit-content',
            }}
            aria-expanded={openWhy === r.id}
            onClick={() => setOpenWhy(openWhy === r.id ? null : r.id)}
          >
            Why this recommendation{' '}
            {openWhy === r.id ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
          </button>
          {openWhy === r.id && (
            <div>
              <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>{r.rationale}</p>
              <p className={s.small} style={{ margin: 'var(--space-1) 0 0' }}>
                {r.rationale_source.startsWith('Groq')
                  ? `AI rationale · ${r.rationale_source}`
                  : `Rule-based rationale (${r.rationale_source}); AI text unavailable`}
              </p>
            </div>
          )}
          <div className={s.row}>
            <Button
              variant="primary"
              size="sm"
              icon={ClipboardPlus}
              onClick={() => setConfirm(r)}
              disabled={act.isPending}
            >
              {r.action_label}
            </Button>
            <Button size="sm" icon={Clock} onClick={() => run(r, 'snooze')} disabled={act.isPending}>
              Snooze
            </Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => run(r, 'dismiss')} disabled={act.isPending}>
              Dismiss
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={CheckCircle2}
              onClick={() => run(r, 'done')}
              disabled={act.isPending}
            >
              Mark done
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  const list = (items: Recommendation[]) =>
    items.length ? (
      <div className={s.stack}>{items.map(card)}</div>
    ) : (
      <Card>
        <EmptyState
          icon={CheckCircle2}
          title={recs.length ? 'Nothing to act on' : 'No issues found'}
          description={
            recs.length
              ? 'Everything here is done, snoozed or dismissed. Switch to “All” to see them.'
              : `Every checked median for ${hub?.scope ?? 'this context'} is inside its crop’s optimal band.`
          }
        />
      </Card>
    );

  const counts = (Object.keys(SEVERITY) as Severity[]).map(k => ({
    k,
    n: recs.filter(r => r.severity === k && isActive(r)).length,
  }));

  return (
    <div className={s.page}>
      <PageHeader
        title="Recommendations"
        description="Checks against the optimal ranges of top-yielding records, with model-estimated impact and the reasoning behind each one."
        meta={
          <>
            <Badge tone="info">
              {hub?.scope ?? `${filters.region || 'All regions'} · ${filters.crop || 'All crops'}`}
            </Badge>
            {hub && <Badge>{formatCount(hub.record_count)} records analysed</Badge>}
            {provenance && (
              <Badge tone={live ? 'model' : 'warning'} title={provenance}>
                {live
                  ? `Live AI rationale · ${provenance.replace('Groq · ', 'Groq ')}`
                  : 'AI unavailable · rule-based fallback'}
              </Badge>
            )}
          </>
        }
        actions={
          <SegmentedControl<View>
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      />

      <Card>
        <div className={s.row} style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <FormField label="Farm" htmlFor="rec-farm">
              <Select
                id="rec-farm"
                value={filters.farm}
                onChange={e => {
                  const f = farms.find(x => String(x.id) === e.target.value);
                  setFilters(f ? { farm: String(f.id), region: f.region, crop: f.crops[0] ?? '' } : { farm: '' });
                }}
                options={farms.map(f => ({ value: String(f.id), label: `${f.name} · ${f.region}` }))}
                placeholder="Reference dataset (no farm)"
              />
            </FormField>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <FormField label="Severity" htmlFor="rec-sev">
              <Select
                id="rec-sev"
                value={severity === 'all' ? '' : severity}
                onChange={e => setSeverity((e.target.value || 'all') as Severity | 'all')}
                options={(Object.keys(SEVERITY) as Severity[]).map(k => ({ value: k, label: SEVERITY[k].label }))}
                placeholder="All severities"
              />
            </FormField>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <FormField label="Category" htmlFor="rec-cat">
              <Select
                id="rec-cat"
                value={tab === 'all' ? '' : tab}
                onChange={e => setTab(e.target.value || 'all')}
                options={(Object.keys(CATEGORY) as Recommendation['category'][]).map(k => ({
                  value: k,
                  label: CATEGORY[k],
                }))}
                placeholder="All categories"
              />
            </FormField>
          </div>
        </div>
      </Card>

      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      <div className={s.kpis}>
        {counts.map(({ k, n }) => (
          <Card key={k}>
            <div className={s.between}>
              <Badge tone={SEVERITY[k].tone}>{SEVERITY[k].label}</Badge>
              <span className={s.num} style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-semibold)' }}>
                {q.isPending ? '—' : n}
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div className={s.grid}>
        <div className={s.s8}>
          {q.isPending ? (
            <Card>
              <Skeleton height={260} />
            </Card>
          ) : (
            <Tabs
              label="Recommendation categories"
              value={tab}
              onValueChange={setTab}
              tabs={[
                { value: 'all', label: `All (${visible.length})`, content: list(visible) },
                ...categories.map(c => ({
                  value: c,
                  label: `${CATEGORY[c]} (${visible.filter(r => r.category === c).length})`,
                  content: list(visible.filter(r => r.category === c)),
                })),
              ]}
            />
          )}
        </div>

        <aside className={`${s.s4} ${s.stack}`}>
          <Card>
            <CardHeader
              title="Crop cycle"
              subtitle={
                hub?.crop_cycle
                  ? `${hub.crop_cycle.crop} · about ${hub.crop_cycle.median_days} days`
                  : 'Pick a crop to see its growth stages'
              }
            />
            {hub?.crop_cycle ? (
              <>
                <ol className={s.timeline}>
                  {hub.crop_cycle.stages.map(st => (
                    <li key={st.name}>
                      <span className={s.tlDot} aria-hidden="true" />
                      <strong>{st.name}</strong>{' '}
                      <span className={`${s.num} ${s.small}`}>
                        day {st.start_day}–{st.end_day}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className={s.small} style={{ margin: 0 }}>
                  {hub.crop_cycle.source}
                </p>
              </>
            ) : q.isPending ? (
              <Skeleton height={160} />
            ) : (
              <p className={s.muted} style={{ margin: 0 }}>
                Choose a crop in the context bar.
              </p>
            )}
          </Card>
          <Card>
            <CardHeader title="Context climate" subtitle={hub?.context?.source} />
            {hub?.context ? (
              <dl className={s.dl}>
                <dt>Temperature</dt>
                <dd>{formatNumber(hub.context.temperature_C, 1)} °C</dd>
                <dt>Rainfall</dt>
                <dd>{formatNumber(hub.context.rainfall_mm, 0)} mm</dd>
                <dt>Humidity</dt>
                <dd>{formatPercent(hub.context.humidity_percent)}</dd>
                <dt>Sunlight</dt>
                <dd>{formatNumber(hub.context.sunlight_hours, 1)} h/day</dd>
              </dl>
            ) : (
              <Skeleton height={120} />
            )}
          </Card>
          {provenance && (
            <p className={s.small} style={{ margin: 0, display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
              <Sparkles size={12} aria-hidden="true" /> Rationale by {provenance}. Field tasks are tracked in
              YieldSense; nothing is sent to equipment.
            </p>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={v => !v && setConfirm(null)}
        title={confirm?.action_label ?? ''}
        description={confirm ? `Create a field task for “${confirm.title}”, due ${confirm.deadline}?` : ''}
        confirmLabel="Create task"
        loading={act.isPending}
        onConfirm={async () => {
          if (confirm) await run(confirm, 'create_task');
          setConfirm(null);
        }}
      />
    </div>
  );
}
