import type { SessionUser } from './types';

// Keys kept from the previous app so existing signed-in sessions survive the upgrade.
const TOKEN_KEY = 'yieldsense_token';
const USER_KEY = 'yieldsense_user';
const OFFLINE_KEY = 'yieldsense_offline_demo';

export interface StoredSession {
  token: string;
  user: SessionUser | null;
  offlineDemo: boolean;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode etc.): the session just won't persist.
  }
}

export function readSession(): StoredSession | null {
  const token = safeGet(TOKEN_KEY);
  if (!token) return null;
  let user: SessionUser | null = null;
  const raw = safeGet(USER_KEY);
  if (raw) {
    try {
      user = JSON.parse(raw) as SessionUser;
    } catch {
      user = null;
    }
  }
  return { token, user, offlineDemo: safeGet(OFFLINE_KEY) === '1' };
}

export function writeSession(session: StoredSession) {
  safeSet(TOKEN_KEY, session.token);
  safeSet(USER_KEY, session.user ? JSON.stringify(session.user) : null);
  safeSet(OFFLINE_KEY, session.offlineDemo ? '1' : null);
}

export function clearSession() {
  safeSet(TOKEN_KEY, null);
  safeSet(USER_KEY, null);
  safeSet(OFFLINE_KEY, null);
}

export function getToken(): string | null {
  return safeGet(TOKEN_KEY);
}
