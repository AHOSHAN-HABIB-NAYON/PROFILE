import { useSettings } from './settings';

/**
 * Tiny synthesized sound effects (WebAudio) — no audio files to download, works offline,
 * respects the Sound / Music toggles.
 */
type Sfx = 'tap' | 'correct' | 'wrong' | 'tick' | 'start' | 'victory' | 'defeat' | 'rankup' | 'reward' | 'notify';

let ctx: AudioContext | null = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.02);
}

const PATTERNS: Record<Sfx, () => void> = {
  tap: () => tone(660, 0, 0.05, 'triangle', 0.05),
  tick: () => tone(1000, 0, 0.04, 'square', 0.03),
  correct: () => (tone(660, 0, 0.1, 'triangle'), tone(990, 0.08, 0.16, 'triangle')),
  wrong: () => (tone(220, 0, 0.16, 'sawtooth', 0.06), tone(160, 0.12, 0.2, 'sawtooth', 0.05)),
  start: () => [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.14, 'triangle', 0.09)),
  victory: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.2, 'triangle', 0.1)),
  defeat: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.26, 'sine', 0.08)),
  rankup: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.09, 0.22, 'square', 0.05)),
  reward: () => [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.12, 'sine', 0.08)),
  notify: () => (tone(880, 0, 0.08), tone(1320, 0.09, 0.1)),
};

export function sfx(name: Sfx) {
  if (!useSettings.getState().sound) return;
  try {
    PATTERNS[name]();
  } catch {
    /* audio not available */
  }
}

/* ───────────────────────────── Music ─────────────────────────────
 * Admin-uploaded tracks (menu / match) streamed with <audio>, cross-faded; falls back to a
 * soft synthesized pad on menus when no track is uploaded. Autoplay-safe: if the browser
 * blocks playback, it starts on the next tap.
 */
type Slot = 'menu' | 'match';
let sources: { menu: string | null; match: string | null; volume: number } = { menu: null, match: null, volume: 0.5 };
let current: { slot: Slot; audio: HTMLAudioElement | null; synth: { stop: () => void } | null } | null = null;
let wanted: { on: boolean; slot: Slot } = { on: false, slot: 'menu' };

export function setMusicSources(s: { menuUrl: string | null; matchUrl: string | null; volume: number }) {
  const changed = s.menuUrl !== sources.menu || s.matchUrl !== sources.match;
  sources = { menu: s.menuUrl, match: s.matchUrl, volume: s.volume };
  if (current?.audio) current.audio.volume = sources.volume * 0.6;
  if (changed && wanted.on) {
    stopCurrent();
    setMusic(true, wanted.slot);
  }
}

function fade(a: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = a.volume;
  const start = performance.now();
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / ms);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * p));
    if (p < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function stopCurrent() {
  if (!current) return;
  const c = current;
  current = null;
  if (c.audio) fade(c.audio, 0, 500, () => c.audio!.pause());
  c.synth?.stop();
}

function synthPad() {
  const c = ac();
  const g = c.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.016, c.currentTime + 1.5);
  g.connect(c.destination);
  const oscs = [196, 247, 294].map((f) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 0.08 + Math.random() * 0.05;
    lg.gain.value = 3;
    lfo.connect(lg).connect(o.frequency);
    o.connect(g);
    o.start();
    lfo.start();
    return [o, lfo];
  });
  return {
    stop: () => {
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
      setTimeout(() => oscs.flat().forEach((o) => o.stop()), 600);
    },
  };
}

let unlockArmed = false;
function playWhenAllowed(a: HTMLAudioElement) {
  a.play().catch(() => {
    if (unlockArmed) return;
    unlockArmed = true;
    const go = () => {
      unlockArmed = false;
      removeEventListener('pointerdown', go);
      if (current?.audio === a && wanted.on) void a.play().catch(() => undefined);
    };
    addEventListener('pointerdown', go, { once: true });
  });
}

export function setMusic(on: boolean, slot: Slot = 'menu') {
  wanted = { on, slot };
  if (!on) return stopCurrent();
  if (current?.slot === slot) return;
  stopCurrent();
  const url = slot === 'menu' ? sources.menu : sources.match;
  try {
    if (url) {
      const a = new Audio(url);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      current = { slot, audio: a, synth: null };
      playWhenAllowed(a);
      fade(a, sources.volume * 0.6, 1200);
    } else if (slot === 'menu') {
      current = { slot, audio: null, synth: synthPad() };
    } else current = { slot, audio: null, synth: null };
  } catch {
    current = null;
  }
}

/** Pause everything while the app is in the background. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      current?.audio?.pause();
      if (ctx?.state === 'running') void ctx.suspend();
    } else if (wanted.on) {
      if (current?.audio) void current.audio.play().catch(() => undefined);
      if (ctx?.state === 'suspended') void ctx.resume();
    }
  });
}
