/**
 * Branded, softly animated profile cover: night-blue sky, a Bangladesh-red sun, drifting
 * winner's cups and stars, and two rolling waves. Pure SVG + CSS transforms (compositor-only), and still
 * under reduced motion.
 */
export function ProfileCover() {
  const marks = [
    { x: 30, y: 58, s: 16, d: 0, c: 'cup' },
    { x: 92, y: 32, s: 9, d: 1.6, c: 'star' },
    { x: 148, y: 66, s: 14, d: 3.1, c: 'cup' },
    { x: 262, y: 26, s: 8, d: 2.2, c: 'star' },
    { x: 312, y: 70, s: 15, d: 0.8, c: 'cup' },
    { x: 370, y: 36, s: 9, d: 3.8, c: 'star' },
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

      {/* Drifting winner's cups and stars */}
      {marks.map((m, i) => (
        <g key={i} transform={`translate(${m.x} ${m.y}) scale(${m.s / 16})`}>
        <g className="pcc-mark" style={{ animationDelay: `${m.d}s` }}>
          {m.c === 'cup' ? (
            <>
              <path d="M3 0h10v4a5 5 0 0 1-10 0z" fill="#facc15" />
              <path d="M3 1H0.5a2.6 2.6 0 0 0 2.9 3.4M13 1h2.5a2.6 2.6 0 0 1-2.9 3.4" fill="none" stroke="#facc15" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M7 9h2v3H7zM4.5 12h7v2h-7z" fill="#f59e0b" />
              <path d="M6 2.2l.6 1.2 1.3.2-1 .9.3 1.3L6 5.2l-1.2.6.3-1.3-1-.9 1.3-.2z" fill="#fff7cc" opacity=".9" />
            </>
          ) : (
            <path d="M8 0l2.2 5 5.3.5-4 3.6 1.2 5.3L8 11.6 3.3 14.4l1.2-5.3-4-3.6L5.8 5z" fill="#fde68a" />
          )}
        </g>
        </g>
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
