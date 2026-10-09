import { leagueForRating, levelFromXp, DEFAULT_GAME_SETTINGS } from '@quizwar/shared';
import { useConfig } from '../hooks/queries';
import { num, useLang, useT } from '../lib/i18n';
import { LeagueEmblem } from './LeagueEmblem';

export function useLeagues() {
  const { data } = useConfig();
  return data?.game.leagues ?? DEFAULT_GAME_SETTINGS.ranked.leagues;
}

export function LeagueBadge({ rating, compact = false }: { rating: number; compact?: boolean }) {
  const leagues = useLeagues();
  const lang = useLang();
  const l = leagueForRating(rating, leagues);
  return (
    <span className="chip league-chip" title={l.name}>
      <LeagueEmblem league={l.key} size={18} />
      {!compact && l.name} <span className="num">{num(rating, lang)}</span>
    </span>
  );
}

export function LevelBar({ xp }: { xp: number }) {
  const { data } = useConfig();
  const t = useT();
  const lang = useLang();
  const info = levelFromXp(xp, data?.game.levels ?? DEFAULT_GAME_SETTINGS.levels);
  const pct = Math.round(info.progress * 100);
  return (
    <div>
      <div className="row between xs bold">
        <span>{t('Level', 'লেভেল')} {num(info.level, lang)}</span>
        <span className="faint num">{num(info.intoLevel, lang)} / {num(info.needed, lang)} XP</span>
      </div>
      <div className="progress" style={{ marginTop: 6 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('Level progress', 'লেভেলের অগ্রগতি')}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
