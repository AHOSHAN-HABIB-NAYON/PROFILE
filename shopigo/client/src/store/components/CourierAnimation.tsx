import { useEffect, useState } from 'react';

/**
 * Full-screen "your parcel is on its way" moment: a 3D-shaded courier van
 * drives in from the right, crosses the screen and exits left, then the
 * whole layer unmounts. It is never rendered as a static image.
 */
export function CourierAnimation({ onDone, label }: { onDone: () => void; label?: string }) {
  const [phase, setPhase] = useState<'drive' | 'fade'>('drive');
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t1 = setTimeout(() => setPhase('fade'), reduce ? 200 : 2300);
    const t2 = setTimeout(onDone, reduce ? 350 : 2750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div className={`fixed inset-0 z-[110] overflow-hidden bg-gradient-to-b from-[#fff7f1] via-[#ffeede] to-[#ffd9c2] transition-opacity duration-500 ${phase === 'fade' ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true">
      <style>{`
        @keyframes sg-drive { 0% { transform: translateX(110vw) } 18% { transform: translateX(62vw) } 62% { transform: translateX(22vw) } 100% { transform: translateX(-120vw) } }
        @keyframes sg-bounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
        @keyframes sg-wheel { to { transform: rotate(-360deg) } }
        @keyframes sg-road { to { background-position-x: -120px } }
        @keyframes sg-puff { 0% { opacity:.7; transform: translate(0,0) scale(.6) } 100% { opacity:0; transform: translate(60px,-18px) scale(1.6) } }
        @keyframes sg-speed { 0% { opacity:0; transform: translateX(0) } 30% { opacity:.9 } 100% { opacity:0; transform: translateX(80px) } }
        @keyframes sg-sun { from { transform: scale(.9); opacity:.6 } to { transform: scale(1.05); opacity:1 } }
      `}</style>
      <div className="absolute top-[14%] left-1/2 size-[46vmin] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#ffd1b3] to-[#ffb58a] opacity-70 blur-[2px]" style={{ animation: 'sg-sun 2.3s ease-out both' }} />
      <div className="absolute inset-x-0 top-[57%] h-[4px] bg-[#f3c9ae]" />
      <div className="absolute inset-x-0 top-[58%] bottom-0 bg-gradient-to-b from-[#e7b595] to-[#d99d78]" />
      <div className="absolute inset-x-0 top-[70%] h-[6px]" style={{ backgroundImage: 'linear-gradient(90deg, #fff7 0 60px, transparent 60px 120px)', backgroundSize: '120px 6px', animation: 'sg-road .35s linear infinite' }} />
      {label && <p className="absolute inset-x-0 top-[24%] text-center text-[15px] font-bold tracking-wide text-[#9a5a36]">{label}</p>}

      <div className="absolute top-[57%] left-0 -translate-y-[88%]" style={{ animation: 'sg-drive 2.3s cubic-bezier(.55,.05,.35,1) both' }}>
        {/* speed lines */}
        <div className="absolute top-[30%] -right-4 space-y-3">
          {[0, 1, 2].map((i) => <span key={i} className="block h-[5px] rounded-full bg-white/80" style={{ width: 70 - i * 14, animation: `sg-speed .5s ${i * 0.12}s linear infinite` }} />)}
        </div>
        {/* dust */}
        {[0, 1, 2].map((i) => <span key={i} className="absolute bottom-1 right-2 size-7 rounded-full bg-[#f6dcc8]" style={{ animation: `sg-puff .7s ${i * 0.22}s ease-out infinite` }} />)}
        <div style={{ animation: 'sg-bounce .28s ease-in-out infinite' }}>
          <svg width="min(340px, 78vw)" viewBox="0 0 340 170" className="drop-shadow-[0_18px_18px_rgba(120,60,20,.28)]">
            <defs>
              <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset=".55" stopColor="#f7efe8" /><stop offset="1" stopColor="#e6d6c9" /></linearGradient>
              <linearGradient id="cab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff9a62" /><stop offset="1" stopColor="#e5552a" /></linearGradient>
              <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#cfe8ff" /><stop offset=".5" stopColor="#8fb9e6" /><stop offset="1" stopColor="#5f8fc4" /></linearGradient>
              <radialGradient id="tyre" cx=".5" cy=".5" r=".5"><stop offset=".55" stopColor="#3a3a3f" /><stop offset="1" stopColor="#141417" /></radialGradient>
              <linearGradient id="stripe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f26b3a" /><stop offset="1" stopColor="#ff9a62" /></linearGradient>
            </defs>
            <ellipse cx="170" cy="160" rx="150" ry="8" fill="#8b4a25" opacity=".18" />
            {/* cargo box (van faces LEFT, so cab is on the left) */}
            <rect x="96" y="18" width="226" height="112" rx="16" fill="url(#body)" />
            <rect x="96" y="18" width="226" height="16" rx="12" fill="#fff" opacity=".7" />
            <rect x="96" y="86" width="226" height="14" fill="url(#stripe)" />
            <g transform="translate(190 42)">
              <rect width="46" height="38" rx="6" fill="#f2c79a" />
              <rect x="19" width="8" height="38" fill="#e2a86f" />
              <rect y="12" width="46" height="4" fill="#e2a86f" opacity=".7" />
            </g>
            <text x="252" y="70" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="800" fontSize="15" fill="#e5552a">COD</text>
            {/* cab */}
            <path d="M22 130 V86 C22 70 30 58 44 50 L70 36 C78 32 86 30 96 30 H104 V130 Z" fill="url(#cab)" />
            <path d="M40 80 L60 52 C64 47 70 44 78 44 H96 V80 Z" fill="url(#glass)" />
            <path d="M48 74 L62 55 H72 L58 74 Z" fill="#fff" opacity=".45" />
            <rect x="22" y="104" width="82" height="10" fill="#c7461f" opacity=".45" />
            <rect x="14" y="112" width="18" height="10" rx="4" fill="#ffe7a8" />
            <rect x="12" y="122" width="36" height="10" rx="5" fill="#57575e" />
            <rect x="300" y="122" width="26" height="10" rx="5" fill="#57575e" />
            {/* wheels */}
            {[70, 266].map((cx) => (
              <g key={cx} transform={`translate(${cx} 132)`}>
                <circle r="24" fill="url(#tyre)" />
                <g style={{ animation: 'sg-wheel .35s linear infinite', transformOrigin: '0 0' }}>
                  <circle r="11" fill="#d9d9de" />
                  {[0, 60, 120].map((a) => <rect key={a} x="-2" y="-11" width="4" height="22" rx="2" fill="#9a9aa3" transform={`rotate(${a})`} />)}
                  <circle r="4" fill="#6b6b73" />
                </g>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
