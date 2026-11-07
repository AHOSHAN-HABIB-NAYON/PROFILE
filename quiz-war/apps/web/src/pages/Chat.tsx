import { REPORT_REASONS } from '@quizwar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar, statusLabel } from '../components/Avatar';
import { Empty, ErrorBox, Spinner } from '../components/Feedback';
import { Icon, IconTile } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { PlayerName } from '../components/Verified';
import { compressImage } from '../lib/image';
import { handlePremiumError, needPremium } from '../lib/premium';
import { saveImage, shareImage } from '../lib/shareImage';
import { canRecordVoice, fmtSecs, useVoiceRecorder, VoiceBubble } from '../components/Voice';
import { useConfig } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { addToThread, previewText, chatTime, clock, markRead, threadKey, useChat, type LiveMessage, type ThreadData, type ThreadsData } from '../lib/chat';
import { num, useLang, useT } from '../lib/i18n';
import { reasonLabel } from '../lib/labels';
import { haptic, PUBLIC_WEB_URL } from '../lib/platform';
import { useSettings } from '../lib/settings';
import { useAuth } from '../lib/auth';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';
import { sfx } from '../lib/sound';
import { startCall } from '../lib/call';

const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳', '😇', '🙂',
  '😉', '😋', '🤔', '🤫', '😴', '😅', '😢', '😭', '😡', '😱', '🤯', '🥺',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '✌️', '👌', '🔥', '💯', '⭐',
  '❤️', '💙', '💚', '💛', '💜', '🖤', '🎉', '🏆', '🥇', '🎯', '🧠', '📚',
  '⚔️', '🇧🇩', '✅', '❌', '⏰', '💡', '🤗', '😜', '😏', '😤', '🤭', '🫡',
];

const isEmojiOnly = (s: string) => s.length <= 16 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍|\s)+$/u.test(s) && !/^[\d#*\s]+$/.test(s);

function dayLabel(iso: string, lang: 'bn' | 'en', t: (en: string, bn: string) => string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return t('Today', 'আজ');
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t('Yesterday', 'গতকাল');
  return d.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

let tempSeq = -1;

/** Messenger-style reactions: like, haha, love, angry, sad, wow. */
const REACTIONS = ['👍', '😆', '❤️', '😡', '😢', '😮'];

/** The chat screen. With `peerUid` + `onClose` it runs as a popup over a game (no page change). */
export default function Chat({ peerUid, onClose }: { peerUid?: string; onClose?: () => void } = {}) {
  const params = useParams();
  const uid = peerUid ?? params.uid ?? '';
  const popup = !!onClose;
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const qc = useQueryClient();
  const cfg = useConfig().data;
  const key = threadKey(uid);
  const thread = useQuery({ queryKey: key, queryFn: () => api<ThreadData>(`/chats/${uid}/messages`), staleTime: 30_000, refetchOnWindowFocus: true });
  const data = thread.data;
  const peer = data?.peer;
  const typingAt = useChat((s) => (peer ? s.typing[peer.id] ?? 0 : 0));
  const [now, setNow] = useState(Date.now());
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [picked, setPicked] = useState<LiveMessage | null>(null);
  const [clearAsk, setClearAsk] = useState(false);
  const chatHeads = useSettings((st) => st.chatHeads);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [replying, setReplying] = useState<LiveMessage | null>(null);
  const [swipe, setSwipe] = useState<{ id: number; dx: number } | null>(null);
  const swipeStart = useRef<{ id: number; x: number; y: number; dir: 'h' | 'v' | null } | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const myId = useAuth((st) => st.user?.id ?? 0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);

  // This chat is on screen: no push for it, and its messages count as read.
  useEffect(() => {
    if (!peer) return;
    useChat.getState().setViewing(peer.id);
    markRead(peer.uid);
    return () => useChat.getState().setViewing(null);
  }, [peer?.id]);

  // "typing…" fades out on its own.
  useEffect(() => {
    if (!typingAt) return;
    setNow(Date.now());
    const id = setTimeout(() => setNow(Date.now()), 4200);
    return () => clearTimeout(id);
  }, [typingAt]);
  const typing = !!typingAt && now - typingAt < 4000;

  // Keep the newest message in view unless the player scrolled up to read older ones.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [data?.items.length, typing, emojiOpen]);
  const onScroll = () => {
    const el = list.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    if (!data?.items.length || loadingOlder) return;
    setLoadingOlder(true);
    const el = list.current;
    const before = el?.scrollHeight ?? 0;
    try {
      const older = await api<ThreadData>(`/chats/${uid}/messages?before=${data.items.find((m) => m.id > 0)?.id ?? ''}`);
      qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, hasMore: older.hasMore, items: [...older.items.filter((m) => !d.items.some((x) => x.id === m.id)), ...d.items] } : d));
      requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight - before));
    } catch (e) {
      toast.error(t('Could not load', 'লোড করা যায়নি'), friendlyError(e));
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (body: string, retryId?: number, quote?: LiveMessage | null) => {
    if (!peer || !body.trim()) return;
    haptic('tap');
    const tempId = retryId ?? tempSeq--;
    const prevTemp = retryId ? data?.items.find((m) => m.id === retryId) : undefined;
    const replyTo = quote && quote.id > 0 ? quoteOf(quote) : prevTemp?.replyTo;
    const temp: LiveMessage = { id: tempId, from: -1, to: peer.id, body: body.trim(), createdAt: new Date().toISOString(), readAt: null, pending: true, ...(replyTo ? { replyTo } : {}) };
    stick.current = true;
    qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: [...d.items.filter((m) => m.id !== tempId), temp] } : d));
    try {
      const r = await api<{ message: LiveMessage }>(`/chats/${peer.uid}/messages`, { body: { body: temp.body, ...(replyTo ? { replyTo: replyTo.id } : {}) } });
      addToThread(peer.uid, r.message, tempId);
      void qc.invalidateQueries({ queryKey: ['chats'] });
    } catch (e) {
      qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: d.items.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)) } : d));
      const code = (e as any)?.code;
      if (code === 'blocked' || code === 'blocked_by_you') void thread.refetch();
      toast.error(t('Message not sent', 'মেসেজ যায়নি'), friendlyError(e));
    }
  };

  const voice = useVoiceRecorder();
  const voiceOn = (cfg?.chatVoiceEnabled ?? true) && canRecordVoice();
  const startVoice = async () => {
    haptic('tap');
    try {
      if (!(await voice.start())) toast.error(t('Recording not supported', 'এই ডিভাইসে রেকর্ড করা যাচ্ছে না'));
    } catch {
      toast.error(t('Microphone blocked', 'মাইক্রোফোনের অনুমতি নেই'), t('Allow the microphone in settings to send voice messages.', 'ভয়েস মেসেজ পাঠাতে সেটিংসে মাইক্রোফোন চালু করুন।'));
    }
  };
  /** Mic: press and hold to talk (release sends), or tap once to keep recording. */
  const holdRef = useRef<{ at: number; hold: boolean } | null>(null);
  const [holding, setHolding] = useState(false);
  const micDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (needPremium('voiceMessages')) return;
    holdRef.current = { at: Date.now(), hold: false };
    void startVoice();
    const timer = window.setTimeout(() => {
      if (holdRef.current) {
        holdRef.current.hold = true;
        setHolding(true);
      }
    }, 450);
    const up = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const h = holdRef.current;
      holdRef.current = null;
      setHolding(false);
      if (h && Date.now() - h.at >= 450) void sendVoice();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const [photoMenu, setPhotoMenu] = useState(false);
  const [forwarding, setForwarding] = useState<LiveMessage | null>(null);
  /** Photo as a JPEG blob (saves and shares everywhere). */
  const photoBlob = async (url: string) => {
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return (await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92)))!;
  };
  const savePhoto = async (url: string) => {
    try {
      const r = await saveImage(await photoBlob(url), fileNameOf(url));
      if (r === 'failed') throw new Error('failed');
      haptic('success');
      toast.success(r === 'saved' ? t('Saved to gallery', 'গ্যালারিতে সেভ হয়েছে') : t('Downloaded', 'ডাউনলোড হয়েছে'), undefined, 'download');
    } catch {
      toast.error(t('Could not save the photo', 'ছবি সেভ করা যায়নি'));
    }
  };
  const sharePhoto = async (url: string) => {
    try {
      const name = fileNameOf(url);
      await shareImage(await photoBlob(url), { title: name, text: name, url: '', fileName: name });
    } catch {
      /* cancelled */
    }
  };
  const [viewer, setViewerRaw] = useState<string | null>(null);
  // The photo viewer is a step in history: Back closes it and you stay in the chat.
  const setViewer = (url: string | null) => {
    if (url) {
      window.history.pushState({ qwPhoto: true }, '');
      setViewerRaw(url);
    } else if (window.history.state?.qwPhoto) window.history.back();
    else setViewerRaw(null);
  };
  useEffect(() => {
    const on = () => setViewerRaw(null);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const imagesOn = cfg?.chatImagesEnabled ?? true;
  const sendPhoto = async (file: File | undefined) => {
    setPhotoMenu(false);
    if (!file || !peer) return;
    haptic('tap');
    const tempId = tempSeq--;
    let blob: Blob;
    try {
      // About 10% of the original: 5 MB → ~500 KB or less (WebP, longest side 1600 px).
      blob = await compressImage(file, 1600, 0.72);
    } catch (e) {
      return toast.error(t('Photo not sent', 'ছবি যায়নি'), e instanceof Error ? e.message : friendlyError(e));
    }
    const local = URL.createObjectURL(blob);
    const quote = replying;
    setReplying(null);
    const replyTo = quote && quote.id > 0 ? quoteOf(quote) : undefined;
    const temp: LiveMessage = { id: tempId, from: -1, to: peer.id, body: '', kind: 'image', media: { url: local, secs: 0 }, createdAt: new Date().toISOString(), readAt: null, pending: true, ...(replyTo ? { replyTo } : {}) };
    stick.current = true;
    qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: [...d.items, temp] } : d));
    try {
      const form = new FormData();
      if (replyTo) form.append('replyTo', String(replyTo.id));
      form.append('file', blob, blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
      const r = await api<{ message: LiveMessage }>(`/chats/${peer.uid}/image`, { form });
      addToThread(peer.uid, r.message, tempId);
      void qc.invalidateQueries({ queryKey: ['chats'] });
    } catch (e) {
      qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: d.items.filter((m) => m.id !== tempId) } : d));
      if (!handlePremiumError(e, 'photos')) toast.error(t('Photo not sent', 'ছবি যায়নি'), friendlyError(e));
    }
  };

  const sendVoice = async () => {
    const clip = await voice.stop();
    if (!clip || !peer) return;
    haptic('success');
    const tempId = tempSeq--;
    const local = URL.createObjectURL(clip.blob);
    const quote = replying;
    setReplying(null);
    const replyTo = quote && quote.id > 0 ? quoteOf(quote) : undefined;
    const temp: LiveMessage = { id: tempId, from: -1, to: peer.id, body: '', kind: 'voice', media: { url: local, secs: clip.secs }, createdAt: new Date().toISOString(), readAt: null, pending: true, ...(replyTo ? { replyTo } : {}) };
    stick.current = true;
    qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: [...d.items, temp] } : d));
    try {
      const form = new FormData();
      form.append('secs', String(clip.secs));
      if (replyTo) form.append('replyTo', String(replyTo.id));
      form.append('file', clip.blob, `voice.${clip.mime.includes('mp4') ? 'm4a' : clip.mime.includes('ogg') ? 'ogg' : 'webm'}`);
      const r = await api<{ message: LiveMessage }>(`/chats/${peer.uid}/voice?secs=${clip.secs}`, { form });
      addToThread(peer.uid, r.message, tempId);
      void qc.invalidateQueries({ queryKey: ['chats'] });
    } catch (e) {
      qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: d.items.filter((m) => m.id !== tempId) } : d));
      if (!handlePremiumError(e, 'voiceMessages')) toast.error(t('Voice message not sent', 'ভয়েস মেসেজ যায়নি'), friendlyError(e));
    }
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text;
    if (!body.trim()) return;
    setText('');
    void send(body, undefined, replying);
    setReplying(null);
    input.current?.focus();
  };

  const onType = (v: string) => {
    setText(v);
    if (peer && v && Date.now() - lastTyping.current > 2500) {
      lastTyping.current = Date.now();
      void emit('chat:typing', { to: peer.id }).catch(() => undefined);
    }
  };

  const callPeer = (video = false) => {
    if (!peer) return;
    if (cfg?.callsEnabled === false) return void toast.info(t('Calls are off right now', 'কল এখন বন্ধ আছে'), undefined, 'phone');
    if (needPremium('calls')) return;
    haptic('tap');
    void startCall(peer, { video });
  };

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      haptic('success');
      toast.success(done);
      void thread.refetch();
      void qc.invalidateQueries({ queryKey: ['chats'] });
    } catch (e) {
      toast.error(t('Something went wrong', 'কিছু একটা সমস্যা হয়েছে'), friendlyError(e));
    }
  };

  const removeLocal = (id: number) => qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: d.items.filter((m) => m.id !== id) } : d));
  const deleteMsg = async (m: LiveMessage, forEveryone: boolean) => {
    setPicked(null);
    haptic('tap');
    if (m.id < 0) return removeLocal(m.id);
    if (forEveryone) qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: d.items.map((x) => (x.id === m.id ? { ...x, body: '', deleted: true } : x)) } : d));
    else removeLocal(m.id);
    try {
      await api(`/chats/messages/${m.id}/delete`, { body: { forEveryone } });
      void qc.invalidateQueries({ queryKey: ['chats'] });
      toast.success(forEveryone ? t('Deleted for everyone', 'সবার জন্য মুছে ফেলা হয়েছে') : t('Deleted for you', 'আপনার জন্য মুছে ফেলা হয়েছে'), undefined, 'trash');
    } catch (e) {
      toast.error(t('Could not delete', 'মুছে ফেলা যায়নি'), friendlyError(e));
      void thread.refetch();
    }
  };
  const copyMsg = async (m: LiveMessage) => {
    setPicked(null);
    try {
      await navigator.clipboard.writeText(m.body);
      toast.success(t('Copied', 'কপি হয়েছে'), undefined, 'copy');
    } catch {
      toast.error(t('Could not copy', 'কপি করা যায়নি'));
    }
  };
  // Long-press (or right-click) a message for Copy / Delete.
  const holdStart = (m: LiveMessage) => {
    if (press.current) clearTimeout(press.current);
    press.current = setTimeout(() => (haptic('tap'), setPicked(m)), 420);
  };
  const holdEnd = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };

  const react = async (m: LiveMessage, r: string) => {
    setPicked(null);
    if (m.id < 0 || m.deleted) return;
    haptic('success');
    sfx('react');
    const mineNow = m.reactions?.find((x) => x.u === myId)?.r;
    const next = mineNow === r ? null : r;
    // Show it at once; the server echo (chat:reaction) confirms it.
    qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: d.items.map((x) => (x.id === m.id ? { ...x, reactions: [...(x.reactions ?? []).filter((y) => y.u !== myId), ...(next ? [{ u: myId, r: next }] : [])] } : x)) } : d));
    try {
      await api(`/chats/messages/${m.id}/react`, { body: { reaction: next } });
    } catch (e) {
      toast.error(t('Could not react', 'রিঅ্যাকশন দেওয়া যায়নি'), friendlyError(e));
      void thread.refetch();
    }
  };
  const startReply = (m: LiveMessage) => {
    if (m.id < 0 || m.deleted) return;
    haptic('tap');
    setPicked(null);
    setReplying(m);
    setEmojiOpen(false);
    requestAnimationFrame(() => input.current?.focus());
  };
  const jumpTo = (id: number) => {
    const el = list.current?.querySelector(`[data-mid="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id);
    setTimeout(() => setFlash(null), 1300);
  };
  // Swipe a message sideways (towards the middle) to reply, like Messenger.
  const swipeDown = (e: React.PointerEvent, m: LiveMessage) => {
    swipeStart.current = { id: m.id, x: e.clientX, y: e.clientY, dir: null };
    holdStart(m);
  };
  const swipeMove = (e: React.PointerEvent, mine: boolean) => {
    const s0 = swipeStart.current;
    if (!s0) return;
    const dx = e.clientX - s0.x;
    const dy = e.clientY - s0.y;
    if (!s0.dir && Math.hypot(dx, dy) > 8) {
      s0.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      holdEnd();
    }
    if (s0.dir !== 'h') return;
    const pull = mine ? Math.min(0, dx) : Math.max(0, dx);
    const d = Math.max(-90, Math.min(90, pull));
    if (Math.abs(d) >= 64 && Math.abs(swipe?.dx ?? 0) < 64) haptic('tap');
    setSwipe({ id: s0.id, dx: d });
  };
  const swipeUp = (m: LiveMessage) => {
    holdEnd();
    const done = swipe && swipe.id === m.id && Math.abs(swipe.dx) >= 64;
    swipeStart.current = null;
    setSwipe(null);
    if (done) startReply(m);
  };

  if (thread.error && !data) {
    return (
      <div className="page stack">
        <ErrorBox error={thread.error} retry={thread.refetch} />
        <button className="btn outline block" onClick={() => (onClose ? onClose() : nav('/friends'))}><Icon name="arrow-left" /> {t('Back to chats', 'চ্যাটে ফিরে যান')}</button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const lastMineRead = [...items].reverse().find((m) => m.to === peer?.id && m.readAt)?.id;
  const chatOff = cfg && cfg.chatEnabled === false;

  return (
    <div className={`chat-page${popup ? ' popup' : ''}`}>
      <header className="chat-head">
        <button className="btn icon ghost" aria-label={popup ? t('Minimize', 'ছোট করুন') : t('Back', 'ফিরে যান')} onClick={() => (onClose ? onClose() : history.length > 1 ? nav(-1) : nav('/friends'))}>
          <Icon name={popup ? 'chevron-down' : 'back'} size={24} />
        </button>
        {peer ? (
          <Link to={`/u/${peer.uid}`} className="chat-peer" onClick={(e) => popup && e.preventDefault()}>
            <Avatar name={peer.username} src={peer.avatarThumbUrl} status={data?.status} size={42} frame={peer.frame} />
            <span className="grow">
              <b><PlayerName name={peer.username} verified={peer.verified} premium={peer.premium} /></b>
              <small className={typing ? 'typing-text' : `status-text s-${data?.status}`}>{typing ? t('typing…', 'টাইপ করছে…') : statusLabel(data!.status)}</small>
            </span>
          </Link>
        ) : (
          <span className="grow" />
        )}
        <button className="btn icon ghost" aria-label={t('Audio call', 'অডিও কল')} onClick={() => callPeer()} disabled={!peer}><Icon name="phone" size={21} /></button>
        <button className="btn icon ghost" aria-label={t('Video call', 'ভিডিও কল')} disabled={!peer} onClick={() => callPeer(true)}><Icon name="video" size={23} /></button>
        <button className="btn icon ghost" aria-label={t('More', 'আরও')} onClick={() => setMenu(true)} disabled={!peer}><Icon name="more" size={22} /></button>
      </header>

      <div className="chat-list" ref={list} onScroll={onScroll} role="log" aria-live="polite">
        {!data ? (
          <Spinner />
        ) : (
          <>
            {data.hasMore ? (
              <button className="btn sm soft chat-older" onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? t('Loading…', 'লোড হচ্ছে…') : t('Older messages', 'পুরনো মেসেজ')}</button>
            ) : (
              <>
                <p className="chat-note"><Icon name="clock" size={14} /> {t(`Messages are deleted automatically after ${cfg?.chatRetention?.days ?? 7} days.`, `মেসেজগুলো ${num(cfg?.chatRetention?.days ?? 7, lang)} দিন পর নিজে থেকে মুছে যায়।`)}</p>
              </>
            )}
            {!items.length && peer && (
              <div className="chat-hello">
                <Avatar name={peer.username} src={peer.avatarUrl ?? peer.avatarThumbUrl} size={84} frame={peer.frame} />
                <b>{peer.username}</b>
                <span className="small muted">{t('Say hi and start the conversation!', 'হাই বলে কথা শুরু করুন!')}</span>
                <div className="row gap-sm" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                  {(lang === 'en' ? ['👋 Hi!', 'Assalamu Alaikum', '⚔️ Play?'] : ['👋 Hi!', 'আসসালামু আলাইকুম', '⚔️ খেলবে?']).map((q) => <button key={q} className="chip" onClick={() => void send(q)}>{q}</button>)}
                </div>
              </div>
            )}
            {items.map((m, i) => {
              const mine = m.to === peer?.id;
              const prev = items[i - 1];
              const next = items[i + 1];
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const groupTop = newDay || !prev || (prev.to === peer?.id) !== mine || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000;
              const groupEnd = !next || (next.to === peer?.id) !== mine || new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() > 5 * 60_000;
              const big = !m.deleted && !m.kind && isEmojiOnly(m.body);
              return (
                <Fragment key={m.id}>
                  {newDay && <div className="chat-day"><span>{dayLabel(m.createdAt, lang, t)}</span></div>}
                  <div
                    data-mid={m.id}
                    className={`msg ${mine ? 'mine' : 'theirs'}${groupTop || m.replyTo ? ' top' : ''}${groupEnd ? ' end' : ''}${big ? ' big' : ''}${m.failed ? ' failed' : ''}${m.deleted ? ' deleted' : ''}${m.reactions?.length ? ' has-react' : ''}${flash === m.id ? ' flash' : ''}`}
                  >
                    {m.replyTo && (
                      <button type="button" className="msg-quote" onClick={() => jumpTo(m.replyTo!.id)}>
                        <span className="mq-label"><Icon name="reply" size={13} /> {mine ? t(`You replied to ${m.replyTo.from === peer?.id ? peer?.username : 'yourself'}`, m.replyTo.from === peer?.id ? `আপনি ${peer?.username}-কে উত্তর দিয়েছেন` : 'আপনি নিজের মেসেজে উত্তর দিয়েছেন') : t(`${peer?.username} replied to ${m.replyTo.from === peer?.id ? 'themselves' : 'you'}`, m.replyTo.from === peer?.id ? `${peer?.username} নিজের মেসেজে উত্তর দিয়েছে` : `${peer?.username} আপনাকে উত্তর দিয়েছে`)}</span>
                        <span className="mq-body"><QuoteText q={m.replyTo} /></span>
                      </button>
                    )}
                    {swipe?.id === m.id && <span className={`swipe-hint${Math.abs(swipe.dx) >= 64 ? ' ready' : ''}`} style={{ opacity: Math.min(1, Math.abs(swipe.dx) / 64) }} aria-hidden><Icon name="reply" size={18} /></span>}
                    <div
                      className={`bubble${picked?.id === m.id ? ' picked' : ''}${m.kind === 'image' && m.media?.url ? ' photo' : ''}${m.kind === 'call' ? ' call-rec' : ''}`}
                      style={swipe?.id === m.id ? { transform: `translateX(${swipe.dx}px)`, transition: 'none' } : undefined}
                      onPointerDown={(e) => swipeDown(e, m)}
                      onPointerMove={(e) => swipeMove(e, mine)}
                      onPointerUp={() => swipeUp(m)}
                      onPointerCancel={() => swipeUp(m)}
                      onPointerLeave={() => swipeUp(m)}
                      onDoubleClick={() => void react(m, '❤️')}
                      onContextMenu={(e) => (e.preventDefault(), holdEnd(), setPicked(m))}
                    >
                      {m.deleted ? (
                        <span className="msg-text msg-gone"><Icon name="ban" size={15} /> {mine ? t('You deleted this message', 'আপনি মেসেজটি মুছে ফেলেছেন') : t('This message was deleted', 'মেসেজটি মুছে ফেলা হয়েছে')}</span>
                      ) : m.kind === 'image' ? (
                        m.media?.url ? (
                          <button type="button" className="msg-photo" onClick={(e) => (e.stopPropagation(), setViewer(m.media!.url))} style={m.media.w && m.media.h ? { aspectRatio: `${m.media.w} / ${m.media.h}` } : undefined}>
                            <img src={m.media.url} alt={t('Photo', 'ছবি')} loading="lazy" decoding="async" />
                          </button>
                        ) : (
                          <span className="msg-text msg-gone"><Icon name="image" size={15} /> {m.media?.gone === 'owner' ? t('Deleted by the photo owner', 'ছবির মালিক এটি মুছে দিয়েছেন') : t('Photo expired', 'ছবির মেয়াদ শেষ')}</span>
                        )
                      ) : m.kind === 'call' ? (
                        <CallRecord mine={mine} status={m.call?.status ?? 'done'} secs={m.call?.secs ?? 0} video={!!m.call?.video} onCall={() => callPeer(!!m.call?.video)} />
                      ) : m.kind === 'voice' ? (
                        <VoiceBubble url={m.media?.url ?? null} secs={m.media?.secs ?? 0} mine={mine} gone={m.media?.gone} />
                      ) : (
                        <span className="msg-text"><Linkify text={m.body} /></span>
                      )}
                      <span className="msg-meta">
                        {clock(m.createdAt, lang)}
                        {mine && !m.deleted && (m.pending ? <Icon name="clock" size={13} /> : m.failed ? null : <Icon name={m.readAt ? 'check-check' : 'check'} size={15} className={m.readAt ? 'seen' : undefined} />)}
                      </span>
                    </div>
                    {!!m.reactions?.length && (
                      <button type="button" className="msg-reacts" onClick={() => setPicked(m)} aria-label={t('Reactions', 'রিঅ্যাকশন')}>
                        {[...new Set(m.reactions.map((x) => x.r))].slice(0, 3).map((r) => <span key={r}>{r}</span>)}
                        {m.reactions.length > 1 && <b>{m.reactions.length}</b>}
                      </button>
                    )}
                    {m.failed && (
                      <button className="msg-retry" onClick={() => void send(m.body, m.id)}><Icon name="refresh" size={14} /> {t('Not sent · tap to retry', 'যায়নি · আবার চেষ্টা করুন')}</button>
                    )}
                    {mine && m.id === lastMineRead && groupEnd && <span className="msg-seen">{t('Seen', 'দেখেছে')}</span>}
                  </div>
                </Fragment>
              );
            })}
            {typing && (
              <div className="msg theirs top end">
                <div className="bubble typing-bubble" aria-label={t('typing…', 'টাইপ করছে…')}><i /><i /><i /></div>
              </div>
            )}
          </>
        )}
      </div>

      {chatOff ? (
        <div className="chat-blocked"><Icon name="info" size={18} /> {t('Chat is turned off for now.', 'চ্যাট এখন বন্ধ আছে।')}</div>
      ) : data?.blocked === 'me' ? (
        <div className="chat-blocked">
          <span>{t('You blocked this player.', 'আপনি এই প্লেয়ারকে ব্লক করেছেন।')}</span>
          <button className="btn sm primary" onClick={() => void act(() => api(`/blocks/${peer!.id}`, { method: 'DELETE' }), t('Player unblocked', 'আনব্লক করা হয়েছে'))}>{t('Unblock', 'আনব্লক')}</button>
        </div>
      ) : data?.chatBlocked === 'me' && peer ? (
        <div className="chat-blocked">
          <span>{t('You blocked messages from this player.', 'আপনি এই প্লেয়ারের মেসেজ ব্লক করেছেন।')}</span>
          <button className="btn sm primary" onClick={() => void act(() => api(`/chats/${peer.uid}/block`, { method: 'DELETE' }), t('Chat unblocked', 'চ্যাট আনব্লক করা হয়েছে'))}>{t('Unblock chat', 'চ্যাট আনব্লক')}</button>
        </div>
      ) : data?.chatBlocked === 'them' ? (
        <div className="chat-blocked"><Icon name="ban" size={18} /> {t('This player isn’t accepting your messages.', 'এই প্লেয়ার এখন আপনার মেসেজ নিচ্ছে না।')}</div>
      ) : data?.request && peer ? (
        <div className="chat-request">
          <Avatar name={peer.username} src={peer.avatarThumbUrl} size={46} />
          <b>{t(`${peer.username} wants to message you`, `${peer.username} আপনাকে মেসেজ পাঠাতে চায়`)}</b>
          <span className="small muted">{t('You are not friends. Accept to reply — they won’t see that you read it until you do.', 'আপনারা বন্ধু নন। উত্তর দিতে Accept করুন — Accept না করা পর্যন্ত সে জানবে না যে আপনি দেখেছেন।')}</span>
          <div className="row">
            <button className="btn danger grow" onClick={() => void act(() => api(`/chats/${peer.uid}/block`, { method: 'POST' }), t('Chat blocked', 'চ্যাট ব্লক করা হয়েছে'))}><Icon name="ban" /> {t('Block', 'ব্লক')}</button>
            <button className="btn soft grow" onClick={() => void act(() => api(`/chats/${peer.uid}/clear`, { method: 'POST' }), t('Request deleted', 'রিকোয়েস্ট মুছে ফেলা হয়েছে')).then(() => (onClose ? onClose() : nav('/friends')))}><Icon name="trash" /> {t('Delete', 'মুছুন')}</button>
            <button className="btn primary grow" onClick={() => void act(() => api(`/chats/${peer.uid}/accept`, { method: 'POST' }), t('Accepted — you can reply now', 'গ্রহণ করা হয়েছে — এখন উত্তর দিতে পারবেন'))}><Icon name="check" /> {t('Accept', 'Accept')}</button>
          </div>
        </div>
      ) : data?.blocked === 'them' ? (
        <div className="chat-blocked"><Icon name="ban" size={18} /> {t('You can’t message this player.', 'এই প্লেয়ারকে মেসেজ পাঠানো যাবে না।')}</div>
      ) : (
        <div className="chat-compose-wrap">
          {emojiOpen && (
            <div className="emoji-grid" role="listbox" aria-label={t('Emoji', 'ইমোজি')}>
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => (haptic('tap'), setText((v) => v + e))} aria-label={e}>{e}</button>
              ))}
            </div>
          )}
          {replying && (
            <div className="reply-bar">
              <Icon name="reply" size={18} />
              <span className="grow">
                <b>{replying.from === peer?.id ? t(`Replying to ${peer?.username}`, `${peer?.username}-কে উত্তর দিচ্ছেন`) : t('Replying to yourself', 'নিজের মেসেজে উত্তর দিচ্ছেন')}</b>
                <small><QuoteText q={quoteOf(replying)} /></small>
              </span>
              <button type="button" className="btn icon sm ghost" aria-label={t('Cancel reply', 'উত্তর বাতিল')} onClick={() => setReplying(null)}><Icon name="close" size={18} /></button>
            </div>
          )}
          {voice.recording ? (
            <div className="chat-compose voice-rec" role="group" aria-label={t('Recording voice message', 'ভয়েস মেসেজ রেকর্ড হচ্ছে')}>
              <button type="button" className="btn icon ghost danger-text" aria-label={t('Delete recording', 'রেকর্ডিং মুছুন')} onClick={() => (haptic('tap'), voice.cancel())}><Icon name="trash" size={22} /></button>
              <span className="vr-bar grow"><i className="vr-dot" /> {fmtSecs(voice.secs, lang)} <span className="vr-hint">{holding ? t('Release to send', 'ছেড়ে দিলে চলে যাবে') : t('Recording… max 2 min', 'রেকর্ড হচ্ছে… সর্বোচ্চ ২ মিনিট')}</span></span>
              <button type="button" className="chat-send" aria-label={t('Send voice message', 'ভয়েস মেসেজ পাঠান')} onClick={() => void sendVoice()}><Icon name="send" size={21} /></button>
            </div>
          ) : (
          <form className="chat-compose" onSubmit={submit}>
            <button type="button" className={`btn icon ghost${emojiOpen ? ' on' : ''}`} aria-label={t('Emoji', 'ইমোজি')} aria-pressed={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}><Icon name="smile" size={23} /></button>
            {imagesOn && <button type="button" className="btn icon ghost" aria-label={t('Send a photo', 'ছবি পাঠান')} disabled={!peer} onClick={() => (haptic('tap'), needPremium('photos') || setPhotoMenu(true))}><Icon name="image" size={22} /></button>}
            <textarea
              ref={input}
              className="chat-input"
              rows={1}
              value={text}
              maxLength={1000}
              placeholder={t('Message…', 'মেসেজ লিখুন…')}
              aria-label={t('Message', 'মেসেজ')}
              onChange={(e) => onType(e.target.value)}
              onFocus={() => setEmojiOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
                  e.preventDefault();
                  submit();
                }
              }}
              disabled={!peer}
            />
            {voiceOn && !text.trim() ? (
              <button type="button" className="chat-send mic" aria-label={t('Record voice message: hold to talk, or tap', 'ভয়েস মেসেজ: চেপে ধরে বলুন, বা একবার চাপুন')} disabled={!peer} onPointerDown={micDown} onContextMenu={(e) => e.preventDefault()}><Icon name="mic" size={21} /></button>
            ) : (
              <button className="chat-send" aria-label={t('Send', 'পাঠান')} disabled={!text.trim() || !peer}><Icon name="send" size={21} /></button>
            )}
          </form>
          )}
        </div>
      )}

      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => (void sendPhoto(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (void sendPhoto(e.target.files?.[0]), (e.target.value = ''))} />
      <Sheet open={photoMenu} onClose={() => setPhotoMenu(false)} title={t('Send a photo', 'ছবি পাঠান')} icon="image">
        <section className="menu">
          <button className="menu-row" onClick={() => galleryInput.current?.click()}>
            <IconTile name="image" tone="primary" size={40} /><span className="m-text"><b>{t('From gallery', 'গ্যালারি থেকে')}</b><small>{t('Made small before sending', 'পাঠানোর আগে ছোট করা হয়')}</small></span>
          </button>
          <button className="menu-row" onClick={() => cameraInput.current?.click()}>
            <IconTile name="camera" tone="success" size={40} /><span className="m-text"><b>{t('Take a photo', 'ক্যামেরা দিয়ে তুলুন')}</b><small>{t('Photos only, no videos', 'শুধু ছবি, ভিডিও নয়')}</small></span>
          </button>
        </section>
      </Sheet>
      {viewer && (
        <div className="photo-viewer" role="dialog" aria-label={t('Photo', 'ছবি')} onClick={() => setViewer(null)}>
          <img src={viewer} alt="" onClick={(e) => e.stopPropagation()} />
          <div className="pv-bar" onClick={(e) => e.stopPropagation()}>
            <button className="pv-btn" aria-label={t('Close', 'বন্ধ করুন')} onClick={() => setViewer(null)}><Icon name="close" size={22} /></button>
            <span className="grow" />
            <button className="pv-btn" aria-label={t('Forward', 'ফরওয়ার্ড')} onClick={() => { const m = data?.items.find((x) => x.media?.url === viewer); if (m) setForwarding(m); setViewer(null); }}><Icon name="send" size={20} /></button>
            <button className="pv-btn" aria-label={t('Share', 'শেয়ার')} onClick={() => void sharePhoto(viewer)}><Icon name="share" size={20} /></button>
            <button className="pv-btn" aria-label={t('Save photo', 'ছবি সেভ করুন')} onClick={() => void savePhoto(viewer)}><Icon name="download" size={20} /></button>
          </div>
        </div>
      )}
      <ForwardSheet message={forwarding} onClose={() => setForwarding(null)} />

      <Sheet open={menu} onClose={() => setMenu(false)} title={peer?.username ?? ''} icon="message">
        {peer && (
          <section className="menu-list">
            <Link className="menu-row" to={`/u/${peer.uid}`} onClick={() => setMenu(false)}>
              <IconTile name="user" tone="primary" size={40} /><span className="m-text"><b>{t('View profile', 'প্রোফাইল দেখুন')}</b><small>{peer.uid}</small></span>
            </Link>
            <button className="menu-row" onClick={() => { const on = !useSettings.getState().chatHeads; useSettings.getState().set({ chatHeads: on }); haptic('tap'); toast.success(on ? t('Chat heads turned on', 'চ্যাট হেড চালু হয়েছে') : t('Chat heads turned off', 'চ্যাট হেড বন্ধ হয়েছে'), undefined, 'message'); }}>
              <IconTile name="message" tone="accent" size={40} /><span className="m-text"><b>{chatHeads ? t('Turn off chat heads', 'চ্যাট হেড বন্ধ করুন') : t('Turn on chat heads', 'চ্যাট হেড চালু করুন')}</b><small>{t('Round bubbles that pop up for new messages', 'নতুন মেসেজে গোল বাবল ভেসে উঠবে')}</small></span>
              <span className={`switch-dot${chatHeads ? ' on' : ''}`} aria-hidden />
            </button>
            <button className="menu-row" onClick={() => (setMenu(false), setClearAsk(true))}>
              <IconTile name="trash" tone="cyan" size={40} /><span className="m-text"><b>{t('Clear chat', 'চ্যাট মুছুন')}</b><small>{t('Removes the messages only for you', 'শুধু আপনার কাছ থেকে মেসেজগুলো মুছে যাবে')}</small></span>
            </button>
            <button className="menu-row" onClick={() => (setMenu(false), setReport(true))}>
              <IconTile name="flag" tone="warning" size={40} /><span className="m-text"><b>{t('Report', 'রিপোর্ট করুন')}</b><small>{t('Abuse, spam or bad messages', 'গালাগালি, স্প্যাম বা খারাপ মেসেজ')}</small></span>
            </button>
            {data?.blocked === 'me' ? (
              <button className="menu-row" onClick={() => (setMenu(false), void act(() => api(`/blocks/${peer.id}`, { method: 'DELETE' }), t('Player unblocked', 'আনব্লক করা হয়েছে')))}>
                <IconTile name="user-check" tone="success" size={40} /><span className="m-text"><b>{t('Unblock player', 'প্লেয়ার আনব্লক করুন')}</b></span>
              </button>
            ) : data?.chatBlocked === 'me' ? (
              <button className="menu-row" onClick={() => (setMenu(false), void act(() => api(`/chats/${peer.uid}/block`, { method: 'DELETE' }), t('Chat unblocked', 'চ্যাট আনব্লক করা হয়েছে')))}>
                <IconTile name="user-check" tone="success" size={40} /><span className="m-text"><b>{t('Unblock chat', 'চ্যাট আনব্লক করুন')}</b><small>{t('They can message you again', 'সে আবার আপনাকে মেসেজ দিতে পারবে')}</small></span>
              </button>
            ) : (
              <button className="menu-row danger" onClick={() => (setMenu(false), void act(() => api(`/chats/${peer.uid}/block`, { method: 'POST' }), t('Chat blocked', 'চ্যাট ব্লক করা হয়েছে')))}>
                <IconTile name="ban" tone="danger" size={40} /><span className="m-text"><b>{t('Block chat', 'চ্যাট ব্লক করুন')}</b><small>{t('Only stops messages — you stay friends and can still play', 'শুধু মেসেজ বন্ধ হবে — বন্ধুত্ব আর খেলা আগের মতোই থাকবে')}</small></span>
              </button>
            )}
          </section>
        )}
      </Sheet>
      <Sheet open={!!picked} onClose={() => setPicked(null)} title={t('Message', 'মেসেজ')} icon="message">
        {picked && (
          <section className="menu-list">
            {!picked.deleted && picked.id > 0 && (
              <div className="react-bar" role="group" aria-label={t('React', 'রিঅ্যাকশন দিন')}>
                {REACTIONS.map((r) => (
                  <button key={r} type="button" className={picked.reactions?.some((x) => x.u === myId && x.r === r) ? 'on' : undefined} onClick={() => void react(picked, r)} aria-label={r}>{r}</button>
                ))}
              </div>
            )}
            {!picked.deleted &&
              (picked.kind === 'image' && picked.media?.url ? (
                <p className="msg-preview file"><Icon name="image" size={16} /> {fileNameOf(picked.media.url)}</p>
              ) : (
                <p className="msg-preview">{picked.kind ? <QuoteText q={quoteOf(picked)} /> : picked.body}</p>
              ))}
            {!!picked.reactions?.length && (
              <p className="xs muted react-who">
                {picked.reactions.map((x) => `${x.r} ${x.u === myId ? t('You', 'আপনি') : peer?.username}`).join(' · ')}
              </p>
            )}
            {!picked.deleted && picked.id > 0 && !data?.request && !data?.chatBlocked && !data?.blocked && (
              <button className="menu-row" onClick={() => startReply(picked)}>
                <IconTile name="reply" tone="cyan" size={40} /><span className="m-text"><b>{t('Reply', 'উত্তর দিন')}</b></span>
              </button>
            )}
            {!picked.deleted && picked.id > 0 && (!picked.kind || picked.media?.url) && (
              <button className="menu-row" onClick={() => (setForwarding(picked), setPicked(null))}>
                <IconTile name="send" tone="success" size={40} /><span className="m-text"><b>{t('Forward', 'ফরওয়ার্ড করুন')}</b><small>{t('Send it to a friend', 'বন্ধুকে পাঠান')}</small></span>
              </button>
            )}
            {!picked.deleted && picked.kind === 'image' && picked.media?.url && (
              <button className="menu-row" onClick={() => (void savePhoto(picked.media!.url!), setPicked(null))}>
                <IconTile name="download" tone="primary" size={40} /><span className="m-text"><b>{t('Save photo', 'ছবি সেভ করুন')}</b><small>{t('To your gallery', 'গ্যালারিতে')}</small></span>
              </button>
            )}
            {!picked.deleted && !picked.kind && (
              <button className="menu-row" onClick={() => void copyMsg(picked)}>
                <IconTile name="copy" tone="primary" size={40} /><span className="m-text"><b>{t('Copy text', 'লেখা কপি করুন')}</b></span>
              </button>
            )}
            {picked.to === peer?.id && picked.id > 0 && !picked.deleted && (
              <button className="menu-row danger" onClick={() => void deleteMsg(picked, true)}>
                <IconTile name="trash" tone="danger" size={40} /><span className="m-text"><b>{t('Delete for everyone', 'সবার জন্য মুছুন')}</b><small>{t('It disappears from both phones', 'দুজনের ফোন থেকেই মুছে যাবে')}</small></span>
              </button>
            )}
            <button className="menu-row" onClick={() => void deleteMsg(picked, false)}>
              <IconTile name="trash" tone="warning" size={40} /><span className="m-text"><b>{t('Delete for me', 'শুধু আমার জন্য মুছুন')}</b><small>{t('The other person still sees it', 'অন্যজন এখনো দেখতে পাবে')}</small></span>
            </button>
          </section>
        )}
      </Sheet>
      <Sheet open={clearAsk} onClose={() => setClearAsk(false)} title={t('Clear this chat?', 'চ্যাট মুছে ফেলবেন?')} icon="trash">
        <p className="muted">{t('All messages in this chat will be removed for you. The other person keeps their copy.', 'এই চ্যাটের সব মেসেজ শুধু আপনার কাছ থেকে মুছে যাবে। অন্যজনের কাছে থেকে যাবে।')}</p>
        <div className="row mt">
          <button className="btn grow" onClick={() => setClearAsk(false)}>{t('Cancel', 'বাতিল')}</button>
          <button
            className="btn danger grow"
            onClick={() => {
              setClearAsk(false);
              qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: [], hasMore: false } : d));
              void act(() => api(`/chats/${peer!.uid}/clear`, { method: 'POST' }), t('Chat cleared', 'চ্যাট মুছে ফেলা হয়েছে'));
            }}
          >
            <Icon name="trash" /> {t('Clear', 'মুছুন')}
          </button>
        </div>
      </Sheet>
      <Sheet open={report} onClose={() => setReport(false)} title={t('Report player', 'রিপোর্ট করুন')} icon="flag">
        <form
          className="col"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!peer) return;
            const f = new FormData(e.currentTarget);
            const recent = items.filter((m) => m.from === peer.id).slice(-5).map((m) => `“${m.body}”`).join(' / ');
            const details = [String(f.get('details') || ''), recent && `Chat: ${recent}`].filter(Boolean).join('\n').slice(0, 1000);
            await act(() => api('/reports', { body: { targetUid: peer.uid, reason: f.get('reason'), details: details || undefined } }), t('Report sent — thank you', 'রিপোর্ট পাঠানো হয়েছে — ধন্যবাদ'));
            setReport(false);
          }}
        >
          <div className="field">
            <label htmlFor="cr1">{t('Reason', 'কারণ')}</label>
            <select id="cr1" name="reason" className="input" defaultValue="abuse">{REPORT_REASONS.map((r) => <option key={r} value={r}>{reasonLabel(r)}</option>)}</select>
          </div>
          <div className="field">
            <label htmlFor="cr2">{t('Details (optional)', 'বিস্তারিত (ঐচ্ছিক)')}</label>
            <textarea id="cr2" name="details" className="input" maxLength={800} />
          </div>
          <p className="xs muted">{t('Their last few messages are attached so moderators can check.', 'যাচাইয়ের জন্য তার শেষ কয়েকটি মেসেজ রিপোর্টের সাথে যাবে।')}</p>
          <button className="btn danger block"><Icon name="flag" /> {t('Send report', 'রিপোর্ট পাঠান')}</button>
        </form>
      </Sheet>
    </div>
  );
}

/** "Chats" tab: every conversation, newest first, with unread counts; requests kept apart. */
export function ChatList({ onFind, filter = '' }: { onFind: () => void; filter?: string }) {
  const t = useT();
  const lang = useLang();
  const [showRequests, setShowRequests] = useState(false);
  const q = useQuery({ queryKey: ['chats'], queryFn: () => api<ThreadsData>('/chats'), refetchInterval: 60_000 });
  const typing = useChat((s) => s.typing);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} retry={q.refetch} />;
  const all = q.data?.items ?? [];
  const requests = all.filter((c) => c.request);
  const f = filter.trim().toLowerCase();
  const base = showRequests ? requests : all.filter((c) => !c.request);
  const list = f ? all.filter((c) => c.peer.username.toLowerCase().includes(f) || (c.peer.uid ?? '').toLowerCase().includes(f.replace(/^qw-?/, ''))) : base;
  if (f && !list.length) return null;
  const reqUnread = requests.reduce((s, c) => s + c.unread, 0);
  return (
    <>
      {showRequests ? (
        <button className="chat-req-bar back" onClick={() => setShowRequests(false)}>
          <Icon name="back" size={20} /> <b className="grow">{t('Message requests', 'মেসেজ রিকোয়েস্ট')}</b>
        </button>
      ) : requests.length > 0 ? (
        <button className="chat-req-bar" onClick={() => (haptic('tap'), setShowRequests(true))}>
          <span className="crb-ic"><Icon name="user-plus" size={20} /></span>
          <span className="grow">
            <b>{t('Message requests', 'মেসেজ রিকোয়েস্ট')}</b>
            <small>{t('From players who aren’t your friends', 'যারা আপনার বন্ধু নন তাদের মেসেজ')}</small>
          </span>
          <span className="chat-badge">{(reqUnread || requests.length).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en')}</span>
          <Icon name="chevron" size={18} />
        </button>
      ) : null}
      {!list.length ? (
        showRequests ? (
          <Empty icon="user-plus" title={t('No requests', 'কোনো রিকোয়েস্ট নেই')} />
        ) : (
          <Empty
            icon="message"
            title={t('No chats yet', 'এখনো কোনো চ্যাট নেই')}
            body={t('Open a friend or any player’s profile and tap Message to start chatting.', 'বন্ধু বা যেকোনো প্লেয়ারের প্রোফাইলে গিয়ে "মেসেজ" চাপলেই চ্যাট শুরু হবে।')}
            action={<button className="btn primary" onClick={onFind}><Icon name="users" /> {t('See friends', 'বন্ধুদের দেখুন')}</button>}
          />
        )
      ) : (
        <div className="list stagger chat-threads flat">
          {list.map((c) => {
            const isTyping = Date.now() - (typing[c.peer.id] ?? 0) < 4000;
            const mine = c.last.to === c.peer.id;
            return (
              <Link key={c.peer.id} to={`/chat/${c.peer.uid}`} className={`list-row chat-row${c.unread ? ' unread' : ''}`}>
                <Avatar name={c.peer.username} src={c.peer.avatarThumbUrl} status={c.status} size={52} frame={c.peer.frame} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="chat-row-top">
                    <b><PlayerName name={c.peer.username} verified={c.peer.verified} premium={c.peer.premium} /></b>
                    <small>{chatTime(c.last.createdAt, lang)}</small>
                  </span>
                  <span className="chat-row-bottom">
                    <span className={`chat-preview${isTyping ? ' typing-text' : ''}${c.last.deleted ? ' gone' : ''}`}>
                      {isTyping ? (
                        t('typing…', 'টাইপ করছে…')
                      ) : c.last.deleted ? (
                        <><Icon name="ban" size={13} /> {t('Message deleted', 'মেসেজ মুছে ফেলা হয়েছে')}</>
                      ) : (
                        <>{mine && <Icon name={c.last.readAt ? 'check-check' : 'check'} size={14} className={c.last.readAt ? 'seen' : undefined} />}{mine ? `${t('You', 'আপনি')}: ` : ''}{c.last.kind === 'voice' && <Icon name="mic" size={14} />}{c.last.kind === 'call' && <Icon name={c.last.call?.status === 'done' ? 'phone' : 'phone-off'} size={14} />}{previewText(c.last)}</>
                      )}
                    </span>
                    {c.unread > 0 && <span className="chat-badge">{c.unread > 99 ? '99+' : c.unread.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en')}</span>}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Reply quote from a message: voice / photo keep their kind (shown with an icon, not as text). */
function quoteOf(m: LiveMessage) {
  return { id: m.id, from: m.from, body: m.kind && m.kind !== 'call' ? '' : m.body, deleted: m.deleted, ...(m.kind === 'voice' || m.kind === 'image' ? { kind: m.kind, secs: m.media?.secs ?? 0 } : {}) };
}

function QuoteText({ q }: { q: { body: string; deleted?: boolean; kind?: string; secs?: number } }) {
  const t = useT();
  const lang = useLang();
  if (q.deleted) return <>{t('Message deleted', 'মেসেজ মুছে ফেলা হয়েছে')}</>;
  if (q.kind === 'voice') return <><Icon name="mic" size={13} /> {t('Voice message', 'ভয়েস মেসেজ')} ({fmtSecs(q.secs ?? 0, lang)})</>;
  if (q.kind === 'image') return <><Icon name="image" size={13} /> {t('Photo', 'ছবি')}</>;
  return <>{q.body}</>;
}

const LINK_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"]|[\w.+-]+@[\w-]+\.[\w.-]+)/gi;

/** Text with tappable links (open in the right app or the browser) and e-mail addresses. */
function Linkify({ text }: { text: string }) {
  const navTo = useNavigate();
  const parts = text.split(LINK_RE);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const isMail = !/^(https?:\/\/|www\.)/i.test(p) && p.includes('@');
        const href = isMail ? `mailto:${p}` : /^www\./i.test(p) ? `https://${p}` : p;
        const inApp = appPath(href);
        return (
          <a
            key={i}
            className="msg-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              // Our own links (war room, profile, …) open right here in the app.
              if (inApp) {
                e.preventDefault();
                navTo(inApp);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {p}
          </a>
        );
      })}
    </>
  );
}

/** Forward a message to friends (Messenger style: tap Send next to each friend). */
function ForwardSheet({ message, onClose }: { message: LiveMessage | null; onClose: () => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [sent, setSent] = useState<Record<number, 'busy' | 'done'>>({});
  const friends = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: any[] }>('/friends')).items, enabled: !!message });
  useEffect(() => {
    if (!message) {
      setQ('');
      setSent({});
    }
  }, [message]);
  const list = (friends.data ?? []).filter((f) => !q.trim() || f.user.username.toLowerCase().includes(q.trim().toLowerCase()) || String(f.user.uid).toLowerCase().includes(q.trim().toLowerCase()));
  const send = async (u: any) => {
    if (!message) return;
    setSent((s) => ({ ...s, [u.id]: 'busy' }));
    try {
      await api(`/chats/${u.uid}/forward`, { body: { messageId: message.id } });
      haptic('success');
      setSent((s) => ({ ...s, [u.id]: 'done' }));
    } catch (e) {
      setSent((s) => {
        const n = { ...s };
        delete n[u.id];
        return n;
      });
      toast.error(t('Not sent', 'পাঠানো যায়নি'), friendlyError(e));
    }
  };
  return (
    <Sheet open={!!message} onClose={onClose} title={t('Forward to', 'ফরওয়ার্ড করুন')} icon="send">
      {message && (
        <div className="fwd">
          <label className="chat-search">
            <Icon name="search" size={18} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search friends', 'বন্ধু খুঁজুন')} />
          </label>
          <div className="fwd-list">
            {!list.length && <p className="small muted" style={{ padding: 12 }}>{t('No friends found.', 'কোনো বন্ধু পাওয়া যায়নি।')}</p>}
            {list.map((f) => (
              <div key={f.user.id} className="fwd-row">
                <Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status} size={42} />
                <b className="grow ellipsis">{f.user.username}</b>
                <button className={`btn sm ${sent[f.user.id] === 'done' ? 'soft' : 'primary'}`} disabled={!!sent[f.user.id]} onClick={() => void send(f.user)}>
                  {sent[f.user.id] === 'busy' ? <span className="spinner" /> : sent[f.user.id] === 'done' ? <><Icon name="check" /> {t('Sent', 'পাঠানো হয়েছে')}</> : t('Send', 'পাঠান')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Readable file name for a chat photo, e.g. QuizWar-photo-2026-11-04-mw2lzdx0.jpg */
function fileNameOf(url: string) {
  const base = (url.split('/').pop() ?? 'photo').split('?')[0]!.replace(/\.[a-z0-9]+$/i, '');
  const day = /\/(\d{4}-\d{2}-\d{2})\//.exec(url)?.[1] ?? new Date().toISOString().slice(0, 10);
  const id = base.split('-').pop()?.slice(0, 8) ?? 'img';
  return `QuizWar-photo-${day}-${id}.jpg`;
}

/** Path inside the app for a QUIZ WAR link (war room code, profile, chat…), or null. */
function appPath(href: string): string | null {
  try {
    const u = new URL(href);
    const own = new Set([window.location.host, new URL(PUBLIC_WEB_URL).host, 'quizwar.webtecit.com']);
    if (!own.has(u.host)) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

/** A call in the chat: "Audio call · 3:12" or "Missed call", tap to call back. */
function CallRecord({ mine, status, secs, video, onCall }: { mine: boolean; status: string; secs: number; video?: boolean; onCall: () => void }) {
  const t = useT();
  const lang = useLang();
  const done = status === 'done';
  const title = done
    ? video
      ? t('Video call', 'ভিডিও কল')
      : t('Audio call', 'অডিও কল')
    : mine
      ? status === 'cancelled'
        ? t('Call cancelled', 'কল বাতিল')
        : t('No answer', 'ধরেনি')
      : video
        ? t('Missed video call', 'মিসড ভিডিও কল')
        : t('Missed call', 'মিসড কল');
  const sub = done ? fmtSecs(secs, lang) : t('Call back', 'আবার কল করুন');
  return (
    <button type="button" className={`msg-call${done ? '' : ' missed'}`} onClick={(e) => (e.stopPropagation(), onCall())} onPointerDown={(e) => e.stopPropagation()}>
      <span className="mc-ic"><Icon name={video ? 'video' : done ? 'phone' : 'phone-off'} size={15} /></span>
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </button>
  );
}
