import { useSettings } from './settings';

/**
 * Ludo sounds, made on the phone (no files to download): dice rattle, token hop, capture,
 * reaching home, six, win. Everything goes through a compressor so it is loud but never
 * cracks or distorts.
 */

let ctx: AudioContext | null = null;
let out: GainNode | null = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as any).webkitAudioContext;
    ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

const on = () => useSettings.getState().sound !== false;

/** Soft tone with a smooth attack and decay (no clicks). */
function tone(freq: number, at: number, len: number, vol: number, type: OscillatorType = 'sine', glideTo?: number) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + len);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g);
  g.connect(out!);
  o.start(at);
  o.stop(at + len + 0.02);
}

/** Short filtered noise (wood / dice clicks). */
function click(at: number, vol: number, freq = 2400, len = 0.05) {
  const c = ac();
  const n = Math.floor(c.sampleRate * len);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.4;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(out!);
  src.start(at);
}

export type LudoSfx = 'roll' | 'step' | 'out' | 'capture' | 'home' | 'six' | 'win' | 'turn' | 'safe';

export function ludoSfx(name: LudoSfx, n = 0) {
  if (!on()) return;
  try {
    const t = ac().currentTime + 0.01;
    switch (name) {
      case 'roll':
        // Dice rattling in the hand, then landing.
        for (let i = 0; i < 7; i++) click(t + i * 0.055 + Math.random() * 0.02, 0.55, 1800 + Math.random() * 1600, 0.04);
        click(t + 0.45, 0.9, 900, 0.08);
        tone(220, t + 0.45, 0.12, 0.25, 'triangle');
        break;
      case 'step':
        // Light wooden hop, slightly higher each step.
        click(t, 0.5, 1500 + n * 60, 0.035);
        tone(520 + n * 28, t, 0.09, 0.22, 'triangle');
        break;
      case 'out':
        tone(392, t, 0.14, 0.3, 'triangle');
        tone(587, t + 0.08, 0.2, 0.3, 'triangle');
        break;
      case 'safe':
        tone(880, t, 0.25, 0.18);
        tone(1320, t + 0.05, 0.3, 0.12);
        break;
      case 'capture':
        // Whoosh down + a thud.
        tone(900, t, 0.35, 0.32, 'sawtooth', 160);
        click(t + 0.3, 1, 300, 0.12);
        tone(110, t + 0.3, 0.25, 0.45, 'sine', 60);
        break;
      case 'home':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.45, 0.28, 'triangle'));
        break;
      case 'six':
        [1047, 1319, 1568].forEach((f, i) => tone(f, t + i * 0.06, 0.3, 0.18));
        break;
      case 'turn':
        tone(660, t, 0.12, 0.16, 'sine');
        break;
      case 'win': {
        const notes = [523, 659, 784, 1047, 784, 1047, 1319];
        notes.forEach((f, i) => tone(f, t + i * 0.13, 0.5, 0.3, 'triangle'));
        [523, 659, 784].forEach((f) => tone(f, t + notes.length * 0.13, 1.2, 0.22, 'sine'));
        break;
      }
    }
  } catch {
    /* no audio */
  }
}
