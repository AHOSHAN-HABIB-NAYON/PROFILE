/**
 * Branded, softly animated profile cover: night-blue sky, a Bangladesh-red sun, drifting
 * quiz marks and two rolling waves. Pure SVG + CSS transforms (compositor-only), and still
 * under reduced motion.
 */
export function ProfileCover() {
  const marks = [
    { x: 34, y: 70, s: 15, d: 0, c: '?' },
    { x: 92, y: 40, s: 11, d: 1.6, c: '+' },
    { x: 150, y: 78, s: 13, d: 3.1, c: '?' },
    { x: 262, y: 34, s: 10, d: 2.2, c: '+' },
    { x: 318, y: 80, s: 14, d: 0.8, c: '?' },
    { x: 372, y: 46, s: 11, d: 3.8, c: '+' },
  ];
  return (
    <svg className="pc-cover" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <defs>
        <linearGradient id="pcSky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d4ed8" />
          <stop offset=".55" stopColor="#1e1b4b" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
        <radialGradient id="pcSun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#f42a41" stopOpacity=".95" />
          <stop offset=".6" stopColor="#f42a41" stopOpacity=".55" />
          <stop offset="1" stopColor="#f42a41" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pcShine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id="pcDots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#fff" opacity=".12" />
        </pattern>
      </defs>
      <rect width="400" height="120" fill="url(#pcSky)" />
      <rect width="400" height="120" fill="url(#pcDots)" />

      {/* Red sun (flag) with a slow breathing glow */}
      <g className="pcc-sun">
        <circle cx="330" cy="52" r="46" fill="url(#pcSun)" />
        <circle cx="330" cy="52" r="20" fill="#f42a41" opacity=".9" />
      </g>

      {/* Crossed swords watermark — the QUIZ WAR mark */}
      <g className="pcc-swords" transform="translate(52 22)" stroke="#fde047" strokeWidth="3.2" strokeLinecap="round" fill="none" opacity=".55">
        <path d="M4 4 L34 34 M28 38 L38 28 M31 37 L37 43" />
        <path d="M40 4 L10 34 M16 38 L6 28 M13 37 L7 43" />
      </g>
      <text x="100" y="40" className="pcc-word">QUIZ WAR</text>
      <text x="101" y="56" className="pcc-sub">BANGLADESH</text>

      {/* Drifting quiz marks */}
      {marks.map((m, i) => (
        <text key={i} x={m.x} y={m.y} className="pcc-mark" style={{ fontSize: m.s, animationDelay: `${m.d}s` }}>
          {m.c}
        </text>
      ))}

      {/* Rolling waves (green fields + river), drawn twice as wide and slid sideways */}
      <g className="pcc-wave w1">
        <path d="M0 96 Q50 82 100 96 T200 96 T300 96 T400 96 T500 96 T600 96 T700 96 T800 96 V120 H0Z" fill="#006a4e" opacity=".55" />
      </g>
      <g className="pcc-wave w2">
        <path d="M0 104 Q50 94 100 104 T200 104 T300 104 T400 104 T500 104 T600 104 T700 104 T800 104 V120 H0Z" fill="#22d3ee" opacity=".25" />
      </g>

      {/* Light sweep */}
      <rect className="pcc-shine" x="-160" y="0" width="140" height="120" fill="url(#pcShine)" transform="skewX(-20)" />
    </svg>
  );
}
