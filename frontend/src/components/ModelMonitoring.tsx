import { useModelMonitoring } from '../hooks/queries';
import { formatCount, formatNumber, formatPercent } from '../lib/format';
import { Badge, Banner, Card, CardHeader, DataTable, Skeleton } from './ui';

const LEVEL_TONE = { stable: 'success', watch: 'warning', drifted: 'danger', not_enough_data: 'neutral' } as const;

/** Model registry (every trained version) and input drift of recent predictions. */
export function ModelMonitoringCard() {
  const q = useModelMonitoring();
  const d = q.data;
  if (q.isLoading) return <Skeleton height={200} />;
  if (!d) return null;
  return (
    <Card>
      <CardHeader
        title="Model registry & monitoring"
        subtitle={`Served: v${d.served_version}. Drift compares the last ${d.drift.window_days} days of prediction inputs with the training data.`}
        info="Population Stability Index (PSI) per input: below 0.1 stable, 0.1–0.25 watch, above 0.25 drifted. Retraining runs in GitHub Actions and must pass the validation gate before a new model is committed."
      />
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {d.retrain_recommended ? (
          <Banner tone="warning">Retraining recommended: {d.reasons.join(' ')}</Banner>
        ) : (
          <Banner tone="success">No retraining needed right now.</Banner>
        )}
        <DataTable
          caption="Trained model versions"
          compact
          rowKey={r => r.version}
          rows={[...d.registry].reverse()}
          columns={[
            {
              key: 'v',
              header: 'Version',
              render: r => (
                <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  v{r.version} {r.served && <Badge tone="model">Served</Badge>}
                </span>
              ),
            },
            { key: 'm', header: 'Model', render: r => `${r.model} (${r.target})` },
            {
              key: 'd',
              header: 'Data',
              render: r => `${formatCount(r.data_rows)} rows, ${r.data_first_year}–${r.data_last_year}`,
            },
            { key: 'r2', header: 'R²', align: 'right', render: r => formatNumber(r.metrics.r2, 3) },
            { key: 'mae', header: 'MAE', align: 'right', render: r => `${formatCount(r.metrics.mae)} kg/ha` },
            { key: 'mape', header: 'MAPE', align: 'right', render: r => formatPercent(r.metrics.mape) },
            {
              key: 'cov',
              header: 'P10–P90 coverage',
              align: 'right',
              render: r =>
                r.heldout_interval_coverage == null ? '—' : formatPercent(r.heldout_interval_coverage * 100),
            },
            { key: 'split', header: 'Test', render: r => r.test_split ?? '—' },
          ]}
        />
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ fontSize: 'var(--text-sm)' }}>Input drift</strong>
          <Badge tone={LEVEL_TONE[d.drift.status]}>
            {d.drift.status === 'not_enough_data'
              ? `Needs ${d.drift.min_predictions} predictions (${d.drift.predictions} so far)`
              : d.drift.status}
          </Badge>
          {d.drift.features.map(f => (
            <Badge key={f.feature} tone={LEVEL_TONE[f.level]}>
              {f.feature}:{' '}
              {f.psi != null ? `PSI ${formatNumber(f.psi, 2)}` : `${formatPercent((f.unseen_share ?? 0) * 100)} unseen`}
            </Badge>
          ))}
        </div>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>{d.retraining}</p>
      </div>
    </Card>
  );
}
