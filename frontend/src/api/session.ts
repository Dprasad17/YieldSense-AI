import type { SessionUser } from './types';

// Keys kept from the previous app so existing signed-in sessions survive the upgrade.
const TOKEN_KEY = 'yieldsense_token';
const USER_KEY = 'yieldsense_user';
const OFFLINE_KEY = 'yieldsense_offline_demo';
const KEYS = [TOKEN_KEY, USER_KEY, OFFLINE_KEY];

export interface StoredSession {
  token: string;
  user: SessionUser | null;
  offlineDemo: boolean;
}

type StoreName = 'local' | 'session';

function store(name: StoreName): Storage | null {
  try {
    return name === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function get(key: string): string | null {
  try {
    return store('session')?.getItem(key) ?? store('local')?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(name: StoreName, key: string, value: string | null) {
  try {
    const s = store(name);
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Storage blocked (private mode etc.): the session just won't persist.
  }
}

export function readSession(): StoredSession | null {
  const token = get(TOKEN_KEY);
  if (!token) return null;
  let user: SessionUser | null = null;
  const raw = get(USER_KEY);
  if (raw) {
    try {
      user = JSON.parse(raw) as SessionUser;
    } catch {
      user = null;
    }
  }
  return { token, user, offlineDemo: get(OFFLINE_KEY) === '1' };
}

/** `remember` keeps the session across browser restarts; otherwise it ends with the tab. */
export function writeSession(session: StoredSession, remember = true) {
  clearSession();
  const target: StoreName = remember ? 'local' : 'session';
  set(target, TOKEN_KEY, session.token);
  set(target, USER_KEY, session.user ? JSON.stringify(session.user) : null);
  set(target, OFFLINE_KEY, session.offlineDemo ? '1' : null);
}

/** Updates the stored user without changing where the session lives. */
export function updateSessionUser(user: SessionUser) {
  let target: StoreName = 'local';
  try {
    if (window.sessionStorage.getItem(TOKEN_KEY)) target = 'session';
  } catch {
    target = 'local';
  }
  set(target, USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  for (const k of KEYS) {
    set('local', k, null);
    set('session', k, null);
  }
}

export function getToken(): string | null {
  return get(TOKEN_KEY);
}

/** Expiry of a JWT in epoch ms, or null if the token has no readable `exp`. */
export function tokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
