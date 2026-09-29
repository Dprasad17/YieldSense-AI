import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { Header } from '../components/Header';
import { LoadingState, OfflineDemoBanner } from '../components/ui/States';

/** Interim shell around the existing screens. Replaced by the sidebar shell in Phase 5. */
export function AppLayout() {
  const { offlineDemo } = useAuth();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {offlineDemo && <OfflineDemoBanner />}
      <Header />
      <main
        style={{ flex: 1, padding: 'var(--space-8)', maxWidth: 'var(--content-max)', margin: '0 auto', width: '100%' }}
      >
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
