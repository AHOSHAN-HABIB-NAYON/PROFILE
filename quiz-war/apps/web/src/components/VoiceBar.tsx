import { useEffect, useState } from 'react';
import { useConfig } from '../hooks/queries';
import { useCall } from '../lib/call';
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
  /** Team games: my teammate or an opponent (colours the chip). */
  side?: 'mine' | 'opp';
}

const EXPLAINED = 'qw-voice-explained';
/** Rooms where the player left voice on purpose (no auto-join again there). */
const skipped = new Set<string>();

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
  /** 3+ other players (2 VS 2 and bigger rooms): pictures only, to fit one line. */
  const compact = others.length >= 3;
  const teams = others.some((p) => p.side === 'mine') && others.some((p) => p.side === 'opp');

  // Entering the room / match: listen to everyone right away (my mic stays off until I tap it).
  // During an audio call the call has the mic; match voice waits until it ends.
  const inCall = useCall((s) => !!s.call && s.call.phase !== 'ended');
  const enabled = voiceSupported() && cfg?.voiceEnabled !== false && others.length > 0 && !inCall;
  useEffect(() => {
    watchVoice(roomId);
    if (!enabled) return;
    const st0 = useVoice.getState();
    if (st0.roomId !== roomId && !st0.joining && !skipped.has(roomId)) void joinVoice(roomId, false).catch(() => undefined);
  }, [roomId, enabled]);


  if (!enabled) return null;

  const start = async () => {
    haptic('tap');
    skipped.delete(roomId);
    try {
      if (useVoice.getState().roomId === roomId) await setMic(true);
      else await joinVoice(roomId, true);
    } catch {
      toast.error(t('Microphone blocked', 'মাইক্রোফোনের অনুমতি নেই'), t('Allow the microphone for QUIZ WAR in your phone settings.', 'ফোনের সেটিংসে QUIZ WAR-এর মাইক্রোফোন চালু করুন।'));
    }
  };
  const tapMic = () => {
    if (!joined || !st.micOn) {
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
    void setMic(false);
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
        aria-label={!joined || !st.micOn ? t('Turn on my mic', 'আমার মাইক চালু করুন') : st.micOn ? t('Mute my mic', 'আমার মাইক বন্ধ') : t('Unmute my mic', 'আমার মাইক চালু')}
      >
        {st.joining ? <span className="spinner" /> : <Icon name={joined && st.micOn ? 'mic' : 'mic-off'} size={22} />}
      </button>
      <div className="vb-mid">
        {!joined ? (
          <span className="vb-hint">
            {someoneWaiting ? t('Players are talking — tap the mic to join', 'প্লেয়াররা কথা বলছে — যোগ দিতে মাইক চাপুন') : t('Voice is off · tap the mic to talk live', 'ভয়েস বন্ধ · লাইভ কথা বলতে মাইক চাপুন')}
          </span>
        ) : (
          <div className={`vb-peers${compact ? ' compact' : ''}`}>
            {teams && (
              <div className="vb-legend" aria-hidden>
                <span><i className="mine" /> {t('Teammate', 'দলের সাথী')}</span>
                <span><i className="opp" /> {t('Opponents', 'প্রতিপক্ষ')}</span>
              </div>
            )}
            <div className="vb-chips">
            {others.map((p) => {
              const m = inVoice(p.userId);
              const muted = !!st.mutedForMe[p.userId];
              return (
                <button
                  key={p.userId}
                  type="button"
                  className={`vb-peer ${st.speaking[p.userId] ? 'talking' : ''} ${m ? '' : 'away'} ${p.side ?? ''}`}
                  onClick={() => {
                    haptic('tap');
                    const now = toggleMuteForMe(p.userId);
                    toast.info(now ? t(`${p.name} muted for you only`, `${p.name}-কে শুধু আপনার জন্য মিউট করা হলো`) : t(`${p.name} unmuted`, `${p.name}-এর কথা আবার শুনবেন`), undefined, now ? 'mute' : 'volume');
                  }}
                  aria-label={muted ? t(`Unmute ${p.name}`, `${p.name}-কে আনমিউট`) : t(`Mute ${p.name} for me`, `${p.name}-কে আমার জন্য মিউট`)}
                >
                  <Avatar name={p.name} src={p.avatar ?? null} size={30} />
                  {!compact && <span className="vb-name">{p.name}</span>}
                  <Icon name={!m ? 'mic-off' : muted ? 'mute' : 'volume'} size={16} />
                </button>
              );
            })}
            </div>
          </div>
        )}
      </div>
      {joined && (
        <button type="button" className="vb-leave" onClick={() => (haptic('tap'), skipped.add(roomId), leaveVoice())} aria-label={t('Leave voice', 'ভয়েস থেকে বের হন')}>
          <Icon name="phone-off" size={19} />
        </button>
      )}

      <Modal open={explain} onClose={() => setExplain(false)} label={t('Live voice', 'লাইভ ভয়েস')}>
        <div className="m-art">
          <IconTile name="mic" tone="primary" size={72} />
        </div>
        <h2>{t('Talk live with players', 'প্লেয়ারদের সাথে লাইভ কথা বলুন')}</h2>
        <p>{t('Your phone will ask for microphone access. Voice goes directly between players and is never recorded. Tap the mic again to mute yourself; tap a player to mute them for you only.', 'ফোন মাইক্রোফোনের অনুমতি চাইবে। কথা সরাসরি প্লেয়ারদের মধ্যে যায়, কখনো রেকর্ড হয় না। আবার মাইক চাপলে আপনার মাইক বন্ধ হবে; কোনো প্লেয়ারে চাপলে শুধু আপনার জন্য মিউট।')}</p>
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
