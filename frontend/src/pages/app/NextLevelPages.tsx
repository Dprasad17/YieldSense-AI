import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Camera, Leaf, Send, Trash2, Upload } from 'lucide-react';
import { diseaseApi } from '../../api/endpoints';
import type { LeafResult } from '../../api/types';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  FormField,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';
import { ErrorState } from '../../components/ui/States';
import {
  useAskAssistant,
  useAssistantHistory,
  useAssistantStatus,
  useClearAssistant,
  useCropEconomics,
  useFarms,
  useRegions,
} from '../../hooks/queries';
import { formatNumber, formatPercent } from '../../lib/format';
import { useGlobalFilters } from '../../store/filters';
import s from './app.module.css';

// ---------------------------------------------------------------- Ask YieldSense

const SUGGESTIONS = [
  'What should I do on my farms this week?',
  'Which of my crops has the highest risk, and why?',
  'How does my last prediction compare with the national trend?',
  'मेरी गेहूँ की फसल के लिए सबसे बड़ा जोखिम क्या है?',
];

export function AssistantPage() {
  const status = useAssistantStatus();
  const history = useAssistantHistory();
  const ask = useAskAssistant();
  const clear = useClearAssistant();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const messages = history.data ?? [];

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending]);

  const send = (message: string) => {
    const m = message.trim();
    if (!m || ask.isPending) return;
    setPending(m);
    setText('');
    ask.mutate({ message: m, page: 'Assistant' }, { onSettled: () => setPending(null) });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };
  const available = status.data?.available;

  return (
    <div className={s.page}>
      <PageHeader
        title="Ask YieldSense"
        description="An AI assistant that answers from your own farms, predictions, risks and tasks. Ask in any language."
        meta={
          <>
            {status.data?.provider && <Badge tone="model">{status.data.provider}</Badge>}
            <Badge>Uses your data only</Badge>
          </>
        }
        actions={
          messages.length > 0 && (
            <Button icon={Trash2} variant="ghost" onClick={() => clear.mutate()} loading={clear.isPending}>
              Clear chat
            </Button>
          )
        }
      />
      {status.data && !available && (
        <Banner tone="warning">
          The assistant needs a Groq API key on the server (GROQ_API_KEY). Everything else in the app works without it.
        </Banner>
      )}
      <Card>
        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            minHeight: 280,
            maxHeight: '58vh',
            overflowY: 'auto',
            padding: 'var(--space-1)',
          }}
        >
          {history.isLoading && <Skeleton height={80} />}
          {!history.isLoading && messages.length === 0 && !pending && (
            <EmptyState
              icon={Bot}
              title="Ask about your farms"
              description="Try one of these, or type your own question."
              action={
                <div className={s.chips}>
                  {SUGGESTIONS.map(q => (
                    <button key={q} type="button" className={s.chip} onClick={() => send(q)} disabled={!available}>
                      {q}
                    </button>
                  ))}
                </div>
              }
            />
          )}
          {messages.map((m, i) => (
            <Bubble key={`${m.created_at}-${i}`} role={m.role} text={m.content} />
          ))}
          {pending && (
            <>
              <Bubble role="user" text={pending} />
              <Bubble role="assistant" text="Thinking…" muted />
            </>
          )}
          <div ref={end} />
        </div>
        {ask.isError && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Banner tone="danger">{(ask.error as Error).message}</Banner>
          </div>
        )}
        <form onSubmit={onSubmit} className={s.row} style={{ marginTop: 'var(--space-4)', flexWrap: 'nowrap' }}>
          <label htmlFor="assistant-input" className="sr-only">
            Your question
          </label>
          <input
            id="assistant-input"
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={2000}
            placeholder={available ? 'Ask a question about your farms…' : 'Assistant unavailable'}
            disabled={!available}
            style={{
              flex: 1,
              minWidth: 0,
              height: 40,
              padding: '0 var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              font: 'inherit',
            }}
          />
          <Button
            type="submit"
            variant="primary"
            icon={Send}
            loading={ask.isPending}
            disabled={!available || !text.trim()}
          >
            Send
          </Button>
        </form>
        <p className={s.small} style={{ marginTop: 'var(--space-3)' }}>
          Answers come from an AI model using your platform data. Yields in YieldSense are national averages, not field
          measurements. Check important decisions with an agronomist.
        </p>
      </Card>
    </div>
  );
}

function Bubble({ role, text, muted }: { role: 'user' | 'assistant'; text: string; muted?: boolean }) {
  const mine = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: 'min(80ch, 88%)',
          whiteSpace: 'pre-wrap',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          background: mine ? 'var(--primary)' : 'var(--surface-2)',
          color: mine ? 'var(--on-primary, #fff)' : muted ? 'var(--muted)' : 'var(--ink)',
          border: mine ? 'none' : '1px solid var(--border)',
          fontSize: 'var(--text-md)',
        }}
      >
        <span className="sr-only">{mine ? 'You: ' : 'Assistant: '}</span>
        {text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Market & revenue

export function MarketPage() {
  const { filters } = useGlobalFilters();
  const regions = useRegions().data ?? [];
  const farms = useFarms({ page: 1, page_size: 100, mine: true }).data?.items ?? [];
  const [farmId, setFarmId] = useState<string>(filters.farm ?? '');
  const [region, setRegion] = useState<string>(filters.region || 'India');
  const q = useCropEconomics(farmId ? { farm_id: Number(farmId) } : { region });
  const d = q.data;
  const best = d?.items.find(i => i.revenue_usd_per_ha != null);
  const usd = (v: number | null | undefined) => (v == null ? '—' : `$${formatNumber(v)}`);

  return (
    <div className={s.page}>
      <PageHeader
        title="Market & revenue"
        description="Which crop pays most next season: the model’s yield forecast × FAOSTAT farm-gate prices."
        meta={d && <Badge tone="info">Season {d.season}</Badge>}
      />
      <Card>
        <div className={s.row}>
          <FormField label="Farm" htmlFor="mk-farm">
            <Select
              id="mk-farm"
              value={farmId}
              onChange={e => setFarmId(e.target.value)}
              placeholder="No farm (choose a region)"
              options={farms.map(f => ({ value: String(f.id), label: `${f.name} · ${f.region}` }))}
            />
          </FormField>
          {!farmId && (
            <FormField label="Region" htmlFor="mk-region">
              <Select id="mk-region" value={region} onChange={e => setRegion(e.target.value)} options={regions} />
            </FormField>
          )}
        </div>
      </Card>
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading && <Skeleton height={240} />}
      {d && (
        <>
          {best && (
            <Banner tone="success">
              In {d.region}, <strong>{best.crop}</strong> has the highest expected gross revenue:{' '}
              <strong>{usd(best.revenue_usd_per_ha)}/ha</strong> (P10–P90 {usd(best.revenue_low_usd_per_ha)}–
              {usd(best.revenue_high_usd_per_ha)})
              {best.revenue_usd_farm != null && d.area_ha
                ? ` · ${usd(best.revenue_usd_farm)} for ${formatNumber(d.area_ha, 1)} ha`
                : ''}
              .
            </Banner>
          )}
          <Card padded={false}>
            <div style={{ padding: 'var(--space-5) var(--space-5) 0' }}>
              <CardHeader
                title={`Expected revenue by crop, ${d.region}`}
                subtitle={d.note}
                info={d.price_source ?? undefined}
              />
            </div>
            <DataTable
              caption={`Expected revenue by crop in ${d.region}`}
              rowKey={r => r.crop}
              rows={d.items}
              columns={[
                { key: 'crop', header: 'Crop', render: r => <strong>{r.crop}</strong> },
                {
                  key: 'yield',
                  header: 'Forecast yield',
                  align: 'right',
                  render: r => `${formatNumber(r.predicted_yield_kg_ha)} kg/ha`,
                },
                {
                  key: 'price',
                  header: 'Price',
                  align: 'right',
                  render: r => (r.price_usd_per_tonne == null ? '—' : `$${formatNumber(r.price_usd_per_tonne)}/t`),
                },
                {
                  key: 'rev',
                  header: 'Revenue / ha',
                  align: 'right',
                  render: r => <strong>{usd(r.revenue_usd_per_ha)}</strong>,
                },
                {
                  key: 'range',
                  header: 'P10–P90',
                  align: 'right',
                  render: r => `${usd(r.revenue_low_usd_per_ha)}–${usd(r.revenue_high_usd_per_ha)}`,
                },
                ...(d.area_ha
                  ? [
                      {
                        key: 'farm',
                        header: 'Whole farm',
                        align: 'right' as const,
                        render: (r: (typeof d.items)[number]) => usd(r.revenue_usd_farm),
                      },
                    ]
                  : []),
                { key: 'basis', header: 'Price basis', render: r => <span className={s.small}>{r.price_basis}</span> },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Leaf check

export function LeafCheckPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<LeafResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const choose = (f: File | null) => {
    setResult(null);
    setError(null);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };
  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await diseaseApi.classify(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const top = result?.top[0];

  return (
    <div className={s.page}>
      <PageHeader
        title="Leaf check"
        description="Photograph one leaf and get a first check for 38 common diseases of 14 plants, with treatment guidance."
        meta={
          <>
            <Badge tone="model">MobileNetV2 · PlantVillage</Badge>
            <Badge>First check, not a diagnosis</Badge>
          </>
        }
      />
      <div className={s.grid}>
        <div className={s.s6}>
          <Card>
            <CardHeader title="Photo" subtitle="One leaf, filling the frame, in daylight, on a plain background" />
            <div className={s.stack}>
              {preview ? (
                <img
                  src={preview}
                  alt="Selected leaf"
                  style={{
                    width: '100%',
                    maxHeight: 320,
                    objectFit: 'contain',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-2)',
                  }}
                />
              ) : (
                <EmptyState
                  icon={Leaf}
                  title="No photo yet"
                  description="Take a photo with your phone camera or upload one."
                />
              )}
              <div className={s.row}>
                <label className={s.chip} style={{ cursor: 'pointer' }}>
                  <Camera size={16} aria-hidden="true" /> Take or choose photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={e => choose(e.target.files?.[0] ?? null)}
                  />
                </label>
                <Button variant="primary" icon={Upload} onClick={run} disabled={!file} loading={busy}>
                  Check leaf
                </Button>
              </div>
              {error && <Banner tone="danger">{error}</Banner>}
            </div>
          </Card>
        </div>
        <div className={s.s6}>
          <Card>
            <CardHeader title="Result" subtitle={result?.source} />
            {!result && !busy && <p className={s.muted}>The result appears here.</p>}
            {busy && <Skeleton height={160} />}
            {result && top && (
              <div className={s.stack}>
                <div className={s.row}>
                  <Badge tone={!result.confident ? 'warning' : result.healthy ? 'success' : 'danger'}>
                    {!result.confident ? 'Not sure' : result.healthy ? 'Healthy' : 'Disease suspected'}
                  </Badge>
                  <strong>
                    {top.plant}: {top.disease}
                  </strong>
                  <span className={s.small}>{formatPercent(top.probability * 100)} confidence</span>
                </div>
                <Banner tone={result.healthy && result.confident ? 'success' : 'info'}>{result.advice}</Banner>
                <ul className={s.list} aria-label="Most likely classes">
                  {result.top.map(t => (
                    <li key={t.label} className={s.between}>
                      <span>{t.label}</span>
                      <span className={s.num}>{formatPercent(t.probability * 100)}</span>
                    </li>
                  ))}
                </ul>
                <p className={s.small}>{result.note}</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
