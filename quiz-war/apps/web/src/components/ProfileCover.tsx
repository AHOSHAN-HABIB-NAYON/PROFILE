/**
 * Profile cover: an evening sky over Bangladesh fields and a river, with a flock of kites (চিল)
 * gliding across. Pure SVG + CSS transforms (cheap for the phone), still under reduced motion.
 */
const FLOCK = [
  { x: 0, y: 0, s: 1, d: 0 },
  { x: -26, y: 10, s: 0.8, d: 0.35 },
  { x: -22, y: -12, s: 0.85, d: 0.7 },
  { x: -50, y: 20, s: 0.65, d: 0.2 },
  { x: -48, y: -22, s: 0.7, d: 0.55 },
  { x: -74, y: 4, s: 0.6, d: 0.9 },
  { x: -80, y: 28, s: 0.5, d: 0.45 },
];

function Kite({ s, d }: { s: number; d: number }) {
  // A gliding kite: two long wings that flap slowly, with a small body.
  return (
    <g transform={`scale(${s})`}>
      <g className="pcb-bob" style={{ animationDelay: `${-d * 3}s` }}>
        <path className="pcb-wing" style={{ animationDelay: `${-d}s` }} d="M0 0 C-6 -6 -13 -7 -20 -3 C-13 -4 -7 -2 0 2 C7 -2 13 -4 20 -3 C13 -7 6 -6 0 0 Z" />
        <path d="M-1.4 0 L1.4 0 L0.8 5 L0 7 L-0.8 5 Z" />
      </g>
    </g>
  );
}

export function ProfileCover() {
  return (
    <svg className="pc-cover" viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <defs>
        <linearGradient id="pcSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset=".45" stopColor="#4f46e5" />
          <stop offset=".78" stopColor="#f472b6" />
          <stop offset="1" stopColor="#fdba74" />
        </linearGradient>
        <radialGradient id="pcSun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff7ed" />
          <stop offset=".35" stopColor="#fdba74" stopOpacity=".9" />
          <stop offset="1" stopColor="#fb923c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pcRiver" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fde68a" stopOpacity=".15" />
          <stop offset=".5" stopColor="#fde68a" stopOpacity=".55" />
          <stop offset="1" stopColor="#fde68a" stopOpacity=".15" />
        </linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#pcSky)" />

      {/* Setting sun with a slow glow */}
      <g className="pcb-sun">
        <circle cx="300" cy="104" r="46" fill="url(#pcSun)" />
        <circle cx="300" cy="104" r="15" fill="#fff7ed" opacity=".95" />
      </g>

      {/* Soft clouds drifting */}
      <g className="pcb-cloud c1" fill="#fff" opacity=".22">
        <ellipse cx="70" cy="34" rx="34" ry="7" />
        <ellipse cx="92" cy="30" rx="20" ry="6" />
      </g>
      <g className="pcb-cloud c2" fill="#fff" opacity=".16">
        <ellipse cx="250" cy="22" rx="42" ry="6" />
        <ellipse cx="226" cy="26" rx="22" ry="5" />
      </g>

      {/* Fields, a palm line and the river */}
      <path d="M0 112 C60 100 110 104 170 110 C230 116 300 100 400 106 V140 H0 Z" fill="#14532d" opacity=".9" />
      <path d="M0 120 C70 112 140 118 210 122 C280 126 340 114 400 118 V140 H0 Z" fill="#052e16" />
      <g fill="#052e16">
        <path d="M44 108 l1 -14 l1 14 Z M38 95 q7 -3 14 0 q-7 -1 -14 0 Z" />
        <path d="M352 106 l1 -16 l1 16 Z M345 91 q8 -3 16 0 q-8 -1 -16 0 Z" />
        <path d="M368 108 l1 -11 l1 11 Z M363 98 q6 -2 12 0 q-6 -1 -12 0 Z" />
      </g>
      <path className="pcb-river" d="M0 130 C80 124 160 134 240 128 C300 124 350 130 400 127" stroke="url(#pcRiver)" strokeWidth="3" fill="none" />

      {/* The flock of kites gliding across the sky */}
      <g className="pcb-flock">
        <g transform="translate(0 54)" fill="#0b1336" opacity=".85">
          {FLOCK.map((b, i) => (
            <g key={i} transform={`translate(${b.x} ${b.y})`}>
              <Kite s={b.s} d={b.d} />
            </g>
          ))}
        </g>
      </g>
      <g className="pcb-flock f2">
        <g transform="translate(0 30) scale(.55)" fill="#0b1336" opacity=".55">
          {FLOCK.slice(0, 4).map((b, i) => (
            <g key={i} transform={`translate(${b.x} ${b.y})`}>
              <Kite s={b.s} d={b.d + 0.2} />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
