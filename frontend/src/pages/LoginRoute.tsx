import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { LoginPage } from '../components/LoginPage';
import { LoadingState } from '../components/ui/States';

export function LoginRoute() {
  const { status } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (status === 'restoring') return <LoadingState label="Restoring your session…" fullPage />;
  if (status === 'authenticated') {
    const target = from && from.startsWith('/app') ? from : '/app/dashboard';
    return <Navigate to={target} replace />;
  }
  return <LoginPage />;
}
