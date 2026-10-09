import { DEFAULT_GAME_SETTINGS, type Difficulty } from '@quizwar/shared';
import { useConfig } from '../hooks/queries';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { Icon, type IconName } from './Icon';

export const DIFFICULTY_INFO: Record<Difficulty, { en: string; bn: string; icon: IconName }> = {
  easy: { en: 'Easy', bn: 'সহজ', icon: 'smile' },
  medium: { en: 'Medium', bn: 'মাঝারি', icon: 'gauge' },
  hard: { en: 'Hard', bn: 'কঠিন', icon: 'bolt' },
  expert: { en: 'Expert', bn: 'এক্সপার্ট', icon: 'brain' },
};

/** Admin-controlled match options (question counts, seconds per difficulty). */
export function useMatchOptions() {
  const { data } = useConfig();
  const m = data?.game.match ?? DEFAULT_GAME_SETTINGS.match;
  return {
    counts: m.questionCountOptions ?? DEFAULT_GAME_SETTINGS.match.questionCountOptions,
    defaultCount: m.questionCount,
    defaultTime: m.questionTimeSec,
    timeFor: (d: Difficulty | null) => (d ? (m.difficultyTimeSec ?? DEFAULT_GAME_SETTINGS.match.difficultyTimeSec)[d] : m.questionTimeSec),
  };
}

export function CountPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label?: string }) {
  const t = useT();
  const lang = useLang();
  const { counts } = useMatchOptions();
  return (
    <div className="opt-block">
      <span className="opt-label"><Icon name="list" size={14} /> {label ?? t('Questions', 'প্রশ্নের সংখ্যা')}</span>
      <div className="opt-chips" role="radiogroup" aria-label={label ?? t('Questions', 'প্রশ্নের সংখ্যা')}>
        {counts.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} className="select-chip num" onClick={() => (haptic('tap'), onChange(n))}>
            {num(n, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DifficultyPicker({ value, onChange, allowAny = true }: { value: Difficulty | null; onChange: (d: Difficulty | null) => void; allowAny?: boolean }) {
  const t = useT();
  const lang = useLang();
  const { timeFor } = useMatchOptions();
  const items: (Difficulty | null)[] = allowAny ? [null, 'easy', 'medium', 'hard', 'expert'] : ['easy', 'medium', 'hard', 'expert'];
  return (
    <div className="opt-block">
      <span className="opt-label"><Icon name="gauge" size={14} /> {t('Difficulty', 'কঠিনতা')}</span>
      <div className="opt-chips" role="radiogroup" aria-label={t('Difficulty', 'কঠিনতা')}>
        {items.map((d) => (
          <button key={String(d)} type="button" role="radio" aria-checked={value === d} className={`select-chip diff-${d ?? 'any'}`} onClick={() => (haptic('tap'), onChange(d))}>
            {d && <Icon name={DIFFICULTY_INFO[d].icon} size={16} />}
            {d ? t(DIFFICULTY_INFO[d].en, DIFFICULTY_INFO[d].bn) : t('Mixed', 'মিশ্র')}
            <small className="opt-sec">{num(timeFor(d), lang)}{t('s', 'সে')}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** One-line summary, e.g. "15 questions · Hard · 5s each". */
export function MatchSummary({ count, difficulty, seconds }: { count: number | null; difficulty: Difficulty | null; seconds: number }) {
  const t = useT();
  const lang = useLang();
  return (
    <p className="xs muted opt-summary">
      <Icon name="timer" size={14} />{' '}
      {count ? t(`${count} questions`, `${num(count, lang)}টি প্রশ্ন`) : null}
      {' · '}
      {difficulty ? t(DIFFICULTY_INFO[difficulty].en, DIFFICULTY_INFO[difficulty].bn) : t('Mixed difficulty', 'মিশ্র কঠিনতা')}
      {' · '}
      {t(`${seconds}s per question`, `প্রতি প্রশ্নে ${num(seconds, lang)} সেকেন্ড`)}
    </p>
  );
}
