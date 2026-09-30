import { beforeEach, describe, expect, it } from 'vitest';
import type { PredictionInput, PredictionResult } from '../api/types';
import {
  clearRecent,
  deleteRecent,
  isRecHidden,
  listRecent,
  RECENT_LIMIT,
  readRecStates,
  saveRecent,
  setRecState,
} from './localStore';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

const input = { crop_type: 'Rice', region: 'India' } as PredictionInput;
const result = { predicted_yield_kg_ha: 4000, productivity_rating: 'Medium', risk_rating: 'Low' } as PredictionResult;

beforeEach(() => {
  Object.assign(globalThis, { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });
});

describe('recent predictions', () => {
  it('saves newest first per user and caps the list', () => {
    for (let i = 0; i < RECENT_LIMIT + 3; i++)
      saveRecent('farmer', { input, result: { ...result, predicted_yield_kg_ha: i } });
    const list = listRecent('farmer');
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0].result.predicted_yield_kg_ha).toBe(RECENT_LIMIT + 2);
    expect(listRecent('admin')).toEqual([]);
  });

  it('deletes and clears', () => {
    const a = saveRecent('farmer', { input, result });
    saveRecent('farmer', { input, result });
    deleteRecent('farmer', a.id);
    expect(listRecent('farmer').some(p => p.id === a.id)).toBe(false);
    clearRecent('farmer');
    expect(listRecent('farmer')).toEqual([]);
  });
});

describe('recommendation state', () => {
  it('hides dismissed and currently snoozed items only', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isRecHidden(undefined, now)).toBe(false);
    expect(isRecHidden({ status: 'dismissed' }, now)).toBe(true);
    expect(isRecHidden({ status: 'snoozed', until: '2026-01-02T00:00:00Z' }, now)).toBe(true);
    expect(isRecHidden({ status: 'snoozed', until: '2025-12-31T00:00:00Z' }, now)).toBe(false);
  });

  it('persists per user', () => {
    setRecState('farmer', 'r1', { status: 'dismissed' });
    expect(readRecStates('farmer').r1.status).toBe('dismissed');
    setRecState('farmer', 'r1', null);
    expect(readRecStates('farmer').r1).toBeUndefined();
  });
});
