import { useT } from '../lib/i18n';

/** Verified badge (blue rosette + check) shown next to top players' names. */
export function VerifiedBadge({ size = 16, className = '' }: { size?: number; className?: string }) {
  const t = useT();
  const label = t('Verified top player', 'ভেরিফায়েড সেরা প্লেয়ার');
  return (
    <svg className={`verified-badge ${className}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label}>
      <title>{label}</title>
      <defs>
        <linearGradient id="qw-vb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path
        fill="url(#qw-vb)"
        d="M12 1.6l2.3 1.7 2.8-.3 1.1 2.6 2.6 1.1-.3 2.8 1.7 2.3-1.7 2.3.3 2.8-2.6 1.1-1.1 2.6-2.8-.3L12 22.4l-2.3-1.7-2.8.3-1.1-2.6-2.6-1.1.3-2.8L1.8 12l1.7-2.3-.3-2.8 2.6-1.1 1.1-2.6 2.8.3z"
      />
      <path d="M7.6 12.3l3 3 5.8-6.2" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Premium badge (gold wavy seal + white check, like a gold "verified"): given only by the admin. */
export function PremiumBadge({ size = 16, className = '' }: { size?: number; className?: string }) {
  const t = useT();
  const label = t('Premium member', 'প্রিমিয়াম মেম্বার');
  return (
    <svg className={`premium-badge ${className}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label}>
      <title>{label}</title>
      <defs>
        <linearGradient id="qw-pb" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#fde047" />
          <stop offset=".5" stopColor="#f5b100" />
          <stop offset="1" stopColor="#d48806" />
        </linearGradient>
        <linearGradient id="qw-pb-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill="url(#qw-pb)" stroke="#c27c03" strokeWidth=".5" d="M12.00 0.82 L12.72 0.95 L13.41 1.30 L14.03 1.80 L14.59 2.33 L15.13 2.79 L15.68 3.11 L16.30 3.28 L17.00 3.33 L17.78 3.35 L18.57 3.44 L19.30 3.67 L19.91 4.09 L20.33 4.70 L20.56 5.43 L20.65 6.22 L20.67 6.99 L20.72 7.70 L20.89 8.32 L21.21 8.87 L21.67 9.41 L22.20 9.97 L22.70 10.59 L23.05 11.28 L23.18 12.00 L23.05 12.72 L22.70 13.41 L22.20 14.03 L21.67 14.59 L21.21 15.13 L20.89 15.68 L20.72 16.30 L20.67 17.00 L20.65 17.78 L20.56 18.57 L20.33 19.30 L19.91 19.91 L19.30 20.33 L18.57 20.56 L17.78 20.65 L17.00 20.67 L16.30 20.72 L15.68 20.89 L15.13 21.21 L14.59 21.67 L14.03 22.20 L13.41 22.70 L12.72 23.05 L12.00 23.18 L11.28 23.05 L10.59 22.70 L9.97 22.20 L9.41 21.67 L8.87 21.21 L8.32 20.89 L7.70 20.72 L7.00 20.67 L6.22 20.65 L5.43 20.56 L4.70 20.33 L4.09 19.91 L3.67 19.30 L3.44 18.57 L3.35 17.78 L3.33 17.01 L3.28 16.30 L3.11 15.68 L2.79 15.13 L2.33 14.59 L1.80 14.03 L1.30 13.41 L0.95 12.72 L0.82 12.00 L0.95 11.28 L1.30 10.59 L1.80 9.97 L2.33 9.41 L2.79 8.87 L3.11 8.32 L3.28 7.70 L3.33 6.99 L3.35 6.22 L3.44 5.43 L3.67 4.70 L4.09 4.09 L4.70 3.67 L5.43 3.44 L6.22 3.35 L6.99 3.33 L7.70 3.28 L8.32 3.11 L8.87 2.79 L9.41 2.33 L9.97 1.80 L10.59 1.30 L11.28 0.95Z" />
      <path fill="url(#qw-pb-shine)" d="M12.00 0.82 L12.72 0.95 L13.41 1.30 L14.03 1.80 L14.59 2.33 L15.13 2.79 L15.68 3.11 L16.30 3.28 L17.00 3.33 L17.78 3.35 L18.57 3.44 L19.30 3.67 L19.91 4.09 L20.33 4.70 L20.56 5.43 L20.65 6.22 L20.67 6.99 L20.72 7.70 L20.89 8.32 L21.21 8.87 L21.67 9.41 L22.20 9.97 L22.70 10.59 L23.05 11.28 L23.18 12.00 L23.05 12.72 L22.70 13.41 L22.20 14.03 L21.67 14.59 L21.21 15.13 L20.89 15.68 L20.72 16.30 L20.67 17.00 L20.65 17.78 L20.56 18.57 L20.33 19.30 L19.91 19.91 L19.30 20.33 L18.57 20.56 L17.78 20.65 L17.00 20.67 L16.30 20.72 L15.68 20.89 L15.13 21.21 L14.59 21.67 L14.03 22.20 L13.41 22.70 L12.72 23.05 L12.00 23.18 L11.28 23.05 L10.59 22.70 L9.97 22.20 L9.41 21.67 L8.87 21.21 L8.32 20.89 L7.70 20.72 L7.00 20.67 L6.22 20.65 L5.43 20.56 L4.70 20.33 L4.09 19.91 L3.67 19.30 L3.44 18.57 L3.35 17.78 L3.33 17.01 L3.28 16.30 L3.11 15.68 L2.79 15.13 L2.33 14.59 L1.80 14.03 L1.30 13.41 L0.95 12.72 L0.82 12.00 L0.95 11.28 L1.30 10.59 L1.80 9.97 L2.33 9.41 L2.79 8.87 L3.11 8.32 L3.28 7.70 L3.33 6.99 L3.35 6.22 L3.44 5.43 L3.67 4.70 L4.09 4.09 L4.70 3.67 L5.43 3.44 L6.22 3.35 L6.99 3.33 L7.70 3.28 L8.32 3.11 L8.87 2.79 L9.41 2.33 L9.97 1.80 L10.59 1.30 L11.28 0.95Z" />
      <path d="M7.7 12.4l2.9 2.9 5.7-6" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Username followed by the gold premium badge, or the blue verified badge. */
export function PlayerName({ name, verified, premium, size = 15 }: { name: string; verified?: boolean; premium?: boolean; size?: number }) {
  return (
    <span className="player-name">
      <span className="ellipsis">{name}</span>
      {premium ? <PremiumBadge size={size} /> : verified && <VerifiedBadge size={size} />}
    </span>
  );
}

/** The badge after a big name (profile headers): gold premium wins over blue verified. */
export function NameBadges({ user, size = 22 }: { user: { verified?: boolean; premium?: boolean }; size?: number }) {
  return (
    <>
      {user.premium ? <PremiumBadge size={size} /> : user.verified && <VerifiedBadge size={size} />}
    </>
  );
}
