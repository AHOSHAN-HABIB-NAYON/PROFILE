import { useEffect, useState } from 'react';

/**
 * Profile cover: a Bangladesh landscape (paddy fields, palm trees, a river) that follows the
 * time of day — morning, day and night. Pure SVG + CSS transforms, light on the phone.
 */
type Scene = 'morning' | 'day' | 'night';

const sceneFor = (h: number): Scene => (h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 18 ? 'day' : 'night');

const PAL: Record<Scene, { sky: [string, string, string]; sun: string; glow: string; far: string; mid: string; near: string; field: string; water: [string, string]; bird: string; cloud: string; mist: number }> = {
  morning: { sky: ['#3b82f6', '#93c5fd', '#fed7aa'], sun: '#fff7ed', glow: '#fdba74', far: '#7c9cc4', mid: '#3f7d5c', near: '#1f5a3a', field: '#4d8f3f', water: ['#bfdbfe', '#fbcfa0'], bird: '#1e293b', cloud: '#fff7ed', mist: 0.55 },
  day: { sky: ['#1d4ed8', '#3b82f6', '#bae6fd'], sun: '#ffffff', glow: '#fef9c3', far: '#6b93c9', mid: '#2f7a4b', near: '#185c34', field: '#5aa33f', water: ['#60a5fa', '#bae6fd'], bird: '#0f172a', cloud: '#ffffff', mist: 0.25 },
  night: { sky: ['#030712', '#0b1640', '#1e3a8a'], sun: '#fefce8', glow: '#e0e7ff', far: '#16224a', mid: '#0d2224', near: '#061612', field: '#0b2418', water: ['#1d3a8a', '#0b1640'], bird: '#000', cloud: '#64748b', mist: 0.06 },
};

/** Scattered stars (fixed pseudo-random spread, same on every render). */
const STARS = Array.from({ length: 40 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return { x: (a - Math.floor(a)) * 400, y: 4 + (b - Math.floor(b)) * 50, r: i % 6 === 0 ? 1.3 : i % 3 === 0 ? 0.9 : 0.55, d: ((i * 7) % 11) * 0.37 };
});

function Palm({ x, y, s, c }: { x: number; y: number; s: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={c}>
      <path d="M-.8 0 C-.4 -10 .4 -18 1.6 -26 L2.6 -26 C1.6 -18 1 -10 1 0 Z" />
      <g className="pcv-palm">
        <path d="M2 -26 C-4 -30 -10 -29 -14 -24 C-9 -27 -4 -27 2 -25 Z" />
        <path d="M2 -26 C8 -31 14 -30 18 -25 C13 -28 8 -27 2 -25 Z" />
        <path d="M2 -26 C-2 -33 -7 -35 -11 -34 C-6 -32 -2 -30 2 -25 Z" />
        <path d="M2 -26 C6 -34 11 -36 15 -34 C10 -32 6 -30 2 -25 Z" />
        <path d="M2 -26 C1 -31 2 -35 4 -37 C3 -33 3 -30 2 -25 Z" />
      </g>
    </g>
  );
}

function Tree({ x, y, s, c }: { x: number; y: number; s: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={c}>
      <rect x="-.8" y="-6" width="1.6" height="6" />
      <ellipse cx="0" cy="-10" rx="7" ry="6" />
      <ellipse cx="-4" cy="-8" rx="4.5" ry="4" />
      <ellipse cx="4" cy="-8" rx="4.5" ry="4" />
    </g>
  );
}

function Bird({ s, d }: { s: number; d: number }) {
  return (
    <g transform={`scale(${s})`}>
      <g className="pcb-bob" style={{ animationDelay: `${-d * 3}s` }}>
        <path className="pcb-wing" style={{ animationDelay: `${-d}s` }} d="M-16 -1 C-11 -6 -5 -6 0 0 C5 -6 11 -6 16 -1 C11 -3 5 -2 0 2.2 C-5 -2 -11 -3 -16 -1 Z" />
      </g>
    </g>
  );
}

const FLOCK = [
  { x: 0, y: 0, s: 0.9, d: 0 },
  { x: -22, y: 8, s: 0.75, d: 0.35 },
  { x: -20, y: -9, s: 0.7, d: 0.7 },
  { x: -44, y: 15, s: 0.6, d: 0.2 },
  { x: -42, y: -16, s: 0.55, d: 0.55 },
];

export function ProfileCover({ scene: forced }: { scene?: Scene }) {
  const [scene, setScene] = useState<Scene>(forced ?? sceneFor(new Date().getHours()));
  useEffect(() => {
    if (forced) return;
    const id = setInterval(() => setScene(sceneFor(new Date().getHours())), 5 * 60_000);
    return () => clearInterval(id);
  }, [forced]);
  const p = PAL[scene];
  const night = scene === 'night';
  // Centre of the sky: clear of the share/settings buttons (top right) and the photo (bottom left).
  const sunX = scene === 'morning' ? 236 : scene === 'day' ? 226 : 214;
  const sunY = scene === 'morning' ? 84 : scene === 'day' ? 34 : 38;
  const id = `pc-${scene}`;
  return (
    <svg className={`pc-cover pcv-${scene}`} viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset=".55" stopColor={p.sky[1]} />
          <stop offset="1" stopColor={p.sky[2]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor={p.glow} stopOpacity=".95" />
          <stop offset=".4" stopColor={p.glow} stopOpacity=".35" />
          <stop offset="1" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.water[1]} />
          <stop offset="1" stopColor={p.water[0]} />
        </linearGradient>
        <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".6" stopColor="#fff" stopOpacity={p.mist} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-moon`}>
          <rect width="400" height="140" fill="#fff" />
          <circle cx={sunX + 6} cy={sunY - 4} r="10" fill="#000" />
        </mask>
        <filter id={`${id}-soft`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      <rect width="400" height="140" fill={`url(#${id}-sky)`} />

      {night && (
        <>
          <g fill="#fff">
            {STARS.map((s, i) =>
              s.r > 1.2 ? (
                <g key={i} className="pcv-star big" style={{ animationDelay: `${s.d}s` }} transform={`translate(${s.x} ${s.y})`}>
                  <circle r="1.1" />
                  <path d="M0 -3.4 L.35 0 L0 3.4 L-.35 0 Z M-3.4 0 L0 .35 L3.4 0 L0 -.35 Z" opacity=".75" />
                </g>
              ) : (
                <circle key={i} className="pcv-star" style={{ animationDelay: `${s.d}s` }} cx={s.x} cy={s.y} r={s.r} />
              ),
            )}
          </g>
          {/* A shooting star now and then */}
          <path className="pcv-meteor" d="M300 10 l26 -9" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}

      {/* Sun / moon with a soft glow */}
      <g className="pcb-sun">
        <circle cx={sunX} cy={sunY} r={night ? 40 : 58} fill={`url(#${id}-glow)`} />
        <circle cx={sunX} cy={sunY} r={night ? 12 : 13} fill={p.sun} />
        {night && (
          <g fill="#94a3b8" opacity=".35">
            <circle cx={sunX - 4} cy={sunY - 3} r="2.6" />
            <circle cx={sunX + 4} cy={sunY + 2} r="1.8" />
            <circle cx={sunX - 1} cy={sunY + 6} r="1.3" />
            <circle cx={sunX + 5} cy={sunY - 6} r="1" />
          </g>
        )}
      </g>

      {/* Soft clouds */}
      {!night && (
      <>
      <g className="pcb-cloud c1" fill={p.cloud} opacity={0.85} filter={`url(#${id}-soft)`}>
        <ellipse cx="70" cy="36" rx="30" ry="8" />
        <ellipse cx="88" cy="31" rx="18" ry="9" />
        <ellipse cx="54" cy="33" rx="14" ry="7" />
      </g>
      <g className="pcb-cloud c2" fill={p.cloud} opacity={0.6} filter={`url(#${id}-soft)`}>
        <ellipse cx="320" cy="24" rx="36" ry="6" />
        <ellipse cx="340" cy="20" rx="18" ry="7" />
      </g>
      </>
      )}

      {/* Far hills and tree line (lighter = further away) */}
      <path d="M0 98 C40 88 80 92 120 95 C170 99 210 86 260 90 C310 94 350 86 400 92 V112 H0 Z" fill={p.far} opacity=".75" />
      <g>
        {[18, 34, 52, 96, 128, 150, 186, 238, 262, 288, 340, 372].map((x, i) => (
          <Tree key={i} x={x} y={104 - (i % 3)} s={0.55 + (i % 3) * 0.08} c={p.mid} />
        ))}
      </g>
      <rect y="86" width="400" height="26" fill={`url(#${id}-mist)`} />

      {/* Paddy fields with rows */}
      <path d="M0 104 C80 100 160 106 240 104 C300 102 350 100 400 103 V140 H0 Z" fill={p.field} />
      <g stroke={p.near} strokeOpacity=".35" strokeWidth=".8" fill="none">
        <path d="M0 112 C100 108 200 114 400 110" />
        <path d="M0 118 C110 114 220 120 400 116" />
      </g>

      {/* River with the sky reflected and a gentle shimmer */}
      <path d="M150 140 C170 128 200 121 245 118 C290 116 330 119 400 117 V140 Z" fill={`url(#${id}-water)`} />
      <g className="pcb-river" stroke="#fff" strokeOpacity={night ? 0.25 : 0.55} strokeWidth="1" strokeLinecap="round">
        <path d={`M${sunX - 14} 124 h20`} />
        <path d={`M${sunX - 6} 129 h14`} />
        <path d={`M${sunX - 20} 134 h26`} />
      </g>

      {/* Palms in front */}
      <Palm x={28} y={122} s={0.95} c={p.near} />
      <Palm x={44} y={124} s={0.75} c={p.near} />
      <Palm x={370} y={120} s={0.9} c={p.near} />

      {/* Kites gliding across (day and morning) */}
      {!night && (
        <>
          <g className="pcb-flock">
            <g transform="translate(0 52)" fill={p.bird} opacity=".8">
              {FLOCK.map((b, i) => (
                <g key={i} transform={`translate(${b.x} ${b.y})`}>
                  <Bird s={b.s} d={b.d} />
                </g>
              ))}
            </g>
          </g>
          <g className="pcb-flock f2">
            <g transform="translate(0 30) scale(.5)" fill={p.bird} opacity=".45">
              {FLOCK.slice(0, 3).map((b, i) => (
                <g key={i} transform={`translate(${b.x} ${b.y})`}>
                  <Bird s={b.s} d={b.d + 0.2} />
                </g>
              ))}
            </g>
          </g>
        </>
      )}
      {night && (
        <g fill="#fde68a">
          {[60, 110, 170, 230, 320].map((x, i) => (
            <circle key={i} className="pcv-fly" style={{ animationDelay: `${i * 0.9}s` }} cx={x} cy={110 + (i % 2) * 6} r="1.1" />
          ))}
        </g>
      )}
    </svg>
  );
}
