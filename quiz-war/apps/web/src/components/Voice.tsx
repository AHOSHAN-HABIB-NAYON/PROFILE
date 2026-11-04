import { useEffect, useRef, useState } from 'react';
import { num, useLang, useT } from '../lib/i18n';
import { Icon } from './Icon';

/** Max length of a chat voice message (seconds). Server allows the same. */
export const VOICE_MAX_SECS = 120;

/** Small, speech-friendly recording: mono Opus at ~16 kbps (≈ 20 KB per 10 s). */
function pickMime() {
  const opts = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of opts) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
}

export const canRecordVoice = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

export interface VoiceClip {
  blob: Blob;
  secs: number;
  mime: string;
}

/** Messenger-style recorder: start → (timer) → send or delete. */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const done = useRef<((c: VoiceClip | null) => void) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const cancelled = useRef(false);

  const cleanup = () => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    rec.current = null;
    setRecording(false);
  };

  useEffect(() => () => {
    cancelled.current = true;
    try {
      rec.current?.stop();
    } catch {
      /* ignore */
    }
    cleanup();
  }, []);

  const start = async (): Promise<boolean> => {
    if (rec.current) return true;
    const mime = pickMime();
    if (mime === null) return false;
    const s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    stream.current = s;
    const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 16000 });
    chunks.current = [];
    cancelled.current = false;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const elapsed = (Date.now() - started.current) / 1000;
      const type = (r.mimeType || mime || 'audio/webm').split(';')[0]!;
      const blob = new Blob(chunks.current, { type });
      cleanup();
      done.current?.(cancelled.current || elapsed < 0.8 || !blob.size ? null : { blob, secs: Math.min(VOICE_MAX_SECS, Math.round(elapsed)), mime: type });
      done.current = null;
    };
    rec.current = r;
    started.current = Date.now();
    r.start(1000);
    setSecs(0);
    setRecording(true);
    timer.current = window.setInterval(() => {
      const n = Math.floor((Date.now() - started.current) / 1000);
      setSecs(n);
      if (n >= VOICE_MAX_SECS) stop();
    }, 250);
    return true;
  };

  /** Stops and returns the clip (null if cancelled / too short). */
  const stop = () =>
    new Promise<VoiceClip | null>((resolve) => {
      if (!rec.current) return resolve(null);
      done.current = resolve;
      try {
        rec.current.stop();
      } catch {
        cleanup();
        resolve(null);
      }
    });

  const cancel = () => {
    cancelled.current = true;
    void stop();
  };

  return { recording, secs, start, stop, cancel };
}

export const fmtSecs = (s: number, lang: 'bn' | 'en') => num(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`, lang);

/** Only one voice message plays at a time. */
let playing: HTMLAudioElement | null = null;

/** Chat bubble player: play/pause, progress, length. */
export function VoiceBubble({ url, secs, mine }: { url: string | null; secs: number; mine: boolean }) {
  const t = useT();
  const lang = useLang();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => () => {
    audio.current?.pause();
    if (playing === audio.current) playing = null;
  }, []);

  if (!url)
    return (
      <span className="voice-msg expired">
        <Icon name="mic" size={16} /> {t('Voice message expired', 'ভয়েস মেসেজের মেয়াদ শেষ')}
      </span>
    );

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audio.current) {
      const a = new Audio(url);
      a.preload = 'auto';
      a.ontimeupdate = () => setPos(a.currentTime);
      a.onended = () => (setOn(false), setPos(0));
      a.onpause = () => setOn(false);
      a.onplay = () => setOn(true);
      a.onerror = () => (setFailed(true), setOn(false));
      audio.current = a;
    }
    const a = audio.current;
    if (a.paused) {
      if (playing && playing !== a) playing.pause();
      playing = a;
      void a.play().catch(() => setFailed(true));
    } else a.pause();
  };
  const dur = secs || 1;
  const pct = Math.min(100, (pos / dur) * 100);
  return (
    <span className={`voice-msg${mine ? ' mine' : ''}`}>
      <button type="button" className="vm-play" onClick={toggle} onPointerDown={(e) => e.stopPropagation()} aria-label={on ? t('Pause', 'থামান') : t('Play voice message', 'ভয়েস মেসেজ শুনুন')}>
        <Icon name={on ? 'pause' : 'play'} size={18} />
      </button>
      <span className="vm-wave" aria-hidden>
        {BARS.map((h, i) => (
          <i key={i} style={{ height: `${h}%` }} className={(i / BARS.length) * 100 < pct ? 'on' : undefined} />
        ))}
      </span>
      <span className="vm-time">{failed ? t('Error', 'সমস্যা') : fmtSecs(on || pos ? pos : secs, lang)}</span>
    </span>
  );
}

const BARS = [30, 55, 40, 75, 50, 90, 60, 35, 70, 45, 85, 55, 30, 65, 40, 80, 50, 35, 60, 45, 30];
