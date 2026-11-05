import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { N } from './Feedback';
import { achievementIcon, categoryIcon, Icon, IconTile, type IconName } from './Icon';
import { LeagueEmblem } from './LeagueEmblem';
import { num, useLang, useT } from '../lib/i18n';

/** Big numbers in one line, TikTok style (no boxes). */
export function ProfileNumbers({ items }: { items: { value: string | number; label: string; to?: string }[] }) {
  return (
    <div className="px-nums" style={{ ['--n' as string]: items.length }}>
      {items.map((it) =>
        it.to ? (
          <Link key={it.label} to={it.to}>
            <b><N v={it.value} /></b>
            <span>{it.label}</span>
          </Link>
        ) : (
          <div key={it.label}>
            <b><N v={it.value} /></b>
            <span>{it.label}</span>
          </div>
        ),
      )}
    </div>
  );
}

/** Round achievement highlights (like story highlights). */
export function AchievementHighlights({ items, onMore, total }: { items: any[]; onMore?: () => void; total?: number }) {
  const t = useT();
  const lang = useLang();
  const unlocked = items.filter((a) => !('unlockedAt' in a) || !!a.unlockedAt);
  if (!unlocked.length) return null;
  return (
    <div className="px-hl" role="list">
      {unlocked.slice(0, 6).map((a, i) => (
        <div key={a.key} className="px-hl-item" role="listitem" title={a.description}>
          <span className={`px-hl-medal m${i % 5}`}>
            <Icon name={achievementIcon(a)} size={24} />
          </span>
          <span className="px-hl-name">{a.name}</span>
        </div>
      ))}
      {onMore && (
        <button className="px-hl-item" onClick={onMore}>
          <span className="px-hl-medal more">
            <Icon name="chevron" size={22} />
          </span>
          <span className="px-hl-name">
            {t('All', 'সব')}
            {total ? ` (${num(unlocked.length, lang)}/${num(total, lang)})` : ''}
          </span>
        </button>
      )}
    </div>
  );
}

/** Underlined tabs across the full width. */
export function ProfileTabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="px-tabs" role="tablist">
      {tabs.map((tb) => (
        <button key={tb.key} role="tab" aria-selected={value === tb.key} onClick={() => onChange(tb.key)}>
          {tb.label}
        </button>
      ))}
    </div>
  );
}

/** Nine detailed stats as soft tiles with a coloured icon. */
export function StatsNumbers({ stats }: { stats: any }) {
  const t = useT();
  const items: [IconName, string, string, string | number][] = [
    ['gamepad', 'blue', t('Games', 'ম্যাচ'), stats.totalGames],
    ['trophy', 'green', t('Wins', 'জয়'), stats.wins],
    ['x-circle', 'red', t('Losses', 'হার'), stats.losses],
    ['target', 'violet', t('Accuracy', 'সঠিকতা'), `${stats.accuracy}%`],
    ['star', 'amber', t('Best score', 'সেরা স্কোর'), stats.bestScore],
    ['fire', 'orange', t('Win streak', 'টানা জয়'), stats.currentWinStreak],
    ['medal', 'amber', t('Best streak', 'সেরা টানা জয়'), stats.bestWinStreak],
    ['calendar', 'cyan', t('Best days', 'সেরা টানা দিন'), stats.bestStreakDays],
    ['heart-pulse', 'pink', t('Survival best', 'সারভাইভাল সেরা'), stats.bestSurvival],
    ['gamepad', 'violet', t('Ludo wins', 'লুডুতে জয়'), `${stats.ludoWins ?? 0}/${stats.ludoGames ?? 0}`],
  ];
  return (
    <div className="px-grid">
      {items.map(([icon, tone, label, value]) => (
        <div key={label} className={`px-stat t-${tone}`}>
          <span className="px-stat-ic"><Icon name={icon} size={18} /></span>
          <b><N v={value} /></b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function PxSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-sec">
      <div className="px-sec-h">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CategoryBars({ categories }: { categories: any[] }) {
  const lang = useLang();
  return (
    <div className="px-bars">
      {categories.map((c: any) => (
        <div key={c.id} className="px-bar">
          <IconTile name={categoryIcon(c)} color={c.color} size={32} />
          <div className="grow">
            <div className="row between small">
              <span className="bold">{lang === 'bn' ? (c.nameBn ?? c.name) : c.name}</span>
              <b className="num">{num(c.accuracy, lang)}%</b>
            </div>
            <div className="progress" style={{ height: 6, marginTop: 4 }}>
              <span style={{ width: `${c.accuracy}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SeasonList({ seasons }: { seasons: any[] }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="px-list">
      {seasons.map((x: any) => (
        <div key={x.id} className="px-row">
          <LeagueEmblem league={x.league ?? 'bronze'} size={36} />
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="small ellipsis" style={{ display: 'block' }}>
              {x.name} {x.status === 'active' && <span className="chip primary xs-chip">{t('Current', 'চলমান')}</span>}
            </b>
            <span className="xs muted">
              {t('Won', 'জয়')} {num(x.wins ?? 0, lang)} · {t('Lost', 'পরাজয়')} {num(x.losses ?? 0, lang)} · {t('Peak', 'সর্বোচ্চ')} {num(x.peakRating ?? x.rating ?? 0, lang)}
            </span>
          </div>
          {x.finalRank ? <b className="num">#{num(x.finalRank, lang)}</b> : <b className="num">{num(x.rating ?? 0, lang)}</b>}
        </div>
      ))}
    </div>
  );
}

/** All achievements as a clean grid of medals (locked ones greyed). */
export function AchievementGrid({ items }: { items: any[] }) {
  return (
    <div className="px-ach">
      {items.map((a, i) => {
        const locked = 'unlockedAt' in a && !a.unlockedAt;
        return (
          <div key={a.key} className={`px-ach-item ${locked ? 'locked' : ''}`} title={a.description}>
            <span className={`px-hl-medal m${i % 5}`}>
              <Icon name={(locked ? 'lock' : achievementIcon(a)) as IconName} size={22} />
            </span>
            <b>{a.name}</b>
            {a.description && <small>{a.description}</small>}
          </div>
        );
      })}
    </div>
  );
}
