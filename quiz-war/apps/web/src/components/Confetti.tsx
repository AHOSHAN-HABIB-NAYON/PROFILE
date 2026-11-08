import { useEffect, useRef } from 'react';

/**
 * Win confetti: one short celebration, then it is gone. Two bursts from the bottom corners,
 * small paper pieces that flutter down and fade out (about 3 seconds). Plays once per mount
 * (a re-render never restarts it). Skipped with reduced motion.
 */
export function Confetti({ colors = ['#1d4ed8', '#7c3aed', '#22d3ee', '#16a34a', '#f59e0b', '#ef4444'], pieces = 110 }: { colors?: string[]; pieces?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const opts = useRef({ colors, pieces });
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion')) return;
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const W = innerWidth;
    const H = innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.scale(dpr, dpr);
    const { colors: cols, pieces: n } = opts.current;
    const parts = Array.from({ length: n }, (_, i) => {
      const left = i % 2 === 0;
      const angle = (left ? -68 : -112) + (Math.random() - 0.5) * 30; // aim up and inwards
      const speed = 16 + Math.random() * 9;
      const rad = (angle * Math.PI) / 180;
      return {
        x: left ? -6 : W + 6,
        y: H * 0.92,
        vx: Math.cos(rad) * speed,
        vy: Math.sin(rad) * speed,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.2,
        flip: Math.random() * Math.PI * 2,
        vflip: 0.08 + Math.random() * 0.12,
        sway: Math.random() * Math.PI * 2,
        w: 4 + Math.random() * 4,
        h: 7 + Math.random() * 5,
        round: Math.random() < 0.25,
        color: cols[Math.floor(Math.random() * cols.length)]!,
        delay: Math.random() * 180,
      };
    });
    const DURATION = 3600;
    const FADE = 700;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const el = t - start;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = el > DURATION - FADE ? Math.max(0, (DURATION - el) / FADE) : 1;
      for (const p of parts) {
        if (el < p.delay) continue;
        // Air drag and gravity, with a gentle side-to-side flutter once it falls.
        p.vx *= 0.982;
        p.vy = p.vy * 0.982 + 0.2;
        p.sway += 0.05;
        p.x += p.vx + (p.vy > 0 ? Math.sin(p.sway) * 0.6 : 0);
        p.y += p.vy;
        p.rot += p.vrot;
        p.flip += p.vflip;
        if (p.y > H + 20) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.flip)); // paper turning over
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (el < DURATION) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="confetti-canvas" aria-hidden />;
}
