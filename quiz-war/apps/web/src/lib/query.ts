import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      // Network hiccups (phone waking up, server starting) retry quietly for ~15 s before an
      // error is shown, so "No internet" never flashes when the connection is fine.
      retry: (n, e) => {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) return false;
        return n < (e instanceof ApiError && (e.code === 'network' || e.code === 'timeout' || e.status >= 500) ? 5 : 2);
      },
      retryDelay: (n) => Math.min(800 * 2 ** n, 6000),
    },
  },
});
