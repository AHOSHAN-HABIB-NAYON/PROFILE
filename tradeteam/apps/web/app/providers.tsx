'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/toast';
import { initTheme } from '@/lib/theme';
import { ApiError } from '@/lib/api';

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false }, // never auto-retry financial operations
        },
      }),
  );
  useEffect(() => {
    initTheme();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
