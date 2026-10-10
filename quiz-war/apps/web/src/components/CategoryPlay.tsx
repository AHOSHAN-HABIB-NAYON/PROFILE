import { AI_LEVEL_DIFFICULTY, AI_LEVELS, type AiLevel, type Difficulty } from '@quizwar/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCategories, type Category } from '../hooks/queries';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { useStart } from '../pages/Battle';
import { categoryIcon, Icon, type IconName } from './Icon';
import { CountPicker, DifficultyPicker, MatchSummary, useMatchOptions } from './MatchOptions';
import { Sheet } from './Sheet';

/** Brand colours per default category, used when the admin hasn't picked one. */
const DEFAULT_COLORS: Record<string, string> = {
  bangladesh: '#16a34a',
  bcs: '#2563eb',
  'govt-jobs': '#7c3aed',
  diploma: '#0891b2',
  bank: '#059669',
  bangla: '#dc2626',
  english: '#4f46e5',
  math: '#ea580c',
  science: '#0d9488',
  ict: '#0284c7',
  international: '#9333ea',
  'current-affairs': '#e11d48',
  sports: '#d97706',
  'general-knowledge': '#db2777',
};
export const categoryColor = (c: Pick<Category, 'slug' | 'color'>) => c.color || DEFAULT_COLORS[c.slug] || '#2563eb';

/** Category artwork: the admin's uploaded icon if set, otherwise the built-in SVG icon. */
export function CategoryArt({ c, size = 52 }: { c: Category; size?: number }) {
  const color = categoryColor(c);
  return (
    <span className="cat-art" style={{ width: size, height: size, ['--cat' as string]: color }} aria-hidden>
      {c.iconUrl ? <img src={c.iconUrl} alt="" loading="lazy" decoding="async" /> : <Icon name={categoryIcon(c)} size={Math.round(size * 0.52)} />}
    </span>
  );
}

const DIFF_TO_AI: Record<Difficulty, AiLevel> = Object.fromEntries(AI_LEVELS.map((l) => [AI_LEVEL_DIFFICULTY[l], l])) as Record<Difficulty, AiLevel>;

/** "How do you want to play this category?" — count, difficulty and the ways to play. */
function CategorySheet({ c, onClose }: { c: Category | null; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const opts = useMatchOptions();
  const { busy, start } = useStart();
  const [count, setCount] = useState(opts.defaultCount);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  if (!c) return null;
  const name = lang === 'bn' ? (c.nameBn ?? c.name) : c.name;
  const aiLevel: AiLevel = difficulty ? DIFF_TO_AI[difficulty] : 'normal';
  const go = (fn: () => void) => () => (haptic('tap'), onClose(), fn());

  const ways: { key: string; icon: IconName; tone: string; title: string; sub: string; run: () => void }[] = [
    {
      key: 'ai',
      icon: 'bot',
      tone: 'cyan',
      title: t('Play with AI', 'AI-এর সাথে খেলুন'),
      sub: t('Instant match, no waiting', 'অপেক্ষা ছাড়াই এখনই খেলা'),
      run: () => void start('ai:start', { level: aiLevel, categoryId: c.id, questionCount: count }),
    },
    {
      key: 'friend',
      icon: 'users',
      tone: 'primary',
      title: t('Play with friends', 'বন্ধুদের সাথে খেলুন'),
      sub: t('Make a war room, share the code', 'ওয়ার রুম বানিয়ে কোড শেয়ার করুন'),
      run: () => void start('room:create', { mode: 'duel', categoryId: c.id, questionCount: Math.min(50, count), difficulty, questionTimeSec: opts.timeFor(difficulty) }),
    },
    {
      key: 'practice',
      icon: 'book-check',
      tone: 'success',
      title: t('Practice alone', 'একা অনুশীলন'),
      sub: t('Learn at your own pace', 'নিজের গতিতে শিখুন'),
      run: () => void start('solo:start', { mode: 'solo', categoryId: c.id, difficulty, questionCount: count }),
    },
    {
      key: 'battle',
      icon: 'swords',
      tone: 'danger',
      title: t('Find an opponent', 'প্রতিপক্ষ খুঁজুন'),
      sub: t('Live 1 VS 1 with a real player', 'আসল প্লেয়ারের সাথে লাইভ ১ বনাম ১'),
      run: () => nav(`/matchmaking?mode=duel&ranked=0&category=${c.id}`),
    },
  ];

  return (
    <Sheet open onClose={onClose} title={t('How do you want to play?', 'কীভাবে খেলবেন?')} icon="gamepad">
      <div className="cat-sheet">
        <div className="cs-head" style={{ ['--cat' as string]: categoryColor(c) }}>
          <CategoryArt c={c} size={60} />
          <div>
            <b>{name}</b>
            <span className="xs">{num(c.questionCount, lang)} {t('questions in this category', 'টি প্রশ্ন আছে')}</span>
          </div>
        </div>
        <CountPicker value={count} onChange={setCount} />
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <MatchSummary count={count} difficulty={difficulty} seconds={opts.timeFor(difficulty)} />
        <div className="cs-ways">
          {ways.map((w) => (
            <button key={w.key} type="button" className={`cs-way tone-${w.tone}`} disabled={busy} onClick={go(w.run)}>
              <span className="cs-way-ic"><Icon name={w.icon} size={22} /></span>
              <span className="grow">
                <b>{w.title}</b>
                <span className="xs">{w.sub}</span>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** Home: every category as a tile; tapping one asks how to play it. */
export function HomeCategories() {
  const t = useT();
  const lang = useLang();
  const { data, isLoading } = useCategories();
  const [open, setOpen] = useState<Category | null>(null);
  const cats = (data ?? []).filter((c) => c.questionCount > 0);
  if (!isLoading && cats.length === 0) return null;
  return (
    <section aria-labelledby="home-cats">
      <div className="section-head">
        <h3 id="home-cats"><Icon name="grid" size={18} /> {t('Play by category', 'বিষয় বেছে খেলুন')}</h3>
      </div>
      <div className="cat-grid stagger">
        {isLoading
          ? Array.from({ length: 6 }, (_, i) => <span key={i} className="cat-tile skeleton" />)
          : cats.map((c) => (
              <button key={c.id} type="button" className="cat-tile" style={{ ['--cat' as string]: categoryColor(c) }} onClick={() => (haptic('tap'), setOpen(c))}>
                <CategoryArt c={c} />
                <b>{lang === 'bn' ? (c.nameBn ?? c.name) : c.name}</b>
                <span className="xs">{num(c.questionCount, lang)} {t('questions', 'প্রশ্ন')}</span>
              </button>
            ))}
      </div>
      {open && <CategorySheet key={open.id} c={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
