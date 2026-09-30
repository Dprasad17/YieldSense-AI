import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEVERITY_TONE, timeAgo } from './notifications';

describe('timeAgo', () => {
  afterEach(() => vi.useRealTimers());

  it('formats recent times relative to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    expect(timeAgo('2026-09-30T11:59:30Z')).toBe('just now');
    expect(timeAgo('2026-09-30T11:45:00Z')).toBe('15 min ago');
    expect(timeAgo('2026-09-30T09:00:00Z')).toBe('3 h ago');
    expect(timeAgo('2026-09-20T09:00:00Z')).toBe(new Date('2026-09-20T09:00:00Z').toLocaleDateString());
  });

  it('never reports a future time as negative', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    expect(timeAgo('2026-09-30T12:05:00Z')).toBe('just now');
  });
});

describe('SEVERITY_TONE', () => {
  it('maps severities to badge tones', () => {
    expect(SEVERITY_TONE.critical).toBe('danger');
    expect(SEVERITY_TONE.medium).toBe('warning');
    expect(SEVERITY_TONE.info).toBe('info');
  });
});
