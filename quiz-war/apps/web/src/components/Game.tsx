import { leagueForRating, levelFromXp, DEFAULT_GAME_SETTINGS } from '@quizwar/shared';
import { useConfig } from '../hooks/queries';

export function useLeagues() {
  const { data } = useConfig();
  return data?.game.leagues ?? DEFAULT_GAME_SETTINGS.ranked.leagues;
}

export function LeagueBadge({ rating, compact = false }: { rating: number; compact?: boolean }) {
  const leagues = useLeagues();
  const l = leagueForRating(rating, leagues);
  return (
    <span className="chip accent" title={`${l.name} league`}>
      {l.icon} {compact ? '' : l.name} <span className="num">{rating}</span>
    </span>
  );
}

export function LevelBar({ xp }: { xp: number }) {
  const { data } = useConfig();
  const info = levelFromXp(xp, data?.game.levels ?? DEFAULT_GAME_SETTINGS.levels);
  return (
    <div>
      <div className="row between xs bold">
        <span>Level {info.level}</span>
        <span className="faint num">{info.intoLevel.toLocaleString()} / {info.needed.toLocaleString()} XP</span>
      </div>
      <div className="progress mt" style={{ marginTop: 6 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(info.progress * 100)} aria-label="Level progress">
        <span style={{ width: `${Math.round(info.progress * 100)}%` }} />
      </div>
    </div>
  );
}
