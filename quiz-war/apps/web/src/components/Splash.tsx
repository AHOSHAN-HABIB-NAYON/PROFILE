import { useEffect, useState } from 'react';

/** The brand mark, drawn with SVG so it can animate (ring draws, swords cross, core pops). */
export function BrandMark({ size = 112, animate = true }: { size?: number; animate?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={`brand-mark ${animate ? 'animate' : ''}`} aria-hidden>
      <defs>
        <linearGradient id="bm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
        <radialGradient id="bm-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#60a5fa" stopOpacity=".55" />
          <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect className="bm-tile" width="512" height="512" rx="116" fill="url(#bm-bg)" />
      <circle cx="256" cy="256" r="190" fill="url(#bm-glow)" />
      <circle className="bm-ring" cx="256" cy="256" r="150" fill="none" stroke="#22d3ee" strokeWidth="18" strokeLinecap="round" />
      <g className="bm-sword-a">
        <path d="M168 344 L328 184 M184 168 l-24 24 M344 328 l-24 24" stroke="#fff" strokeWidth="30" strokeLinecap="round" fill="none" />
      </g>
      <g className="bm-sword-b">
        <path d="M344 344 L184 184 M328 168 l24 24 M168 328 l24 24" stroke="#fde047" strokeWidth="30" strokeLinecap="round" fill="none" />
      </g>
      <circle className="bm-core" cx="256" cy="256" r="34" fill="#f42a41" stroke="#fff" strokeWidth="10" />
    </svg>
  );
}

/**
 * Launch screen, WhatsApp style: the app icon in the middle and the name at the bottom, on the
 * same colour as the native Android splash (so there is no flash). It leaves as soon as the app
 * is ready — usually at once, because the saved profile opens without waiting for the network.
 */
export function Splash({ onDone, ready = true }: { onDone?: () => void; ready?: boolean }) {
  const [leaving, setLeaving] = useState(false);
  const [mountedAt] = useState(() => performance.now());
  useEffect(() => {
    // Never longer than 2 s, even on a slow first start.
    const cap = setTimeout(() => setLeaving(true), Math.max(0, 2000 - (performance.now() - mountedAt)));
    if (!ready) return () => clearTimeout(cap);
    const t1 = setTimeout(() => setLeaving(true), Math.max(0, 250 - (performance.now() - mountedAt)));
    return () => {
      clearTimeout(cap);
      clearTimeout(t1);
    };
  }, [ready, mountedAt]);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => onDone?.(), 180);
    return () => clearTimeout(t);
  }, [leaving, onDone]);
  return (
    <div className={`splash wa${leaving ? ' leaving' : ''}`} role="status" aria-label="QUIZ WAR Bangladesh">
      <div className="splash-center">
        <BrandMark size={96} animate={false} />
      </div>
      <div className="splash-from">
        <b>QUIZ WAR</b>
        <small>BANGLADESH</small>
      </div>
    </div>
  );
}
