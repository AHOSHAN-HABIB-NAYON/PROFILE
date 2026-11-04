import { useEffect, useState } from 'react';
import { useConfig } from '../hooks/queries';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { toast } from '../lib/toast';
import { joinVoice, leaveVoice, setMic, toggleMuteForMe, useVoice, voiceSupported, watchVoice } from '../lib/voice';
import { Avatar } from './Avatar';
import { Icon, IconTile } from './Icon';
import { Modal } from './Sheet';

export interface VoicePlayer {
  userId: number;
  name: string;
  avatar?: string | null;
}

const EXPLAINED = 'qw-voice-explained';

/**
 * Live voice controls, shown at the bottom of the quiz match, the result page and the war room
 * lobby: my mic, and a speaker button per player (mutes them for me only).
 */
export function VoiceBar({ roomId, players, className = '' }: { roomId: string; players: VoicePlayer[]; className?: string }) {
  const t = useT();
  const cfg = useConfig().data;
  const st = useVoice();
  const [explain, setExplain] = useState(false);
  const joined = st.roomId === roomId;
  const members = st.members[roomId] ?? [];
  const others = players.filter((p) => p.userId > 0);

  useEffect(() => {
    watchVoice(roomId);
  }, [roomId]);

  if (!voiceSupported() || cfg?.voiceEnabled === false || !others.length) return null;

  const start = async () => {
    haptic('tap');
    try {
      await joinVoice(roomId);
    } catch {
      toast.error(t('Microphone blocked', 'মাইক্রোফোনের অনুমতি নেই'), t('Allow the microphone for QUIZ WAR in your phone settings.', 'ফোনের সেটিংসে QUIZ WAR-এর মাইক্রোফোন চালু করুন।'));
    }
  };
  const tapMic = () => {
    if (!joined) {
      let seen = false;
      try {
        seen = !!localStorage.getItem(EXPLAINED);
      } catch {
        /* ignore */
      }
      if (!seen) return setExplain(true);
      return void start();
    }
    haptic('tap');
    setMic(!st.micOn);
  };
  const inVoice = (uid: number) => members.find((m) => m.userId === uid);
  const someoneWaiting = !joined && others.some((p) => inVoice(p.userId));

  return (
    <div className={`voice-bar ${joined ? 'on' : ''} ${className}`} role="group" aria-label={t('Voice chat', 'ভয়েস চ্যাট')}>
      <button
        type="button"
        className={`vb-mic ${joined && st.micOn ? 'live' : ''} ${st.speaking[0] ? 'talking' : ''}`}
        onClick={tapMic}
        disabled={st.joining}
        aria-pressed={joined && st.micOn}
        aria-label={!joined ? t('Turn on voice', 'ভয়েস চালু করুন') : st.micOn ? t('Mute my mic', 'আমার মাইক বন্ধ') : t('Unmute my mic', 'আমার মাইক চালু')}
      >
        {st.joining ? <span className="spinner" /> : <Icon name={joined && st.micOn ? 'mic' : 'mic-off'} size={22} />}
      </button>
      <div className="vb-mid">
        {!joined ? (
          <span className="vb-hint">
            {someoneWaiting ? t('Opponent is in voice — tap the mic to talk', 'প্রতিপক্ষ ভয়েসে আছে — কথা বলতে মাইক চাপুন') : t('Mic is off · tap to talk live', 'মাইক বন্ধ · চাপলে লাইভ কথা বলুন')}
          </span>
        ) : (
          <div className="vb-peers">
            {others.map((p) => {
              const m = inVoice(p.userId);
              const muted = !!st.mutedForMe[p.userId];
              return (
                <button
                  key={p.userId}
                  type="button"
                  className={`vb-peer ${st.speaking[p.userId] ? 'talking' : ''} ${m ? '' : 'away'}`}
                  onClick={() => {
                    haptic('tap');
                    const now = toggleMuteForMe(p.userId);
                    toast.info(now ? t(`${p.name} muted for you only`, `${p.name}-কে শুধু আপনার জন্য মিউট করা হলো`) : t(`${p.name} unmuted`, `${p.name}-এর কথা আবার শুনবেন`), undefined, now ? 'mute' : 'volume');
                  }}
                  aria-label={muted ? t(`Unmute ${p.name}`, `${p.name}-কে আনমিউট`) : t(`Mute ${p.name} for me`, `${p.name}-কে আমার জন্য মিউট`)}
                >
                  <Avatar name={p.name} src={p.avatar ?? null} size={30} />
                  <span className="vb-name">{p.name}</span>
                  <Icon name={!m ? 'mic-off' : muted ? 'mute' : 'volume'} size={16} />
                </button>
              );
            })}
          </div>
        )}
      </div>
      {joined && (
        <button type="button" className="vb-leave" onClick={() => (haptic('tap'), leaveVoice())} aria-label={t('Leave voice', 'ভয়েস থেকে বের হন')}>
          <Icon name="phone-off" size={19} />
        </button>
      )}

      <Modal open={explain} onClose={() => setExplain(false)} label={t('Live voice', 'লাইভ ভয়েস')}>
        <div className="m-art">
          <IconTile name="mic" tone="primary" size={72} />
        </div>
        <h2>{t('Talk live with players', 'প্লেয়ারদের সাথে লাইভ কথা বলুন')}</h2>
        <p>{t('Your phone will ask for microphone access. Voice goes directly between players and is never recorded. You can mute anyone for yourself, and the mic turns off when you leave.', 'ফোন মাইক্রোফোনের অনুমতি চাইবে। কথা সরাসরি প্লেয়ারদের মধ্যে যায়, কখনো রেকর্ড হয় না। যে কাউকে নিজের জন্য মিউট করতে পারবেন, আর বের হলে মাইক বন্ধ হয়ে যায়।')}</p>
        <div className="modal-actions">
          <button className="btn outline" onClick={() => setExplain(false)}>{t('Not now', 'এখন না')}</button>
          <button
            className="btn primary"
            onClick={() => {
              try {
                localStorage.setItem(EXPLAINED, '1');
              } catch {
                /* ignore */
              }
              setExplain(false);
              void start();
            }}
          >
            <Icon name="mic" /> {t('Turn on', 'চালু করুন')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
