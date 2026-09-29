import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { PreferencesProvider } from '../store/PreferencesProvider';
import { usePreferences } from '../store/preferences';
import { queryClient } from './queryClient';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        {children}
        <ThemedToaster />
      </PreferencesProvider>
    </QueryClientProvider>
  );
}

function ThemedToaster() {
  const { theme } = usePreferences();
  return <Toaster position="bottom-right" theme={theme} richColors closeButton />;
}
