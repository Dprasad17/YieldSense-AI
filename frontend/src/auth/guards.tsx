import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useAuth, useCan } from './context';
import type { Permission } from './permissions';

/**
 * Wraps authenticated routes. Anonymous users go to /login (and come back afterwards);
 * signed-in users without `permission` go to /403.
 */
export function ProtectedRoute({ permission, children }: { permission?: Permission; children?: ReactNode }) {
  const { status, retryRestore } = useAuth();
  const can = useCan();
  const location = useLocation();

  if (status === 'restoring') return <LoadingState label="Restoring your session…" fullPage />;
  if (status === 'unreachable') {
    return (
      <ErrorState
        fullPage
        title="Can't reach YieldSense"
        message="The server isn't responding. Check your connection and try again."
        onRetry={retryRestore}
      />
    );
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (permission && !can(permission)) return <Navigate to="/403" replace />;
  return children ? <>{children}</> : <Outlet />;
}

/** Renders children only when the signed-in user has `permission`. */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const can = useCan();
  return <>{can(permission) ? children : fallback}</>;
}
