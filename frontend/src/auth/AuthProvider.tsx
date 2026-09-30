import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isNetworkError, setUnauthorizedHandler } from '../api/client';
import { authApi } from '../api/endpoints';
import { clearSession, readSession, updateSessionUser, writeSession } from '../api/session';
import type { SessionUser, TokenResponse } from '../api/types';
import { AuthContext, type AuthState, type AuthStatus } from './context';
import { findDemoAccount } from './demoAccounts';
import { normalizeRole } from './permissions';

const OFFLINE_DEMO_TOKEN = 'offline-demo';

function userFromToken(res: TokenResponse): SessionUser {
  return { username: res.username, role: res.role, email: res.email, full_name: res.full_name || res.username };
}

interface InitialAuth {
  status: AuthStatus;
  user: SessionUser | null;
  offlineDemo: boolean;
}

function initialAuthState(): InitialAuth {
  const stored = readSession();
  if (!stored) return { status: 'anonymous', user: null, offlineDemo: false };
  if (stored.offlineDemo) {
    // An offline demo session is only valid in DEV builds.
    if (import.meta.env.DEV && stored.user) return { status: 'authenticated', user: stored.user, offlineDemo: true };
    clearSession();
    return { status: 'anonymous', user: null, offlineDemo: false };
  }
  return { status: 'restoring', user: null, offlineDemo: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Decide synchronously what we can from storage; only a real token needs a server round-trip.
  const [initial] = useState(initialAuthState);
  const [status, setStatus] = useState<AuthStatus>(initial.status);
  const [user, setUser] = useState<SessionUser | null>(initial.user);
  const [offlineDemo, setOfflineDemo] = useState(initial.offlineDemo);

  const endSession = useCallback(() => {
    clearSession();
    queryClient.clear();
    setUser(null);
    setOfflineDemo(false);
    setStatus('anonymous');
  }, [queryClient]);

  // Restore a stored session by asking the server who the token belongs to.
  // Runs on load and again whenever retryRestore() puts the status back to 'restoring'.
  useEffect(() => {
    if (status !== 'restoring') return;
    const stored = readSession();
    let cancelled = false;

    const check = stored ? authApi.me().then(res => ({ res, stored })) : Promise.reject(new Error('No stored session'));

    check
      .then(({ res }) => {
        if (cancelled) return;
        const restored: SessionUser = { ...res.user, full_name: res.user.full_name || res.user.username };
        updateSessionUser(restored);
        setUser(restored);
        setOfflineDemo(false);
        setStatus('authenticated');
      })
      .catch(err => {
        if (cancelled) return;
        if (stored && isNetworkError(err)) {
          if (import.meta.env.DEV && stored.user) {
            setUser(stored.user);
            setOfflineDemo(true);
            setStatus('authenticated');
          } else {
            setStatus('unreachable');
          }
          return;
        }
        clearSession();
        setUser(null);
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  // Any 401 from the API (expired or revoked token) ends the session.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!readSession()) return;
      const from = location.pathname + location.search;
      void Promise.resolve(navigate('/session-expired', { replace: true, state: { from } })).then(endSession);
      toast.error('Your session has expired. Please sign in again.');
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession, navigate, location.pathname, location.search]);

  const startSession = useCallback((token: string, next: SessionUser, isOfflineDemo: boolean, remember = true) => {
    writeSession({ token, user: next, offlineDemo: isOfflineDemo }, remember);
    setUser(next);
    setOfflineDemo(isOfflineDemo);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (username: string, password: string, remember = true) => {
      try {
        const res = await authApi.login(username.trim(), password);
        startSession(res.access_token, userFromToken(res), false, remember);
      } catch (err) {
        // Offline demo mode: only when the server is unreachable, only in DEV, only with a demo account.
        const demo = findDemoAccount(username, password);
        if (isNetworkError(err) && import.meta.env.DEV && demo) {
          startSession(
            OFFLINE_DEMO_TOKEN,
            { username: demo.username, role: demo.role, email: demo.email, full_name: demo.full_name },
            true,
            remember,
          );
          return;
        }
        throw err;
      }
    },
    [startSession],
  );

  const register = useCallback<AuthState['register']>(
    async input => {
      const res = await authApi.register(input);
      startSession(res.access_token, userFromToken(res), false);
    },
    [startSession],
  );

  const logout = useCallback(() => {
    // navigate() is async in React Router v7: leave the protected page first so the guard
    // doesn't record it as a "return to" target, then end the session.
    void Promise.resolve(navigate('/login', { replace: true })).then(endSession);
  }, [endSession, navigate]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      role: user ? normalizeRole(user.role) : null,
      offlineDemo,
      login,
      register,
      logout,
      retryRestore: () => setStatus('restoring'),
    }),
    [status, user, offlineDemo, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
