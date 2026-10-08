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

/** Soft ambient loop for menus (Music toggle). */
let musicNodes: { stop: () => void } | null = null;
export function setMusic(on: boolean) {
  if (!on) {
    musicNodes?.stop();
    musicNodes = null;
    return;
  }
  if (musicNodes) return;
  try {
    const c = ac();
    const g = c.createGain();
    g.gain.value = 0.018;
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
    musicNodes = { stop: () => oscs.flat().forEach((o) => o.stop()) };
  } catch {
    /* ignore */
  }
}
