import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { LoadingState } from '../components/ui/States';

/** Top of the route tree: auth needs the router (navigate on 401), so it lives inside it. */
export function RootLayout() {
  return (
    <AuthProvider>
      <Suspense fallback={<LoadingState fullPage />}>
        <Outlet />
      </Suspense>
    </AuthProvider>
  );
}
