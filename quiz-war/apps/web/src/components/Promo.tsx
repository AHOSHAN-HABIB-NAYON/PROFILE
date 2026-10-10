import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { haptic, isNative } from '../lib/platform';
import { Icon } from './Icon';
import { Modal } from './Sheet';

export type Promo = { id: number; title: string; body: string; ctaLabel: string; linkUrl: string; logoUrl: string | null; color: string | null; placements: ('home' | 'result')[]; weight: number };
type Placement = 'home' | 'result';

/** How often each moment may show a promo (and never two within GAP_MS). */
const HOME_EVERY_MS = 3 * 60 * 60_000;
const RESULT_EVERY_N = 2;
const GAP_MS = 4 * 60_000;
const KEY = 'qw-promo';

type Memory = { last: number; lastId: number; home: number; results: number };
function load(): Memory {
  try {
    return { last: 0, lastId: 0, home: 0, results: 0, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { last: 0, lastId: 0, home: 0, results: 0 };
  }
}
function save(m: Memory) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage blocked: promos just show a bit more often */
  }
}

/** Weighted pick that avoids repeating the last promo when there is a choice. */
function pick(list: Promo[], lastId: number) {
  const pool = list.length > 1 ? list.filter((p) => p.id !== lastId) : list;
  let r = Math.random() * pool.reduce((s, p) => s + p.weight, 0);
  for (const p of pool) if ((r -= p.weight) < 0) return p;
  return pool[0];
}

const playId = (url: string) => /^market:\/\/details\?id=([\w.]+)/i.exec(url)?.[1] ?? /play\.google\.com\/store\/apps\/details\?(?:.*&)?id=([\w.]+)/i.exec(url)?.[1];

/** Play Store links open the Play Store app (in the app) or the store page (on the web); others open the browser. */
export function openPromoLink(url: string) {
  const pkg = playId(url);
  if (isNative) {
    window.location.href = pkg ? `market://details?id=${pkg}` : url;
    return;
  }
  window.open(pkg ? `https://play.google.com/store/apps/details?id=${pkg}` : url, '_blank', 'noopener');
}

const track = (id: number, kind: 'view' | 'click') => void api(`/promos/${id}/${kind}`, { method: 'POST', auth: false }).catch(() => undefined);

export function PromoCard({ p, onClose }: { p: Promo; onClose: () => void }) {
  const t = useT();
  const host = (() => {
    const pkg = playId(p.linkUrl);
    if (pkg) return 'Google Play';
    try {
      return new URL(p.linkUrl).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  const isStore = host === 'Google Play';
  return (
    <div className="promo" style={{ ['--promo' as string]: p.color || '#2563eb' }}>
      <span className="promo-tag">{t('Sponsored', 'বিজ্ঞাপন')}</span>
      <div className="promo-hero" aria-hidden>
        <span className="promo-ring" />
        <span className="promo-logo">{p.logoUrl ? <img src={p.logoUrl} alt="" /> : <Icon name={isStore ? 'download' : 'globe'} size={40} />}</span>
      </div>
      <h2>{p.title}</h2>
      {p.body && <p>{p.body}</p>}
      {host && <span className="promo-host"><Icon name={isStore ? 'download' : 'external'} size={14} /> {host}</span>}
      <div className="promo-actions">
        <button
          type="button"
          className="btn primary lg block promo-cta"
          onClick={() => {
            haptic('tap');
            track(p.id, 'click');
            openPromoLink(p.linkUrl);
            onClose();
          }}
        >
          {p.ctaLabel || (isStore ? t('Install', 'ইনস্টল করুন') : t('Open', 'ওপেন করুন'))} <Icon name="arrow-right" size={18} />
        </button>
        <button type="button" className="btn ghost block" onClick={onClose}>{t('Not now', 'এখন না')}</button>
      </div>
    </div>
  );
}

/**
 * Shows an admin promotion at natural breaks: on Home now and then, and after every
 * second finished match. Never on top of another popup, never twice in a few minutes.
 */
export function PromoHost() {
  const { pathname } = useLocation();
  const { data } = useQuery({ queryKey: ['promos'], queryFn: async () => (await api<{ items: Promo[] }>('/promos', { auth: false })).items, staleTime: 5 * 60_000 });
  const [shown, setShown] = useState<Promo | null>(null);

  const placement: Placement | null = pathname === '/' ? 'home' : pathname.startsWith('/result/') ? 'result' : null;
  const resultKey = placement === 'result' ? pathname : null;

  // Count each finished match once, as soon as its result opens.
  useEffect(() => {
    if (!resultKey) return;
    const m = load();
    save({ ...m, results: m.results + 1 });
  }, [resultKey]);

  useEffect(() => {
    if (!placement || shown || !data?.length) return;
    const list = data.filter((p) => p.placements.includes(placement));
    if (!list.length) return;
    const m = load();
    const now = Date.now();
    if (now - m.last < GAP_MS) return;
    if (placement === 'home' && now - m.home < HOME_EVERY_MS) return;
    if (placement === 'result' && m.results % RESULT_EVERY_N !== 0) return;
    const timer = setTimeout(() => {
      // Wait politely if something else (update, invite, share sheet) is open.
      if (document.querySelector('dialog[open]')) return;
      const p = pick(list, m.lastId);
      save({ ...load(), last: Date.now(), lastId: p.id, ...(placement === 'home' ? { home: Date.now() } : {}) });
      track(p.id, 'view');
      setShown(p);
    }, placement === 'result' ? 3500 : 5000);
    return () => clearTimeout(timer);
  }, [placement, resultKey, data, shown]);

  return (
    <Modal open={!!shown} onClose={() => setShown(null)} label={shown?.title ?? ''}>
      {shown && <PromoCard p={shown} onClose={() => setShown(null)} />}
    </Modal>
  );
}
