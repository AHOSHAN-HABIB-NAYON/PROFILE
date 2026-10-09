import type { BattleRequestView } from '@quizwar/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api, friendlyError } from '../lib/api';
import { useGame } from '../lib/game';
import { num, useLang, useT } from '../lib/i18n';
import { useInvites, type FriendInvite } from '../lib/invites';
import { haptic } from '../lib/platform';
import { serverNow } from '../lib/game';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';
import { Avatar } from './Avatar';
import { Icon, IconTile } from './Icon';
import { Modal } from './Sheet';

/** Circular countdown around the challenger's avatar. */
function TimerRing({ expiresAt, total, children }: { expiresAt: number; total: number; children: React.ReactNode }) {
  const [left, setLeft] = useState(() => Math.max(0, expiresAt - serverNow()));
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const l = Math.max(0, expiresAt - serverNow());
      setLeft(l);
      if (l > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [expiresAt]);
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, left / total);
  return (
    <div className="invite-ring">
      <svg width="124" height="124" viewBox="0 0 124 124" aria-hidden>
        <circle cx="62" cy="62" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
        <circle cx="62" cy="62" r={r} fill="none" stroke={p < 0.25 ? 'var(--danger)' : 'var(--success)'} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 62 62)" />
      </svg>
      <div className="ir-inner">{children}</div>
      <span className="ir-time num">{Math.ceil(left / 1000)}s</span>
    </div>
  );
}

function BattleInvite({ req }: { req: BattleRequestView }) {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const qc = useQueryClient();
  const remove = useInvites((s) => s.removeBattle);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const total = Math.max(1000, req.expiresAt - serverNow());
  const [totalMs] = useState(total);

  useEffect(() => {
    const id = setTimeout(() => remove(req.id), Math.max(0, req.expiresAt - serverNow()) + 300);
    return () => clearTimeout(id);
  }, [req.id, req.expiresAt, remove]);

  const accept = async () => {
    setBusy('accept');
    try {
      const r = await api<{ matchId: string }>(`/battles/requests/${req.id}/accept`, { method: 'POST' });
      haptic('success');
      sfx('start');
      remove(req.id);
      useGame.getState().reset(r.matchId);
      nav(`/war-room/${r.matchId}`);
    } catch (e) {
      toast.error(t('Could not accept', 'গ্রহণ করা যায়নি'), friendlyError(e));
      remove(req.id);
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: ['battle-requests'] });
    }
  };
  const decline = async () => {
    setBusy('decline');
    await api(`/battles/requests/${req.id}/decline`, { method: 'POST' }).catch(() => undefined);
    remove(req.id);
    setBusy(null);
    void qc.invalidateQueries({ queryKey: ['battle-requests'] });
  };

  return (
    <Modal open onClose={() => void decline()} label={t('Battle challenge', 'ব্যাটল চ্যালেঞ্জ')} dismissible={false}>
      <div className="invite-head danger">
        <Icon name="swords" size={18} /> {t('Battle challenge!', 'ব্যাটল চ্যালেঞ্জ!')}
      </div>
      <TimerRing expiresAt={req.expiresAt} total={totalMs}>
        <Avatar name={req.from.username} src={req.from.avatarThumbUrl ?? req.from.avatarUrl} size={92} frame={req.from.frame} />
      </TimerRing>
      <h2 className="invite-name">{req.from.username}</h2>
      <p className="xs faint">
        {req.from.uid} · {t('Level', 'লেভেল')} {num(req.from.level, lang)}
      </p>
      <p>{t('wants to battle you right now', 'আপনার সাথে এখনই লড়তে চায়')}</p>
      <div className="invite-chips">
        <span className="chip primary"><Icon name="swords" /> 1 VS 1</span>
        <span className="chip"><Icon name="list" /> {num(req.questionCount, lang)} {t('questions', 'প্রশ্ন')}</span>
        <span className="chip"><Icon name="timer" /> {num(req.questionTimeSec, lang)}{t('s each', ' সেকেন্ড')}</span>
        {req.category && <span className="chip accent"><Icon name="book" /> {req.category.name}</span>}
      </div>
      <div className="modal-actions">
        <button className="btn outline" disabled={!!busy} onClick={() => void decline()}>
          {busy === 'decline' ? <span className="spinner" /> : <Icon name="close" />} {t('Decline', 'ফিরিয়ে দিন')}
        </button>
        <button className="btn success" disabled={!!busy} onClick={() => void accept()}>
          {busy === 'accept' ? <span className="spinner" /> : <Icon name="check" />} {t('Accept', 'গ্রহণ করুন')}
        </button>
      </div>
    </Modal>
  );
}

function FriendInviteModal({ inv }: { inv: FriendInvite }) {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const qc = useQueryClient();
  const remove = useInvites((s) => s.removeFriend);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline');
    try {
      await api(`/friends/requests/${inv.requestId}/${accept ? 'accept' : 'reject'}`, { method: 'POST' });
      if (accept) {
        haptic('success');
        sfx('reward');
        toast.success(t('You are now friends!', 'আপনারা এখন বন্ধু!'), inv.from.username, 'user-check');
      }
    } catch (e) {
      toast.error(t('Something went wrong', 'কিছু একটা সমস্যা হয়েছে'), friendlyError(e));
    } finally {
      remove(inv.requestId);
      setBusy(null);
      void qc.invalidateQueries({ queryKey: ['friends'] });
      void qc.invalidateQueries({ queryKey: ['friend-requests'] });
    }
  };
  return (
    <Modal open onClose={() => remove(inv.requestId)} label={t('Friend request', 'ফ্রেন্ড রিকোয়েস্ট')}>
      <div className="invite-head">
        <Icon name="user-add" size={18} /> {t('Friend request', 'ফ্রেন্ড রিকোয়েস্ট')}
      </div>
      <div className="m-art" style={{ marginTop: 6 }}>
        <span className="friend-art">
          <Avatar name={inv.from.username} src={inv.from.avatar} size={88} />
          <IconTile name="handshake" tone="success" size={36} anim="pop" />
        </span>
      </div>
      <h2 className="invite-name">{inv.from.username}</h2>
      <p className="xs faint">
        {inv.from.uid} · {t('Level', 'লেভেল')} {num(inv.from.level ?? 1, lang)}
      </p>
      <p>{t('wants to be your friend', 'আপনার বন্ধু হতে চায়')}</p>
      <button className="link-btn" style={{ margin: '8px auto 0' }} onClick={() => (remove(inv.requestId), nav(`/u/${inv.from.uid}`))}>
        <Icon name="user" size={16} /> {t('View profile', 'প্রোফাইল দেখুন')}
      </button>
      <div className="modal-actions">
        <button className="btn outline" disabled={!!busy} onClick={() => void respond(false)}>
          {busy === 'decline' ? <span className="spinner" /> : <Icon name="close" />} {t('Decline', 'বাতিল')}
        </button>
        <button className="btn primary" disabled={!!busy} onClick={() => void respond(true)}>
          {busy === 'accept' ? <span className="spinner" /> : <Icon name="check" />} {t('Accept', 'গ্রহণ করুন')}
        </button>
      </div>
    </Modal>
  );
}

/** Shows one invitation at a time; battle challenges first (they expire). */
export function IncomingInvites() {
  const battles = useInvites((s) => s.battles);
  const friends = useInvites((s) => s.friends);
  const loc = useLocation();
  const inMatch = /^\/(match|war-room)\//.test(loc.pathname);
  if (inMatch) return null;
  if (battles.length) return <BattleInvite key={battles[0].id} req={battles[0]} />;
  if (friends.length) return <FriendInviteModal key={friends[0].requestId} inv={friends[0]} />;
  return null;
}
