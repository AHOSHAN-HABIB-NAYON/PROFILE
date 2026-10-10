import type { ChatMessage, ChatThread, PresenceStatus, PublicUser } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from './api';
import { tr } from './i18n';
import { navigateTo } from './nav';
import { haptic } from './platform';
import { queryClient } from './query';
import { emit, onSocket } from './socket';
import { sfx } from './sound';
import { toast } from './toast';

/** A message in the open chat; temporary ones (negative id) are still sending or failed. */
export type LiveMessage = ChatMessage & { pending?: boolean; failed?: boolean };
export type ThreadData = { peer: PublicUser; status: PresenceStatus; blocked: 'me' | 'them' | null; items: LiveMessage[]; hasMore: boolean };
export type ThreadsData = { items: (ChatThread & { status: PresenceStatus })[]; unread: number };

export const threadKey = (uid: string) => ['chat-thread', uid.toUpperCase()] as const;

interface ChatState {
  /** The peer whose chat is open on screen. */
  viewing: number | null;
  /** peerId → when they last typed. */
  typing: Record<number, number>;
  setViewing: (peerId: number | null) => void;
}

function sendFocus() {
  const v = useChat.getState().viewing;
  void emit('chat:focus', { peerId: document.visibilityState === 'visible' ? v : null }).catch(() => undefined);
}

export const useChat = create<ChatState>((set) => ({
  viewing: null,
  typing: {},
  setViewing: (peerId) => {
    set({ viewing: peerId });
    sendFocus();
  },
}));

function patchThread(uid: string, fn: (d: ThreadData) => ThreadData) {
  queryClient.setQueryData<ThreadData>(threadKey(uid), (d) => (d ? fn(d) : d));
}

/** Adds a message to the open thread cache (replacing its temporary copy when it is ours). */
export function addToThread(uid: string, m: LiveMessage, tempId?: number) {
  patchThread(uid, (d) => {
    const items = tempId ? d.items.filter((x) => x.id !== tempId) : d.items;
    return { ...d, items: items.some((x) => x.id === m.id) ? items : [...items, m] };
  });
}

/** Total unread chat messages (bottom-bar badge). */
export const useChatUnread = () =>
  useQuery({ queryKey: ['chats-unread'], queryFn: async () => (await api<{ count: number }>('/chats/unread')).count, staleTime: 60_000, refetchOnWindowFocus: true }).data ?? 0;

let readTimer: ReturnType<typeof setTimeout> | null = null;
/** Tells the server we've read this chat (debounced) and clears the local unread badge. */
export function markRead(uid: string) {
  if (readTimer) clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    void api(`/chats/${uid}/read`, { method: 'POST' })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['chats-unread'] });
        void queryClient.invalidateQueries({ queryKey: ['chats'] });
      })
      .catch(() => undefined);
  }, 350);
}

/** Wires chat socket events into the caches. Registered once at startup. */
export function registerChat() {
  document.addEventListener('visibilitychange', sendFocus);
  onSocket((s) => {
    s.on('connect', sendFocus);
    s.on('chat:message', ({ message, peer }) => {
      const me = message.from !== peer.id;
      addToThread(peer.uid, message);
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      if (me) return;
      useChat.setState((st) => ({ typing: { ...st.typing, [peer.id]: 0 } }));
      const viewing = useChat.getState().viewing === peer.id && document.visibilityState === 'visible';
      if (viewing) {
        markRead(peer.uid);
        return;
      }
      queryClient.setQueryData<number>(['chats-unread'], (n) => (n ?? 0) + 1);
      if (location.pathname.startsWith('/match/')) return;
      sfx('notify');
      haptic('tap');
      toast.custom({
        kind: 'info',
        icon: 'message',
        title: peer.username,
        body: message.body.length > 90 ? `${message.body.slice(0, 87)}…` : message.body,
        ttl: 6000,
        actions: [{ label: tr('Reply', 'উত্তর দিন'), primary: true, onClick: () => navigateTo(`/chat/${peer.uid}`) }],
      });
    });
    s.on('chat:read', ({ peerId, upTo }) => {
      if (!upTo) return;
      const at = new Date().toISOString();
      for (const [key, d] of queryClient.getQueriesData<ThreadData>({ queryKey: ['chat-thread'] })) {
        if (d?.peer.id !== peerId) continue;
        queryClient.setQueryData<ThreadData>(key, { ...d, items: d.items.map((m) => (m.to === peerId && m.id > 0 && m.id <= upTo && !m.readAt ? { ...m, readAt: at } : m)) });
      }
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
    });
    s.on('chat:typing', ({ from }) => useChat.setState((st) => ({ typing: { ...st.typing, [from]: Date.now() } })));
    s.on('chat:deleted', ({ ids }) => {
      const gone = new Set(ids);
      for (const [key, d] of queryClient.getQueriesData<ThreadData>({ queryKey: ['chat-thread'] })) {
        if (d) queryClient.setQueryData<ThreadData>(key, { ...d, items: d.items.filter((m) => !gone.has(m.id)) });
      }
      void queryClient.invalidateQueries({ queryKey: ['chats'] });
      void queryClient.invalidateQueries({ queryKey: ['chats-unread'] });
    });
  });
}

/** Short time for a chat list ("10:42", "Yesterday", "12 Oct"). */
export function chatTime(iso: string, lang: 'bn' | 'en') {
  const d = new Date(iso);
  const now = new Date();
  const loc = lang === 'bn' ? 'bn-BD' : 'en-GB';
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return tr('Yesterday', 'গতকাল');
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
}
