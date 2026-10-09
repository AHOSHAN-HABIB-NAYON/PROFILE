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

/** Username followed by the badge when the player is verified. */
export function PlayerName({ name, verified, size = 15 }: { name: string; verified?: boolean; size?: number }) {
  return (
    <span className="player-name">
      <span className="ellipsis">{name}</span>
      {verified && <VerifiedBadge size={size} />}
    </span>
  );
}
