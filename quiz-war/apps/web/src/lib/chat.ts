import type { ChatMessage, ChatThread, PresenceStatus, PublicUser } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from './api';
import { tr } from './i18n';
import { navigateTo } from './nav';
import { haptic } from './platform';
import { queryClient } from './query';
import { emit, onSocket } from './socket';
import { useSettings } from './settings';
import { sfx } from './sound';
import { toast } from './toast';

/** A message in the open chat; temporary ones (negative id) are still sending or failed. */
export type LiveMessage = ChatMessage & { pending?: boolean; failed?: boolean };
export type ThreadData = { peer: PublicUser; status: PresenceStatus; blocked: 'me' | 'them' | null; chatBlocked?: 'me' | 'them' | null; request?: boolean; items: LiveMessage[]; hasMore: boolean };
export type ThreadsData = { items: (ChatThread & { status: PresenceStatus; request?: boolean })[]; unread: number; requests?: number };

/** A floating round chat head (Messenger style) for someone who just messaged you. */
export type ChatHead = { peer: PublicUser; count: number; last: string; at: number; request?: boolean };

export const threadKey = (uid: string) => ['chat-thread', uid.toUpperCase()] as const;

interface ChatState {
  /** The peer whose chat is open on screen. */
  viewing: number | null;
  /** peerId → when they last typed. */
  typing: Record<number, number>;
  heads: ChatHead[];
  setViewing: (peerId: number | null) => void;
  dropHead: (peerId: number) => void;
  clearHeads: () => void;
}

function sendFocus() {
  const v = useChat.getState().viewing;
  void emit('chat:focus', { peerId: document.visibilityState === 'visible' ? v : null }).catch(() => undefined);
}

export const useChat = create<ChatState>((set) => ({
  viewing: null,
  typing: {},
  heads: [],
  setViewing: (peerId) => {
    set((st) => ({ viewing: peerId, heads: peerId ? st.heads.filter((h) => h.peer.id !== peerId) : st.heads }));
    sendFocus();
  },
  dropHead: (peerId) => set((st) => ({ heads: st.heads.filter((h) => h.peer.id !== peerId) })),
  clearHeads: () => set({ heads: [] }),
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
    s.on('chat:message', ({ message, peer, request }) => {
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
      if (!request) queryClient.setQueryData<number>(['chats-unread'], (n) => (n ?? 0) + 1);
      if (location.pathname.startsWith('/match/')) return;
      sfx('message');
      haptic('tap');
      if (useSettings.getState().chatHeads) {
        useChat.setState((st) => {
          const old = st.heads.find((h) => h.peer.id === peer.id);
          const head: ChatHead = { peer, count: (old?.count ?? 0) + 1, last: message.body, at: Date.now(), request };
          return { heads: [head, ...st.heads.filter((h) => h.peer.id !== peer.id)].slice(0, 4) };
        });
        return;
      }
      toast.custom({
        kind: 'info',
        icon: 'message',
        title: request ? `${peer.username} · ${tr('Message request', 'মেসেজ রিকোয়েস্ট')}` : peer.username,
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
    s.on('chat:deleted', ({ ids, unsent }) => {
      const gone = new Set(ids);
      for (const [key, d] of queryClient.getQueriesData<ThreadData>({ queryKey: ['chat-thread'] })) {
        if (!d) continue;
        // Unsent by its author → "This message was deleted"; removed for me / by a moderator → gone.
        const items = unsent ? d.items.map((m) => (gone.has(m.id) ? { ...m, body: '', deleted: true } : m)) : d.items.filter((m) => !gone.has(m.id));
        queryClient.setQueryData<ThreadData>(key, { ...d, items });
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
  if (d.toDateString() === now.toDateString()) return clock(iso, lang);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return tr('Yesterday', 'গতকাল');
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
}

/** 12-hour clock ("10:42 PM" / "রাত ১০:৪২"). */
export function clock(iso: string, lang: 'bn' | 'en') {
  return new Date(iso).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
