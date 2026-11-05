import { useEffect, useState } from 'react';
import { answerCall, declineCall, hangUp, toggleCallMute, toggleLoud, useCall } from '../lib/call';
import { num, useLang, useT } from '../lib/i18n';
import { isNative } from '../lib/platform';
import { useVoice } from '../lib/voice';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

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
  const talking = useVoice((s) => !!(call && s.speaking[call.peer.id]));
  const [, tick] = useState(0);

  useEffect(() => {
    if (call?.phase !== 'live') return;
    const i = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(i);
  }, [call?.phase]);

  if (!call) return null;
  const { peer, phase, dir } = call;
  const time = num(clock(Date.now() - call.startedAt), lang);
  const status =
    phase === 'live'
      ? time
      : phase === 'ended'
        ? call.endText
        : phase === 'connecting'
          ? t('Connecting…', 'সংযোগ হচ্ছে…')
          : dir === 'in'
            ? t('Incoming audio call', 'অডিও কল আসছে')
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

      <div className="cs-who">
        <div className={`cs-av${ringing ? ' ring' : ''}${talking && phase === 'live' ? ' talk' : ''}`}>
          <i /><i /><i />
          <Avatar name={peer.username} src={peer.avatarUrl ?? peer.avatarThumbUrl} size={132} />
        </div>
        <h2>{peer.username}</h2>
        <p className={`cs-status${phase === 'live' ? ' live' : ''}`}>{status}</p>
        {phase === 'live' && !micOn && <p className="cs-muted"><Icon name="mic-off" size={14} /> {t('Your mic is off', 'আপনার মাইক বন্ধ')}</p>}
      </div>

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
            <button type="button" className="cs-btn end" onClick={hangUp} aria-label={t('End call', 'কল কাটুন')}><Icon name="phone-off" size={30} /></button>
            <small>{t('End', 'কাটুন')}</small>
          </span>
        </div>
      )}
    </div>
  );
}
