import type { Difficulty, MatchSnapshot } from '@quizwar/shared';
import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/api';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { emit } from '../lib/socket';
import { toast } from '../lib/toast';
import { CategoryPicker } from './CategoryPicker';
import { Icon } from './Icon';
import { DIFFICULTY_INFO, useMatchOptions } from './MatchOptions';

const COUNTS = [10, 20, 30, 50, 100, 200, 300];
const MINUTES = [3, 5, 10, 15, 20, 30];
const SECONDS = [4, 5, 8, 10, 15, 20, 30];

/** War Room rules. The host edits them inside the room; everyone else sees the summary. */
export function RoomSettings({ snap, isHost }: { snap: MatchSnapshot; isHost: boolean }) {
  const t = useT();
  const lang = useLang();
  const opts = useMatchOptions();
  const timed = !!snap.totalTimeSec;
  const [customCount, setCustomCount] = useState('');
  const [customMin, setCustomMin] = useState('');
  const [catOpen, setCatOpen] = useState(false);

  useEffect(() => setCustomCount(''), [snap.questionCount]);

  const update = async (patch: Record<string, unknown>) => {
    haptic('tap');
    try {
      await emit('room:settings' as any, { matchId: snap.matchId, ...patch });
    } catch (e) {
      toast.error(t('Could not change the room', 'রুম বদলানো যায়নি'), friendlyError(e));
    }
  };

  const summary = (
    <div className="rs-summary">
      <span className="chip on-dark"><Icon name="grid" /> {snap.category ? snap.category.name : t('Mixed', 'মিশ্র')}</span>
      {timed ? (
        <span className="chip on-dark"><Icon name="hourglass" /> {num(Math.round((snap.totalTimeSec ?? 0) / 60), lang)} {t('min', 'মিনিট')}</span>
      ) : (
        <span className="chip on-dark"><Icon name="list" /> {snap.questionCount ? num(snap.questionCount, lang) : '∞'} {t('questions', 'প্রশ্ন')}</span>
      )}
      <span className="chip on-dark"><Icon name="timer" /> {num(snap.questionTimeSec, lang)}{t('s each', ' সে/প্রশ্ন')}</span>
      <span className="chip on-dark">
        <Icon name={snap.difficulty ? DIFFICULTY_INFO[snap.difficulty].icon : 'sparkles'} />{' '}
        {snap.difficulty ? t(DIFFICULTY_INFO[snap.difficulty].en, DIFFICULTY_INFO[snap.difficulty].bn) : t('Mixed level', 'মিশ্র কঠিনতা')}
      </span>
    </div>
  );

  if (!isHost)
    return (
      <section className="room-settings view" aria-label={t('Room rules', 'রুমের নিয়ম')}>
        <div className="rs-title"><Icon name="settings" size={16} /> {t('Room rules (set by host)', 'রুমের নিয়ম (হোস্ট ঠিক করবেন)')}</div>
        {summary}
      </section>
    );

  return (
    <section className="room-settings" aria-label={t('Room settings', 'রুম সেটিংস')}>
      <div className="rs-title"><Icon name="settings" size={16} /> {t('Room settings', 'রুম সেটিংস')} <span className="xs dim">· {t('only you can change these', 'শুধু আপনি বদলাতে পারবেন')}</span></div>

      <div className="rs-row">
        <span className="rs-label">{t('Category', 'ক্যাটাগরি')}</span>
        <button type="button" className="rs-pick" onClick={() => setCatOpen((o) => !o)} aria-expanded={catOpen}>
          {snap.category ? snap.category.name : t('Mixed', 'মিশ্র')} <Icon name="chevron-down" size={16} />
        </button>
      </div>
      {catOpen && (
        <div className="rs-cats">
          <CategoryPicker value={snap.category?.id ?? null} onChange={(id) => (setCatOpen(false), void update({ categoryId: id }))} />
        </div>
      )}

      <div className="rs-label">{t('Play by', 'খেলার ধরন')}</div>
      <div className="seg dark" role="radiogroup">
        <button type="button" role="radio" aria-checked={!timed} onClick={() => timed && void update({ totalTimeSec: null, questionCount: opts.defaultCount })}>
          <Icon name="list" size={16} /> {t('Number of questions', 'প্রশ্নের সংখ্যা')}
        </button>
        <button type="button" role="radio" aria-checked={timed} onClick={() => !timed && void update({ totalTimeSec: 10 * 60 })}>
          <Icon name="hourglass" size={16} /> {t('Total minutes', 'মোট মিনিট')}
        </button>
      </div>

      {timed ? (
        <>
          <div className="rs-chips" role="radiogroup" aria-label={t('Minutes', 'মিনিট')}>
            {MINUTES.map((mi) => (
              <button key={mi} type="button" role="radio" aria-checked={snap.totalTimeSec === mi * 60} className="select-chip dark" onClick={() => void update({ totalTimeSec: mi * 60 })}>
                {num(mi, lang)} {t('min', 'মিনিট')}
              </button>
            ))}
          </div>
          <form className="rs-custom" onSubmit={(e) => (e.preventDefault(), Number(customMin) >= 1 && void update({ totalTimeSec: Math.min(180, Number(customMin)) * 60 }))}>
            <input className="input dark" inputMode="numeric" min={1} max={180} type="number" placeholder={t('Custom minutes (1–180)', 'নিজের মতো মিনিট (১–১৮০)')} value={customMin} onChange={(e) => setCustomMin(e.target.value)} />
            <button className="btn sm white" disabled={!customMin}>{t('Set', 'সেট')}</button>
          </form>
          <p className="xs dim">{t('Questions keep coming until the time is up. Highest score wins.', 'সময় শেষ না হওয়া পর্যন্ত প্রশ্ন আসতে থাকবে। যার স্কোর বেশি সে জিতবে।')}</p>
        </>
      ) : (
        <>
          <div className="rs-chips" role="radiogroup" aria-label={t('Questions', 'প্রশ্ন')}>
            {COUNTS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={snap.questionCount === n} className="select-chip dark" onClick={() => void update({ questionCount: n })}>
                {num(n, lang)}
              </button>
            ))}
          </div>
          <form className="rs-custom" onSubmit={(e) => (e.preventDefault(), Number(customCount) >= 3 && void update({ questionCount: Math.min(500, Math.round(Number(customCount))) }))}>
            <input className="input dark" inputMode="numeric" min={3} max={500} type="number" placeholder={t('Custom number (3–500)', 'নিজের মতো সংখ্যা (৩–৫০০)')} value={customCount} onChange={(e) => setCustomCount(e.target.value)} />
            <button className="btn sm white" disabled={!customCount}>{t('Set', 'সেট')}</button>
          </form>
        </>
      )}

      <div className="rs-label">{t('Seconds per question', 'প্রতি প্রশ্নে সময়')}</div>
      <div className="rs-chips" role="radiogroup" aria-label={t('Seconds per question', 'প্রতি প্রশ্নে সময়')}>
        {SECONDS.map((sec) => (
          <button key={sec} type="button" role="radio" aria-checked={snap.questionTimeSec === sec} className="select-chip dark" onClick={() => void update({ questionTimeSec: sec })}>
            {num(sec, lang)}{t('s', ' সে')}
          </button>
        ))}
      </div>

      <div className="rs-label">{t('Difficulty', 'কঠিনতা')}</div>
      <div className="rs-chips" role="radiogroup" aria-label={t('Difficulty', 'কঠিনতা')}>
        {([null, 'easy', 'medium', 'hard', 'expert'] as (Difficulty | null)[]).map((d) => (
          <button
            key={String(d)}
            type="button"
            role="radio"
            aria-checked={(snap.difficulty ?? null) === d}
            className="select-chip dark"
            // Picking a level also sets its recommended time (hard 5s, expert 4s…).
            onClick={() => void update({ difficulty: d, questionTimeSec: opts.timeFor(d) })}
          >
            {d && <Icon name={DIFFICULTY_INFO[d].icon} size={15} />} {d ? t(DIFFICULTY_INFO[d].en, DIFFICULTY_INFO[d].bn) : t('Mixed', 'মিশ্র')}
          </button>
        ))}
      </div>
      {summary}
    </section>
  );
}
