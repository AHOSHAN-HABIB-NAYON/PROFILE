import { REPORT_REASONS } from '@quizwar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar, statusLabel } from '../components/Avatar';
import { Empty, ErrorBox, Spinner } from '../components/Feedback';
import { Icon, IconTile } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { PlayerName } from '../components/Verified';
import { useConfig } from '../hooks/queries';
import { api, friendlyError } from '../lib/api';
import { addToThread, chatTime, markRead, threadKey, useChat, type LiveMessage, type ThreadData, type ThreadsData } from '../lib/chat';
import { useLang, useT } from '../lib/i18n';
import { reasonLabel } from '../lib/labels';
import { haptic } from '../lib/platform';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';

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

export default function Chat() {
  const { uid = '' } = useParams();
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

  const send = async (body: string, retryId?: number) => {
    if (!peer || !body.trim()) return;
    haptic('tap');
    const tempId = retryId ?? tempSeq--;
    const temp: LiveMessage = { id: tempId, from: -1, to: peer.id, body: body.trim(), createdAt: new Date().toISOString(), readAt: null, pending: true };
    stick.current = true;
    qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: [...d.items.filter((m) => m.id !== tempId), temp] } : d));
    try {
      const r = await api<{ message: LiveMessage }>(`/chats/${peer.uid}/messages`, { body: { body: temp.body } });
      addToThread(peer.uid, r.message, tempId);
      void qc.invalidateQueries({ queryKey: ['chats'] });
    } catch (e) {
      qc.setQueryData<ThreadData>(key, (d) => (d ? { ...d, items: d.items.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)) } : d));
      const code = (e as any)?.code;
      if (code === 'blocked' || code === 'blocked_by_you') void thread.refetch();
      toast.error(t('Message not sent', 'মেসেজ যায়নি'), friendlyError(e));
    }
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text;
    if (!body.trim()) return;
    setText('');
    void send(body);
    input.current?.focus();
  };

  const onType = (v: string) => {
    setText(v);
    if (peer && v && Date.now() - lastTyping.current > 2500) {
      lastTyping.current = Date.now();
      void emit('chat:typing', { to: peer.id }).catch(() => undefined);
    }
  };

  const upcoming = (what: string) => toast.info(t('Coming soon', 'আসছে পরের আপডেটে'), what, 'sparkles');

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

  if (thread.error && !data) {
    return (
      <div className="page stack">
        <ErrorBox error={thread.error} retry={thread.refetch} />
        <button className="btn outline block" onClick={() => nav('/friends')}><Icon name="arrow-left" /> {t('Back to chats', 'চ্যাটে ফিরে যান')}</button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const lastMineRead = [...items].reverse().find((m) => m.to === peer?.id && m.readAt)?.id;
  const chatOff = cfg && cfg.chatEnabled === false;

  return (
    <div className="chat-page">
      <header className="chat-head">
        <button className="btn icon ghost" aria-label={t('Back', 'ফিরে যান')} onClick={() => (history.length > 1 ? nav(-1) : nav('/friends'))}>
          <Icon name="back" size={24} />
        </button>
        {peer ? (
          <Link to={`/u/${peer.uid}`} className="chat-peer">
            <Avatar name={peer.username} src={peer.avatarThumbUrl} status={data?.status} size={42} frame={peer.frame} />
            <span className="grow">
              <b><PlayerName name={peer.username} verified={peer.verified} /></b>
              <small className={typing ? 'typing-text' : `status-text s-${data?.status}`}>{typing ? t('typing…', 'টাইপ করছে…') : statusLabel(data!.status)}</small>
            </span>
          </Link>
        ) : (
          <span className="grow" />
        )}
        <button className="btn icon ghost" aria-label={t('Voice call', 'কল')} onClick={() => upcoming(t('Voice calls', 'ভয়েস কল'))}><Icon name="phone" size={21} /></button>
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
              <p className="chat-note"><Icon name="clock" size={14} /> {t('Messages are deleted automatically after 7 days.', 'মেসেজগুলো ৭ দিন পর নিজে থেকে মুছে যায়।')}</p>
            )}
            {!items.length && peer && (
              <div className="chat-hello">
                <Avatar name={peer.username} src={peer.avatarUrl ?? peer.avatarThumbUrl} size={84} frame={peer.frame} />
                <b>{peer.username}</b>
                <span className="small muted">{t('Say hi and start the conversation!', 'হাই বলে কথা শুরু করুন!')}</span>
                <div className="row gap-sm" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                  {['👋 Hi!', 'আসসালামু আলাইকুম', '⚔️ খেলবে?'].map((q) => <button key={q} className="chip" onClick={() => void send(q)}>{q}</button>)}
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
              const big = isEmojiOnly(m.body);
              return (
                <Fragment key={m.id}>
                  {newDay && <div className="chat-day"><span>{dayLabel(m.createdAt, lang, t)}</span></div>}
                  <div className={`msg ${mine ? 'mine' : 'theirs'}${groupTop ? ' top' : ''}${groupEnd ? ' end' : ''}${big ? ' big' : ''}${m.failed ? ' failed' : ''}`}>
                    <div className="bubble">
                      <span className="msg-text">{m.body}</span>
                      <span className="msg-meta">
                        {new Date(m.createdAt).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-GB', { hour: 'numeric', minute: '2-digit' })}
                        {mine && (m.pending ? <Icon name="clock" size={13} /> : m.failed ? null : <Icon name={m.readAt ? 'check-check' : 'check'} size={15} className={m.readAt ? 'seen' : undefined} />)}
                      </span>
                    </div>
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
          <form className="chat-compose" onSubmit={submit}>
            <button type="button" className={`btn icon ghost${emojiOpen ? ' on' : ''}`} aria-label={t('Emoji', 'ইমোজি')} aria-pressed={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}><Icon name="smile" size={23} /></button>
            <button type="button" className="btn icon ghost" aria-label={t('Photo', 'ছবি')} onClick={() => upcoming(t('Sending photos', 'ছবি পাঠানো'))}><Icon name="image" size={22} /></button>
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
            <button className="chat-send" aria-label={t('Send', 'পাঠান')} disabled={!text.trim() || !peer}><Icon name="send" size={21} /></button>
          </form>
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={peer?.username ?? ''} icon="message">
        {peer && (
          <section className="menu-list">
            <Link className="menu-row" to={`/u/${peer.uid}`} onClick={() => setMenu(false)}>
              <IconTile name="user" tone="primary" size={40} /><span className="m-text"><b>{t('View profile', 'প্রোফাইল দেখুন')}</b><small>{peer.uid}</small></span>
            </Link>
            <button className="menu-row" onClick={() => (setMenu(false), setReport(true))}>
              <IconTile name="flag" tone="warning" size={40} /><span className="m-text"><b>{t('Report', 'রিপোর্ট করুন')}</b><small>{t('Abuse, spam or bad messages', 'গালাগালি, স্প্যাম বা খারাপ মেসেজ')}</small></span>
            </button>
            {data?.blocked === 'me' ? (
              <button className="menu-row" onClick={() => (setMenu(false), void act(() => api(`/blocks/${peer.id}`, { method: 'DELETE' }), t('Player unblocked', 'আনব্লক করা হয়েছে')))}>
                <IconTile name="user-check" tone="success" size={40} /><span className="m-text"><b>{t('Unblock', 'আনব্লক করুন')}</b></span>
              </button>
            ) : (
              <button className="menu-row danger" onClick={() => (setMenu(false), void act(() => api('/blocks', { body: { userId: peer.id } }), t('Player blocked', 'প্লেয়ার ব্লক করা হয়েছে')))}>
                <IconTile name="ban" tone="danger" size={40} /><span className="m-text"><b>{t('Block', 'ব্লক করুন')}</b><small>{t('They can’t message, find or challenge you', 'সে আর মেসেজ, খোঁজা বা চ্যালেঞ্জ করতে পারবে না')}</small></span>
              </button>
            )}
          </section>
        )}
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

/** "Chats" tab: every conversation, newest first, with unread counts. */
export function ChatList({ onFind }: { onFind: () => void }) {
  const t = useT();
  const lang = useLang();
  const q = useQuery({ queryKey: ['chats'], queryFn: () => api<ThreadsData>('/chats'), refetchInterval: 60_000 });
  const typing = useChat((s) => s.typing);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} retry={q.refetch} />;
  if (!q.data?.items.length) {
    return (
      <Empty
        icon="message"
        title={t('No chats yet', 'এখনো কোনো চ্যাট নেই')}
        body={t('Open a friend or any player’s profile and tap Message to start chatting.', 'বন্ধু বা যেকোনো প্লেয়ারের প্রোফাইলে গিয়ে "মেসেজ" চাপলেই চ্যাট শুরু হবে।')}
        action={<button className="btn primary" onClick={onFind}><Icon name="users" /> {t('See friends', 'বন্ধুদের দেখুন')}</button>}
      />
    );
  }
  return (
    <div className="card list stagger chat-threads">
      {q.data.items.map((c) => {
        const isTyping = Date.now() - (typing[c.peer.id] ?? 0) < 4000;
        const mine = c.last.to === c.peer.id;
        return (
          <Link key={c.peer.id} to={`/chat/${c.peer.uid}`} className={`list-row chat-row${c.unread ? ' unread' : ''}`}>
            <Avatar name={c.peer.username} src={c.peer.avatarThumbUrl} status={c.status} size={52} frame={c.peer.frame} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="chat-row-top">
                <b><PlayerName name={c.peer.username} verified={c.peer.verified} /></b>
                <small>{chatTime(c.last.createdAt, lang)}</small>
              </span>
              <span className="chat-row-bottom">
                <span className={`chat-preview${isTyping ? ' typing-text' : ''}`}>
                  {isTyping ? t('typing…', 'টাইপ করছে…') : <>{mine && <Icon name={c.last.readAt ? 'check-check' : 'check'} size={14} className={c.last.readAt ? 'seen' : undefined} />}{mine ? `${t('You', 'আপনি')}: ` : ''}{c.last.body}</>}
                </span>
                {c.unread > 0 && <span className="chat-badge">{c.unread > 99 ? '99+' : c.unread.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en')}</span>}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

