import { createContext, useContext } from 'react';
import type { Role, SessionUser } from '../api/types';
import { hasPermission, normalizeRole, type Permission } from './permissions';

export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous' | 'unreachable';

export interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  role: Role | null;
  /** True when signed in with a demo account while the backend is unreachable (DEV builds only). */
  offlineDemo: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (input: {
    username: string;
    email: string;
    password: string;
    role: string;
    full_name?: string;
  }) => Promise<void>;
  logout: () => void;
  retryRestore: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** `const can = useCan(); can('models')` */
export function useCan(): (permission: Permission) => boolean {
  const { user } = useAuth();
  return (permission: Permission) => (user ? hasPermission(normalizeRole(user.role), permission) : false);
}
