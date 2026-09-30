import type { ColumnProvenance } from '../api/types';
import { Badge, type Tone } from './ui';
import x from '../pages/app/extras.module.css';

const TONE: Record<ColumnProvenance['provenance'], Tone> = { real: 'success', synthetic: 'warning', derived: 'info' };
const SHORT: Record<ColumnProvenance['provenance'], string> = { real: 'R', synthetic: 'S', derived: 'D' };

/** "Real", "Synthetic" or "Derived" badge for a dataset column, with its origin as the tooltip. */
export function ProvenanceBadge({ entry, compact }: { entry: ColumnProvenance | undefined; compact?: boolean }) {
  if (!entry) return null;
  const label = entry.provenance[0].toUpperCase() + entry.provenance.slice(1);
  const title = `${label}: ${entry.origin}. ${entry.note}${entry.used_by_model ? ' Used by the model.' : ''}`;
  return (
    <Badge tone={TONE[entry.provenance]} title={title}>
      <span aria-hidden={compact ? 'true' : undefined}>{compact ? SHORT[entry.provenance] : label}</span>
      {compact && <span className="sr-only">{label}</span>}
    </Badge>
  );
}

export function ProvenanceLegend() {
  return (
    <span className={x.inlineRow}>
      <Badge tone="success">R · Real</Badge>
      <Badge tone="warning">S · Synthetic</Badge>
      <Badge tone="info">D · Derived</Badge>
    </span>
  );
}
