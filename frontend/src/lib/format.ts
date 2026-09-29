import { convertYield, type YieldUnit } from './units';

/** Shown in place of a value that is missing or not a finite number. */
export const EMPTY_VALUE = '—';

const LOCALE = 'en-US';

function isNum(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Thousands separators, fixed number of decimals. 28242 → "28,242". */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (!isNum(value)) return EMPTY_VALUE;
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Record / item counts. Always integers. */
export function formatCount(value: number | null | undefined): string {
  return formatNumber(isNum(value) ? Math.round(value) : value, 0);
}

/**
 * Yield value without unit, in the requested display unit.
 * kg/ha → integer ("4,312"); t/ha → 2 decimals ("4.31").
 */
export function formatYield(kgPerHa: number | null | undefined, unit: YieldUnit = 'kg/ha'): string {
  if (!isNum(kgPerHa)) return EMPTY_VALUE;
  const value = convertYield(kgPerHa, unit);
  return unit === 't/ha' ? formatNumber(value, 2) : formatNumber(value, 0);
}

/** Yield with unit suffix: "4,312 kg/ha" / "4.31 t/ha". */
export function formatYieldWithUnit(kgPerHa: number | null | undefined, unit: YieldUnit = 'kg/ha'): string {
  const v = formatYield(kgPerHa, unit);
  return v === EMPTY_VALUE ? v : `${v} ${unit}`;
}

/** Rainfall in whole millimetres: 1149.06 → "1,149 mm". */
export function formatRainfall(mm: number | null | undefined): string {
  const v = formatNumber(mm, 0);
  return v === EMPTY_VALUE ? v : `${v} mm`;
}

/** Temperature to 1 decimal: 24.53 → "24.5 °C". */
export function formatTemperature(celsius: number | null | undefined): string {
  const v = formatNumber(celsius, 1);
  return v === EMPTY_VALUE ? v : `${v} °C`;
}

/** Indices (NDVI, R², soil health) to 2 decimals: 0.6838 → "0.68". */
export function formatIndex(value: number | null | undefined): string {
  return formatNumber(value, 2);
}

/** A value already expressed as a percentage: 38.62 → "38.6%". */
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  const v = formatNumber(value, decimals);
  return v === EMPTY_VALUE ? v : `${v}%`;
}

/** A 0–1 ratio shown as a percentage: 0.3412 → "34.1%". */
export function formatRatioAsPercent(ratio: number | null | undefined, decimals = 1): string {
  return formatPercent(isNum(ratio) ? ratio * 100 : ratio, decimals);
}

/** Signed change for deltas: 8.2 → "+8.2%", -3 → "−3.0%". Uses a real minus sign. */
export function formatDeltaPercent(value: number | null | undefined, decimals = 1): string {
  if (!isNum(value)) return EMPTY_VALUE;
  const abs = formatNumber(Math.abs(value), decimals);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return `${abs}%`;
}

/** Latency in ms: < 10 ms keeps 1 decimal, otherwise integer. */
export function formatLatency(ms: number | null | undefined): string {
  if (!isNum(ms)) return EMPTY_VALUE;
  return `${formatNumber(ms, ms < 10 ? 1 : 0)} ms`;
}

/** "1–15 of 28,242" range text for paginated tables. */
export function formatRange(page: number, pageSize: number, total: number): string {
  if (total <= 0) return `0 of 0`;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `${formatCount(start)}–${formatCount(end)} of ${formatCount(total)}`;
}
