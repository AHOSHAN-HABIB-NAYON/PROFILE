/** Token: the standard glossy pin, or a design from the shop (ball, star, gem, crown). */
export function Pin({ style }: { style?: string | null }) {
  if (style === 'ball')
    return (
      <svg viewBox="0 0 40 52" className="pin" aria-hidden>
        <ellipse cx="20" cy="47" rx="13" ry="4" fill="rgba(0,0,0,.3)" />
        <circle cx="20" cy="29" r="16" fill="var(--tc)" stroke="rgba(0,0,0,.35)" strokeWidth="1.6" />
        <circle cx="20" cy="29" r="10" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2.4" />
        <circle cx="20" cy="29" r="4" fill="#fff" />
        <ellipse cx="13.5" cy="20.5" rx="5.5" ry="3.5" fill="rgba(255,255,255,.7)" transform="rotate(-30 13.5 20.5)" />
      </svg>
    );
  if (style === 'star')
    return (
      <svg viewBox="0 0 40 52" className="pin" aria-hidden>
        <ellipse cx="20" cy="47" rx="12" ry="4" fill="rgba(0,0,0,.3)" />
        <polygon points="20,8 25,21 39,21 28,30 32,44 20,36 8,44 12,30 1,21 15,21" fill="var(--tc)" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        <polygon points="20,17 22.5,23.5 29,23.5 24,27.5 26,34 20,30 14,34 16,27.5 11,23.5 17.5,23.5" fill="rgba(255,255,255,.55)" />
        <circle cx="15" cy="17" r="2.2" fill="#fff" opacity=".85" />
      </svg>
    );
  if (style === 'gem')
    return (
      <svg viewBox="0 0 40 52" className="pin" aria-hidden>
        <ellipse cx="20" cy="47" rx="11" ry="3.5" fill="rgba(0,0,0,.3)" />
        <polygon points="6,20 13,10 27,10 34,20 20,44" fill="var(--tc)" stroke="rgba(0,0,0,.35)" strokeWidth="1.4" strokeLinejoin="round" />
        <polygon points="13,10 20,20 27,10" fill="rgba(255,255,255,.45)" />
        <polygon points="6,20 13,10 20,20" fill="rgba(255,255,255,.25)" />
        <polygon points="6,20 20,20 20,44" fill="rgba(0,0,0,.15)" />
        <polygon points="20,20 34,20 20,44" fill="rgba(255,255,255,.12)" />
        <path d="M6 20h28" stroke="rgba(255,255,255,.7)" strokeWidth="1" />
        <path d="M11 6l1.2 2.6L15 9.8l-2.8 1.2L11 13.6 9.8 11 7 9.8l2.8-1.2z" fill="#fff" />
      </svg>
    );
  return (
    <svg viewBox="0 0 40 52" className="pin" aria-hidden>
      <ellipse cx="20" cy="47" rx="12" ry="4" fill="rgba(0,0,0,.28)" />
      <path d="M8 40 Q20 30 32 40 L30 45 Q20 49 10 45 Z" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.2" />
      <path d="M14 38 L20 22 L26 38 Z" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
      <circle cx="20" cy="17" r="13" fill="var(--tc)" stroke="rgba(0,0,0,.35)" strokeWidth="1.6" />
      <circle cx="15.5" cy="12.5" r="4.5" fill="rgba(255,255,255,.65)" />
      <circle cx="20" cy="17" r="6" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.6" />
      {style === 'crown' && <path d="M11 9 L13 1.5 L17 6 L20 0.5 L23 6 L27 1.5 L29 9 Z" fill="#facc15" stroke="#a16207" strokeWidth="1.1" strokeLinejoin="round" />}
    </svg>
  );
}
