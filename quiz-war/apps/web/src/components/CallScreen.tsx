import { useQuery } from '@tanstack/react-query';
import type { PublicUser } from '@quizwar/shared';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { addToCall, answerCall, declineCall, hangUp, toggleCallMute, toggleLoud, useCall } from '../lib/call';
import { num, useLang, useT } from '../lib/i18n';
import { isNative } from '../lib/platform';
import { useVoice } from '../lib/voice';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** Full-screen audio call (incoming, calling, talking), or a small bar while using the app. */
export function CallScreen() {
  const t = useT();
  const lang = useLang();
  const { call, small, loud, set } = useCall();
  const micOn = useVoice((s) => s.micOn);
  const speaking = useVoice((s) => s.speaking);
  const talking = !!(call && speaking[call.peer.id]);
  const meId = useAuth((s) => s.user?.id ?? 0);
  const [adding, setAdding] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (call?.phase !== 'live') return;
    const i = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(i);
  }, [call?.phase]);

  if (!call) return null;
  const { peer, phase, dir } = call;
  const others = (call.members ?? []).filter((m) => m.user.id !== meId);
  const group = others.length >= 2;
  const full = (call.members?.length ?? 2) >= 4;
  const time = num(clock(Date.now() - call.startedAt), lang);
  const status =
    phase === 'live'
      ? time
      : phase === 'ended'
        ? call.endText
        : phase === 'connecting'
          ? t('Connecting…', 'সংযোগ হচ্ছে…')
          : dir === 'in'
            ? call.with?.length
              ? t(`Group call with ${call.with.join(', ')}`, `${call.with.join(', ')}-এর সাথে গ্রুপ কল`)
              : t('Incoming audio call', 'অডিও কল আসছে')
            : t('Calling…', 'কল হচ্ছে…');

  if (small && phase !== 'ended')
    return (
      <div className="call-mini" role="status">
        <button type="button" className="cm-open" onClick={() => set({ small: false })}>
          <span className={`cm-dot${talking ? ' on' : ''}`} />
          <b>{peer.username}</b>
          <span>{phase === 'live' ? time : status}</span>
          <small>{t('Tap to return', 'ফিরতে চাপুন')}</small>
        </button>
        <button type="button" className="cm-end" onClick={hangUp} aria-label={t('End call', 'কল কাটুন')}>
          <Icon name="phone-off" size={18} />
        </button>
      </div>
    );

  const ringing = phase === 'calling' || phase === 'ringing';
  return (
    <div className={`call-screen ph-${phase}`} role="dialog" aria-modal="true" aria-label={t('Audio call', 'অডিও কল')}>
      <div className="cs-top">
        {phase !== 'ended' && !(dir === 'in' && phase === 'ringing') ? (
          <button type="button" className="cs-round" onClick={() => set({ small: true })} aria-label={t('Minimise', 'ছোট করুন')}>
            <Icon name="chevron-down" size={22} />
          </button>
        ) : (
          <span className="cs-round ghost" />
        )}
        <span className="cs-lock"><Icon name="lock" size={13} /> {t('Phone to phone · not recorded', 'সরাসরি ফোনে ফোনে · রেকর্ড হয় না')}</span>
        <span className="cs-round ghost" />
      </div>

      {group && phase !== 'ended' ? (
        <div className="cs-who">
          <div className={`cs-grid n${others.length}`}>
            {others.map((m) => (
              <div key={m.user.id} className={`cs-tile${m.state === 'ringing' ? ' ringing' : ''}`}>
                <div className={`cs-av sm${m.state === 'ringing' ? ' ring' : ''}${speaking[m.user.id] ? ' talk' : ''}`}>
                  <i /><i /><i />
                  <Avatar name={m.user.username} src={m.user.avatarUrl ?? m.user.avatarThumbUrl} size={78} />
                </div>
                <b className="ellipsis">{m.user.username}</b>
                <small>{m.state === 'ringing' ? t('Ringing…', 'রিং হচ্ছে…') : speaking[m.user.id] ? t('Talking…', 'কথা বলছে…') : '\u00a0'}</small>
              </div>
            ))}
          </div>
          <h2 className="cs-group-title">{t('Group call', 'গ্রুপ কল')}</h2>
          <p className={`cs-status${phase === 'live' ? ' live' : ''}`}>{status}</p>
        </div>
      ) : (
      <div className="cs-who">
        <div className={`cs-av${ringing ? ' ring' : ''}${talking && phase === 'live' ? ' talk' : ''}`}>
          <i /><i /><i />
          <Avatar name={peer.username} src={peer.avatarUrl ?? peer.avatarThumbUrl} size={132} />
        </div>
        <h2>{peer.username}</h2>
        <p className={`cs-status${phase === 'live' ? ' live' : ''}`}>{status}</p>
        {phase === 'live' && !micOn && <p className="cs-muted"><Icon name="mic-off" size={14} /> {t('Your mic is off', 'আপনার মাইক বন্ধ')}</p>}
      </div>
      )}

      {phase === 'ended' ? (
        <div className="cs-actions" />
      ) : dir === 'in' && phase === 'ringing' ? (
        <div className="cs-actions two">
          <span className="cs-act">
            <button type="button" className="cs-btn end" onClick={declineCall} aria-label={t('Decline', 'কেটে দিন')}><Icon name="phone-off" size={30} /></button>
            <small>{t('Decline', 'কেটে দিন')}</small>
          </span>
          <span className="cs-act">
            <button type="button" className="cs-btn accept" onClick={() => void answerCall()} aria-label={t('Answer', 'ধরুন')}><Icon name="phone" size={30} /></button>
            <small>{t('Answer', 'ধরুন')}</small>
          </span>
        </div>
      ) : (
        <div className="cs-actions">
          {isNative && (
            <span className="cs-act">
              <button type="button" className={`cs-btn soft${loud ? ' on' : ''}`} onClick={toggleLoud} aria-pressed={loud} aria-label={t('Speaker', 'স্পিকার')}><Icon name="volume" size={26} /></button>
              <small>{t('Speaker', 'স্পিকার')}</small>
            </span>
          )}
          <span className="cs-act">
            <button type="button" className={`cs-btn soft${phase === 'live' && !micOn ? ' on' : ''}`} onClick={toggleCallMute} disabled={phase !== 'live'} aria-pressed={!micOn} aria-label={t('Mute', 'মিউট')}><Icon name={phase === 'live' && !micOn ? 'mic-off' : 'mic'} size={26} /></button>
            <small>{phase === 'live' && !micOn ? t('Unmute', 'আনমিউট') : t('Mute', 'মিউট')}</small>
          </span>
          <span className="cs-act">
            <button type="button" className="cs-btn soft" onClick={() => setAdding(true)} disabled={phase !== 'live' || full} aria-label={t('Add people', 'যোগ করুন')}><Icon name="user-add" size={26} /></button>
            <small>{t('Add', 'যোগ করুন')}</small>
          </span>
          <span className="cs-act">
            <button type="button" className="cs-btn end" onClick={hangUp} aria-label={t('End call', 'কল কাটুন')}><Icon name="phone-off" size={30} /></button>
            <small>{t('End', 'কাটুন')}</small>
          </span>
        </div>
      )}
      <AddPeople open={adding && phase === 'live'} onClose={() => setAdding(false)} inCall={(call.members ?? []).map((m) => m.user.id).concat(peer.id, meId)} />
    </div>
  );
}

/** Pick friends to bring into the call (group call, up to 4 people). */
function AddPeople({ open, onClose, inCall }: { open: boolean; onClose: () => void; inCall: number[] }) {
  const t = useT();
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const friends = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: { user: PublicUser; status: string }[] }>('/friends')).items, enabled: open });
  const list = (friends.data ?? [])
    .filter((f) => !inCall.includes(f.user.id))
    .sort((a, b) => Number(b.status !== 'offline') - Number(a.status !== 'offline'));
  return (
    <Sheet open={open} onClose={onClose} title={t('Add to call', 'কলে যোগ করুন')} icon="user-add">
      <p className="small muted" style={{ margin: '0 4px 10px' }}>{t('Up to 4 people can talk together.', 'একসাথে সর্বোচ্চ ৪ জন কথা বলতে পারবে।')}</p>
      <div className="fwd-list">
        {!list.length && <p className="small muted" style={{ padding: 12 }}>{t('No friends to add.', 'যোগ করার মতো বন্ধু নেই।')}</p>}
        {list.map((f) => (
          <div key={f.user.id} className="fwd-row">
            <Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status as any} size={42} />
            <b className="grow ellipsis">{f.user.username}</b>
            <button
              className={`btn sm ${sent[f.user.id] ? 'soft' : 'primary'}`}
              disabled={!!sent[f.user.id]}
              onClick={() => void addToCall(f.user).then((ok) => ok && (setSent((s) => ({ ...s, [f.user.id]: true })), onClose()))}
            >
              {sent[f.user.id] ? t('Ringing', 'রিং হচ্ছে') : <><Icon name="phone" /> {t('Add', 'যোগ')}</>}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
