import type { Explanation } from '../api/types';
import { formatNumber } from '../lib/format';
import { Card, CardHeader } from './ui';

const LABELS: Record<string, string> = {
  crop_type: 'Crop',
  region: 'Region',
  year: 'Season',
  rainfall_mm: 'Rainfall',
  temperature_C: 'Temperature',
  pesticide_usage_ml: 'Pesticides',
  yield_lag1: 'Last season’s yield',
  yield_mean3: '3-season average yield',
};

function valueText(feature: string, value: unknown): string {
  if (value == null) return 'no history';
  if (typeof value === 'number') {
    if (feature === 'rainfall_mm') return `${formatNumber(value)} mm`;
    if (feature === 'temperature_C') return `${formatNumber(value, 1)} °C`;
    if (feature.startsWith('yield_')) return `${formatNumber(value)} kg/ha`;
    if (feature === 'year') return String(value);
    return formatNumber(value);
  }
  return String(value);
}

/** "Why this prediction": exact per-input contributions (TreeSHAP) from the served model. */
export function ExplanationCard({ explanation }: { explanation: Explanation }) {
  const pct = explanation.unit === 'percent';
  const items = explanation.contributions.map(c => ({
    ...c,
    effect: (pct ? c.contribution_pct : c.contribution_kg_ha) ?? 0,
  }));
  const max = Math.max(...items.map(i => Math.abs(i.effect)), 1e-9);
  return (
    <Card>
      <CardHeader
        title="Why this prediction"
        subtitle={`Starting from the model’s average of ${formatNumber(explanation.base_kg_ha)} kg/ha, each input moves the estimate ${pct ? 'up or down by the percentage shown' : 'by the amount shown'}.`}
        info="Exact contributions computed by the XGBoost model itself (TreeSHAP). They explain the model, not the field: a large effect means the model relies on that input, not that changing it on your farm would change the harvest by that much."
      />
      <ul
        aria-label="Contribution of each input"
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}
      >
        {items.map(i => {
          const up = i.effect >= 0;
          const width = `${(Math.abs(i.effect) / max) * 50}%`;
          return (
            <li
              key={i.feature}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(120px, 1.1fr) 2fr minmax(70px, auto)',
                gap: 'var(--space-3)',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 'var(--text-sm)' }}>
                {LABELS[i.feature] ?? i.feature}
                <span style={{ display: 'block', color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
                  {valueText(i.feature, i.value)}
                </span>
              </span>
              <span
                aria-hidden="true"
                style={{ position: 'relative', height: 10, background: 'var(--surface-2)', borderRadius: 5 }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: -2,
                    bottom: -2,
                    width: 1,
                    background: 'var(--border-strong, var(--border))',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    borderRadius: 5,
                    width,
                    left: up ? '50%' : undefined,
                    right: up ? undefined : '50%',
                    background: up ? 'var(--success)' : 'var(--danger)',
                  }}
                />
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 'var(--text-sm)',
                  color: up ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {up ? '+' : '−'}
                {pct ? `${formatNumber(Math.abs(i.effect), 1)}%` : `${formatNumber(Math.abs(i.effect))} kg/ha`}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
