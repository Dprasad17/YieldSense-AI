import { describe, expect, it } from 'vitest';
import {
  EMPTY_VALUE,
  formatCount,
  formatDeltaPercent,
  formatIndex,
  formatLatency,
  formatNumber,
  formatPercent,
  formatRainfall,
  formatRange,
  formatRatioAsPercent,
  formatTemperature,
  formatYield,
  formatYieldWithUnit,
} from './format';
import { convertYield, isYieldUnit } from './units';

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(28242)).toBe('28,242');
    expect(formatNumber(1234567.891, 2)).toBe('1,234,567.89');
  });

  it('returns the empty marker for missing or non-finite values', () => {
    expect(formatNumber(null)).toBe(EMPTY_VALUE);
    expect(formatNumber(undefined)).toBe(EMPTY_VALUE);
    expect(formatNumber(Number.NaN)).toBe(EMPTY_VALUE);
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe(EMPTY_VALUE);
  });
});

describe('yield formatting', () => {
  it('shows kg/ha as integers', () => {
    expect(formatYield(7705.33)).toBe('7,705');
    expect(formatYield(4312.45, 'kg/ha')).toBe('4,312');
  });

  it('converts to t/ha with 2 decimals', () => {
    expect(formatYield(7705.33, 't/ha')).toBe('7.71');
    expect(formatYieldWithUnit(19980.15, 't/ha')).toBe('19.98 t/ha');
  });

  it('appends the unit', () => {
    expect(formatYieldWithUnit(3829.5)).toBe('3,830 kg/ha');
    expect(formatYieldWithUnit(null)).toBe(EMPTY_VALUE);
  });

  it('convertYield and isYieldUnit', () => {
    expect(convertYield(2500, 't/ha')).toBe(2.5);
    expect(convertYield(2500, 'kg/ha')).toBe(2500);
    expect(isYieldUnit('t/ha')).toBe(true);
    expect(isYieldUnit('lb/ac')).toBe(false);
  });
});

describe('other units', () => {
  it('rainfall is whole millimetres', () => {
    expect(formatRainfall(1149.06)).toBe('1,149 mm');
    expect(formatRainfall(1083)).toBe('1,083 mm');
  });

  it('temperature has 1 decimal', () => {
    expect(formatTemperature(20.54)).toBe('20.5 °C');
  });

  it('indices have 2 decimals', () => {
    expect(formatIndex(0.6838)).toBe('0.68');
    expect(formatIndex(0.9447)).toBe('0.94');
  });

  it('percentages have 1 decimal', () => {
    expect(formatPercent(38.62)).toBe('38.6%');
    expect(formatRatioAsPercent(0.7017)).toBe('70.2%');
  });

  it('deltas carry a sign', () => {
    expect(formatDeltaPercent(8.24)).toBe('+8.2%');
    expect(formatDeltaPercent(-3)).toBe('−3.0%');
    expect(formatDeltaPercent(0)).toBe('0.0%');
  });

  it('latency', () => {
    expect(formatLatency(1.035)).toBe('1.0 ms');
    expect(formatLatency(27.062)).toBe('27 ms');
  });

  it('count rounds', () => {
    expect(formatCount(28241.6)).toBe('28,242');
  });
});

describe('formatRange', () => {
  it('describes the visible slice', () => {
    expect(formatRange(1, 15, 28242)).toBe('1–15 of 28,242');
    expect(formatRange(1883, 15, 28242)).toBe('28,231–28,242 of 28,242');
  });

  it('handles an empty result', () => {
    expect(formatRange(1, 15, 0)).toBe('0 of 0');
  });
});
