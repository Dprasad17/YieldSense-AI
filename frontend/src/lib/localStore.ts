/**
 * Small per-user stores kept in this browser: recent predictions, recommendation
 * snooze/dismiss state, product-tour progress, and one-shot hand-offs between screens.
 */
import type { AIInsights, PredictionInput, PredictionResult } from '../api/types';

function readJson<T>(storage: 'local' | 'session', key: string, fallback: T): T {
  try {
    const raw = (storage === 'local' ? localStorage : sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage: 'local' | 'session', key: string, value: unknown) {
  try {
    const s = storage === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: feature degrades to in-memory for this view.
  }
}

// ---------------------------------------------------------------- Recent predictions

export const RECENT_LIMIT = 20;

export interface SavedPrediction {
  id: string;
  savedAt: string;
  input: PredictionInput;
  result: PredictionResult;
  insights?: AIInsights | null;
  modelName?: string | null;
}

const recentKey = (user: string) => `yieldsense_recent_${user.toLowerCase()}`;

export function listRecent(user: string): SavedPrediction[] {
  return readJson<SavedPrediction[]>('local', recentKey(user), []);
}

export function saveRecent(
  user: string,
  entry: Omit<SavedPrediction, 'id' | 'savedAt'>,
  now = new Date(),
): SavedPrediction {
  const saved: SavedPrediction = {
    ...entry,
    id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    savedAt: now.toISOString(),
  };
  writeJson('local', recentKey(user), [saved, ...listRecent(user)].slice(0, RECENT_LIMIT));
  return saved;
}

export function deleteRecent(user: string, id: string) {
  writeJson(
    'local',
    recentKey(user),
    listRecent(user).filter(p => p.id !== id),
  );
}

export function clearRecent(user: string) {
  writeJson('local', recentKey(user), null);
}

// ---------------------------------------------------------------- Recommendation actions

export interface RecState {
  status: 'snoozed' | 'dismissed' | 'done';
  until?: string;
}

const recKey = (user: string) => `yieldsense_rec_state_${user.toLowerCase()}`;

export function readRecStates(user: string): Record<string, RecState> {
  return readJson<Record<string, RecState>>('local', recKey(user), {});
}

export function setRecState(user: string, id: string, state: RecState | null) {
  const all = readRecStates(user);
  if (state) all[id] = state;
  else delete all[id];
  writeJson('local', recKey(user), all);
}

/** Active = not dismissed/done and not currently snoozed. */
export function isRecHidden(state: RecState | undefined, now = new Date()): boolean {
  if (!state) return false;
  if (state.status === 'snoozed') return !!state.until && new Date(state.until) > now;
  return true;
}

// ---------------------------------------------------------------- Tour

const tourKey = (user: string) => `yieldsense_tour_done_${user.toLowerCase()}`;
export const tourSeen = (user: string) => readJson<boolean>('local', tourKey(user), false);
export const markTourSeen = (user: string, seen = true) => writeJson('local', tourKey(user), seen);

// ---------------------------------------------------------------- Hand-offs between screens

const PREFILL_KEY = 'yieldsense_prefill';
const REPORT_KEY = 'yieldsense_report';

export function setPrefill(input: Partial<PredictionInput>) {
  writeJson('session', PREFILL_KEY, input);
}

export function takePrefill(): Partial<PredictionInput> | null {
  const v = readJson<Partial<PredictionInput> | null>('session', PREFILL_KEY, null);
  writeJson('session', PREFILL_KEY, null);
  return v;
}

export function setReport(report: SavedPrediction) {
  writeJson('session', REPORT_KEY, report);
}

export function readReport(): SavedPrediction | null {
  return readJson<SavedPrediction | null>('session', REPORT_KEY, null);
}
