export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) {
    super(message);
  }
}

let token: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onLost: () => void = () => undefined;
export const onAuthLost = (fn: () => void) => (onLost = fn);
export const setToken = (t: string | null) => (token = t);

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/v1/admin';

export function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'QuizWar' } })
    .then(async (r) => {
      if (!r.ok) return false;
      token = (await r.json()).accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; raw?: boolean } = {}): Promise<T> {
  const go = () =>
    fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      credentials: 'include',
      headers: {
        'X-Requested-With': 'QuizWar',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  let res: Response;
  try {
    res = await go();
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      if (await refresh()) res = await go();
      else onLost();
    }
  } catch {
    throw new ApiError(0, 'network', 'Network error — check your connection.');
  }
  if (opts.raw && res.ok) return (await res.text()) as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Request failed', data?.error?.details);
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
