'use client';
import type { QueryClient } from '@tanstack/react-query';
import type { LoginResult } from './types';
import { reconnectSocket } from './realtime';
import { applyTheme } from './theme';

/** Shared post-login routing for every sign-in method. */
export function handleLoginResult(
  r: LoginResult,
  qc: QueryClient,
  router: { replace: (u: string) => void; push: (u: string) => void },
  next?: string | null,
) {
  if (r.status === 'ok') {
    qc.setQueryData(['me'], r.user);
    qc.invalidateQueries({ queryKey: ['me'] });
    if (r.user.profile?.theme) applyTheme(r.user.profile.theme);
    reconnectSocket();
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
  } else if (r.status === 'mfa_required') {
    const m = Object.entries(r.methods)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(',');
    router.push(
      `/login/verify?token=${encodeURIComponent(r.mfaToken)}&methods=${m}${next ? `&next=${encodeURIComponent(next)}` : ''}`,
    );
  } else {
    router.push(`/verify-email?email=${encodeURIComponent(r.email)}`);
  }
}
