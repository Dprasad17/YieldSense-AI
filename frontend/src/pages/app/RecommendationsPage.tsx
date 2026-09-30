import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, Eye, Radio, Thermometer, Wind, X, Zap } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  type Tone,
} from '../../components/ui';
import { ErrorState, SampleDataPill } from '../../components/ui/States';
import { useAuth } from '../../auth/context';
import { useRecommendationsHub } from '../../hooks/queries';
import { formatYield } from '../../lib/format';
import { isRecHidden, readRecStates, setRecState, type RecState } from '../../lib/localStore';
import { usePreferences } from '../../store/preferences';
import s from './app.module.css';

type Severity = 'critical' | 'high' | 'medium' | 'info';

interface Rec {
  id: string;
  severity: Severity;
  category: 'Irrigation' | 'Disease & pest';
  title: string;
  window: string;
  area: string;
  impactKgHa: number | null;
  impactText: string;
  evidence: string[];
  why: string;
  primary: string;
}

const SEVERITY: Record<Severity, { label: string; tone: Tone; color: string }> = {
  critical: { label: 'Critical', tone: 'danger', color: 'var(--danger)' },
  high: { label: 'High', tone: 'warning', color: 'var(--warning)' },
  medium: { label: 'Medium', tone: 'info', color: 'var(--info)' },
  info: { label: 'Info', tone: 'neutral', color: 'var(--border-strong)' },
};

/** "+0.92 t/Ha Yield Salvage Potential" → 920 kg/ha. Returns null when there is no yield figure. */
function parseImpact(text: string | undefined): number | null {
  const m = text?.match(/([+-]?[\d.]+)\s*(t|kg)\s*\/\s*ha/i);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2].toLowerCase() === 't' ? v * 1000 : v;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRecs(hub: Record<string, any> | undefined): Rec[] {
  if (!hub) return [];
  const out: Rec[] = [];
  const irr = hub.irrigation_dispatch;
  if (irr) {
    out.push({
      id: 'irrigation_dispatch',
      severity: 'critical',
      category: 'Irrigation',
      title: String(irr.title),
      window: 'Act within 36 hours',
      area: String(irr.affected_area ?? ''),
      impactKgHa: parseImpact(irr.yield_salvage),
      impactText: String(irr.yield_salvage ?? ''),
      evidence: [irr.telemetry_trigger, irr.target_threshold].filter(Boolean).map(String),
      why: String(irr.explanation ?? ''),
      primary: 'Dispatch pivot command',
    });
  }
  const spray = hub.spray_window;
  if (spray) {
    out.push({
      id: 'spray_window',
      severity: 'high',
      category: 'Disease & pest',
      title: String(spray.title),
      window: String(spray.window_status ?? ''),
      area: '',
      impactKgHa: parseImpact(spray.prevention_potential),
      impactText: String(spray.prevention_potential ?? ''),
      evidence: [],
      why: String(spray.explanation ?? ''),
      primary: 'Schedule spray',
    });
  }
  return out;
}

export function RecommendationsPage() {
  const { user } = useAuth();
  const { unit } = usePreferences();
  const q = useRecommendationsHub();
  const hub = q.data;
  const recs = useMemo(() => toRecs(hub), [hub]);
  const [states, setStates] = useState<Record<string, RecState>>(() => (user ? readRecStates(user.username) : {}));
  const [tab, setTab] = useState('all');
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Rec | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const update = (id: string, st: RecState | null) => {
    if (!user) return;
    setRecState(user.username, id, st);
    setStates(readRecStates(user.username));
  };

  const visible = recs.filter(r => showHidden || !isRecHidden(states[r.id]));
  const hiddenCount = recs.length - recs.filter(r => !isRecHidden(states[r.id])).length;
  const categories = Array.from(new Set(recs.map(r => r.category)));
  const counts = (Object.keys(SEVERITY) as Severity[]).map(k => ({ k, n: recs.filter(r => r.severity === k).length }));

  const doPrimary = () => {
    if (!confirm) return;
    setDispatching(true);
    // Simulated: there is no field hardware endpoint.
    window.setTimeout(() => {
      setDispatching(false);
      update(confirm.id, { status: 'done' });
      toast.success(`${confirm.primary}: request recorded`);
      setConfirm(null);
    }, 900);
  };

  const card = (r: Rec) => {
    const sev = SEVERITY[r.severity];
    const st = states[r.id];
    return (
      <Card key={r.id} as="article" className={s.severityCard} style={{ borderLeftColor: sev.color }}>
        <div className={s.stack}>
          <div className={s.row}>
            <Badge tone={sev.tone}>{sev.label}</Badge>
            <Badge>{r.category}</Badge>
            {r.window && (
              <span className={s.small} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <Clock size={12} aria-hidden="true" /> {r.window}
              </span>
            )}
            {st && (
              <Badge tone="info">
                {st.status === 'snoozed'
                  ? `Snoozed until ${new Date(st.until ?? '').toLocaleDateString()}`
                  : st.status === 'done'
                    ? 'Done'
                    : 'Dismissed'}
              </Badge>
            )}
          </div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>{r.title}</h2>
          {r.area && <span className={s.muted}>{r.area}</span>}
          <div className={s.num} style={{ color: r.impactKgHa ? 'var(--success)' : 'var(--ink)' }}>
            Expected impact:{' '}
            {r.impactKgHa != null ? `+${formatYield(r.impactKgHa, unit)} ${unit} yield protected` : r.impactText}
          </div>
          {r.evidence.length > 0 && (
            <div className={s.tile}>
              <div className={s.small} style={{ marginBottom: 'var(--space-1)' }}>
                Evidence
              </div>
              {r.evidence.map(e => (
                <p key={e} style={{ margin: 0 }}>
                  {e}
                </p>
              ))}
            </div>
          )}
          <button
            type="button"
            className={s.row}
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
          {openWhy === r.id && <p style={{ margin: 0, lineHeight: 'var(--leading-normal)' }}>{r.why}</p>}
          <div className={s.row}>
            <Button variant="primary" size="sm" icon={Zap} onClick={() => setConfirm(r)}>
              {r.primary}
            </Button>
            <Button
              size="sm"
              icon={Clock}
              onClick={() => {
                update(r.id, { status: 'snoozed', until: new Date(Date.now() + 3 * 864e5).toISOString() });
                toast('Snoozed for 3 days');
              }}
            >
              Snooze
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => {
                update(r.id, { status: 'dismissed' });
                toast('Dismissed');
              }}
            >
              Dismiss
            </Button>
            {st && (
              <Button size="sm" variant="ghost" onClick={() => update(r.id, null)}>
                Restore
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const list = (items: Rec[]) =>
    items.length ? (
      <div className={s.stack}>{items.map(card)}</div>
    ) : (
      <Card>
        <EmptyState
          icon={CheckCircle2}
          title="Nothing to act on"
          description="All recommendations in this view are done, snoozed or dismissed."
        />
      </Card>
    );

  const phen = hub?.phenology;
  const micro = hub?.microclimate;

  return (
    <div className={s.page}>
      <PageHeader
        title="Recommendations"
        description="Prioritised actions with timing, expected impact and the reasoning behind each one."
        meta={<SampleDataPill reason="The recommendations endpoint currently returns fixed example content." />}
        actions={
          hiddenCount > 0 ? (
            <Button icon={Eye} variant="ghost" onClick={() => setShowHidden(v => !v)}>
              {showHidden ? 'Hide' : 'Show'} snoozed & dismissed ({hiddenCount})
            </Button>
          ) : undefined
        }
      />

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
              <Skeleton height={220} />
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
                  label: `${c} (${visible.filter(r => r.category === c).length})`,
                  content: list(visible.filter(r => r.category === c)),
                })),
              ]}
            />
          )}
        </div>

        <aside className={`${s.s4} ${s.stack}`}>
          <Card>
            <CardHeader
              title="Growth stage"
              subtitle={phen?.stage_name ? `Current: ${phen.stage_name}` : 'Crop phenology'}
            />
            {phen ? (
              <ol className={s.timeline}>
                {(phen.completed as string[]).map(stage => (
                  <li key={stage}>
                    <span
                      className={s.tlDot}
                      style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                      aria-hidden="true"
                    />
                    <span className={s.muted}>{stage}</span> <Badge tone="success">Done</Badge>
                  </li>
                ))}
                <li>
                  <span
                    className={s.tlDot}
                    style={{ background: 'var(--warning)', borderColor: 'var(--warning)' }}
                    aria-hidden="true"
                  />
                  <strong>{String(phen.stage_name)}</strong> <Badge tone="warning">Now</Badge>
                  {phen.warning && (
                    <div className={s.small} style={{ color: 'var(--warning)' }}>
                      {String(phen.warning)}
                    </div>
                  )}
                </li>
                {(phen.future as string[]).map(stage => (
                  <li key={stage}>
                    <span className={s.tlDot} aria-hidden="true" />
                    <span className={s.muted}>{stage}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Skeleton height={200} />
            )}
          </Card>
          <Card>
            <CardHeader title="Field micro-climate" subtitle="Conditions behind these recommendations" />
            {micro ? (
              <div className={s.tileGrid}>
                <div className={s.tile}>
                  <div className={s.small} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Thermometer size={12} aria-hidden="true" /> Canopy temperature
                  </div>
                  <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                    {String(micro.canopy_temp)}
                  </div>
                  <div className={s.small} style={{ color: 'var(--danger)' }}>
                    {String(micro.canopy_threshold)}
                  </div>
                </div>
                <div className={s.tile}>
                  <div className={s.small} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Wind size={12} aria-hidden="true" /> Wind inversion
                  </div>
                  <div className={s.num} style={{ fontSize: 'var(--text-xl)' }}>
                    {String(micro.wind_inversion)}
                  </div>
                  <div className={s.small}>Delta-T {String(micro.delta_t)}</div>
                </div>
              </div>
            ) : (
              <Skeleton height={100} />
            )}
          </Card>
          <p className={s.small} style={{ margin: 0, display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
            <Radio size={12} aria-hidden="true" /> Example content from the recommendations service · not generated for
            your fields yet
          </p>
        </aside>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={v => !v && setConfirm(null)}
        title={confirm?.primary ?? ''}
        description={
          confirm
            ? `Record this action for “${confirm.title}”? No field equipment is connected, so this is logged for your records.`
            : ''
        }
        confirmLabel="Confirm"
        onConfirm={doPrimary}
        loading={dispatching}
      />
    </div>
  );
}
