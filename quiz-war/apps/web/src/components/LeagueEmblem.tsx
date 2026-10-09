import { useId } from 'react';

const TIERS: Record<string, { from: string; to: string; rim: string; ink: string; gem?: string; crown?: boolean; wings?: boolean; stars: number }> = {
  bronze: { from: '#f0b27a', to: '#9c5a25', rim: '#6e3d16', ink: '#fff4e8', stars: 1 },
  silver: { from: '#f1f5f9', to: '#8a97a8', rim: '#5b6676', ink: '#ffffff', stars: 2 },
  gold: { from: '#fde68a', to: '#d39a06', rim: '#8a6100', ink: '#fffbeb', stars: 3 },
  platinum: { from: '#a5f3fc', to: '#0e8fa8', rim: '#0b5e70', ink: '#ecfeff', gem: '#e0fbff', stars: 3 },
  diamond: { from: '#bfdbfe', to: '#3b5bdb', rim: '#23338a', ink: '#eef2ff', gem: '#dbeafe', stars: 3 },
  master: { from: '#e9d5ff', to: '#7c3aed', rim: '#4c1d95', ink: '#faf5ff', gem: '#f5d0fe', crown: true, stars: 3 },
  champion: { from: '#fecaca', to: '#dc2626', rim: '#7f1d1d', ink: '#fff7ed', gem: '#fde68a', crown: true, wings: true, stars: 3 },
};

/** Hand-drawn league emblem (shield + tier details). Works at 16px–160px. */
export function LeagueEmblem({ league, size = 28, title }: { league: string; size?: number; title?: string }) {
  const t = TIERS[league] ?? TIERS.bronze;
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} className="league-emblem">
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.from} />
          <stop offset="1" stopColor={t.to} />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {t.wings && (
        <g fill={t.to} stroke={t.rim} strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 20 2 16l3 9-3 4 7 1 2 6 4-3z" />
          <path d="M52 20l10-4-3 9 3 4-7 1-2 6-4-3z" />
        </g>
      )}
      <path d="M32 4 54 12v17c0 15-9.5 25.5-22 31C19.5 54.5 10 44 10 29V12z" fill={`url(#${id}f)`} stroke={t.rim} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 9 49 15.2v13.6c0 11.8-7.2 20.4-17 25-9.8-4.6-17-13.2-17-25V15.2z" fill="none" stroke={t.ink} strokeOpacity=".55" strokeWidth="1.5" />
      <path d="M32 4 54 12v17c0 4-.7 7.6-1.9 10.9C40 37 22 26 10 22V12z" fill={`url(#${id}s)`} />
      {t.gem ? (
        <path d="M32 22l8 7-8 12-8-12z" fill={t.gem} stroke={t.rim} strokeWidth="1.8" strokeLinejoin="round" />
      ) : (
        <path d="M22 34l10-8 10 8M22 42l10-8 10 8" fill="none" stroke={t.ink} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {t.crown && <path d="M23 8l4.5 4L32 5l4.5 7L41 8l-2 8H25z" fill="#fcd34d" stroke="#92400e" strokeWidth="1.4" strokeLinejoin="round" />}
      <g fill={t.ink}>
        {Array.from({ length: t.stars }, (_, i) => {
          const x = 32 + (i - (t.stars - 1) / 2) * 7;
          return <circle key={i} cx={x} cy={49} r="1.8" />;
        })}
      </g>
    </svg>
  );
}
