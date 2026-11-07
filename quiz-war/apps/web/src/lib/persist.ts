import { queryClient } from './query';
import { useAuth } from './auth';

/**
 * Keeps the last loaded screens (home, profile, chats, shop…) on the phone, so the app opens
 * with them at once and only refreshes in the background — no blank "loading" each start.
 */
const KEY = 'qw-cache-v1';
const MAX = 1_500_000; // characters (~1.5 MB)
// Things that change every second or are big are not kept.
const SKIP = /^(chat-thread|leaderboard-live|presence|search|admin)/;

const meId = (): number | null => {
  try {
    return (JSON.parse(localStorage.getItem('qw-me') ?? 'null') as { id?: number } | null)?.id ?? null;
  } catch {
    return null;
  }
};

interface Saved {
  uid: number;
  at: number;
  items: { key: unknown[]; data: unknown; at: number }[];
}

function hydrate() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as Saved;
    // Another account, or older than 3 days: start fresh.
    if (s.uid !== meId() || Date.now() - s.at > 3 * 86_400_000) return localStorage.removeItem(KEY);
    for (const it of s.items) if (queryClient.getQueryData(it.key) === undefined) queryClient.setQueryData(it.key, it.data, { updatedAt: it.at });
  } catch {
    /* broken or blocked storage */
  }
}

let timer: number | undefined;
function save() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const uid = meId();
    if (!uid || useAuth.getState().status === 'anon') return;
    const items: Saved['items'] = [];
    let size = 0;
    const all = queryClient
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.status === 'success' && q.state.data !== undefined && !SKIP.test(String(q.queryKey[0])))
      .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    for (const q of all) {
      let json: string;
      try {
        json = JSON.stringify(q.state.data);
      } catch {
        continue;
      }
      if (size + json.length > MAX) continue;
      size += json.length;
      items.push({ key: q.queryKey as unknown[], data: q.state.data, at: q.state.dataUpdatedAt });
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({ uid, at: Date.now(), items } satisfies Saved));
    } catch {
      /* full or blocked */
    }
  }, 1500);
}

if (typeof window !== 'undefined') {
  hydrate();
  queryClient.getQueryCache().subscribe((e) => {
    if (e.type === 'updated' && e.action.type === 'success') save();
  });
  // Signed out: forget everything saved.
  useAuth.subscribe((s, prev) => {
    if (s.status === 'anon' && prev.status !== 'anon') {
      window.clearTimeout(timer);
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* blocked */
      }
    }
  });
  document.addEventListener('visibilitychange', () => document.hidden && save());
}
