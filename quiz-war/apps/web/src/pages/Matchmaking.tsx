import type { AiLevel, ModeKey } from '@quizwar/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { LeagueBadge } from '../components/Game';
import { Icon, IconTile } from '../components/Icon';
import { friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { num, useLang, useT } from '../lib/i18n';
import { modeIcon, modeLabel } from '../lib/labels';
import { haptic } from '../lib/platform';
import { emit, getSocket, useConn } from '../lib/socket';
import { sfx } from '../lib/sound';

const TIPS: [string, string][] = [
  ['Fast correct answers earn a speed bonus.', 'দ্রুত সঠিক উত্তরে স্পিড বোনাস পাবেন।'],
  ['Three correct in a row starts a combo multiplier.', 'পরপর তিনটি সঠিক হলে কম্বো গুণক শুরু হয়।'],
  ['Leaving a started match costs coins and XP.', 'ম্যাচ শুরুর পর ছেড়ে দিলে কয়েন ও XP কাটা যায়।'],
  ['Win ranked battles to climb to the next league.', 'র‍্যাংকড ব্যাটল জিতে পরের লীগে উঠুন।'],
  ['Every answer has an explanation in the match review.', 'ম্যাচ রিভিউতে প্রতিটি উত্তরের ব্যাখ্যা আছে।'],
];

export default function Matchmaking() {
  const t = useT();
  const lang = useLang();
  const [params] = useSearchParams();
  const mode = (params.get('mode') ?? 'duel') as ModeKey;
  const ranked = params.get('ranked') === '1';
  const categoryId = params.get('category') ? Number(params.get('category')) : null;
  const user = useAuth((s) => s.user)!;
  const conn = useConn((s) => s.status);
  const nav = useNavigate();
  const [elapsed, setElapsed] = useState(0);
  const [tip, setTip] = useState(0);
  const [aiOffer, setAiOffer] = useState<AiLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const joined = useRef(false);

  useEffect(() => {
    if (conn !== 'connected' || joined.current) return;
    joined.current = true;
    useGame.getState().reset();
    emit('mm:join', { mode, ranked, categoryId }).catch((e) => setError(friendlyError(e)));
    const s = getSocket()!;
    const onStatus = (p: { elapsedSec: number }) => setElapsed(p.elapsedSec);
    const onOffer = (p: { level: AiLevel }) => {
      setAiOffer(p.level);
      haptic('tap');
      sfx('notify');
    };
    const onTimeout = () => setTimedOut(true);
    s.on('mm:status', onStatus);
    s.on('mm:ai_offer', onOffer);
    s.on('mm:timeout', onTimeout);
    const id = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => {
      clearInterval(id);
      s.off('mm:status', onStatus);
      s.off('mm:ai_offer', onOffer);
      s.off('mm:timeout', onTimeout);
    };
  }, [conn, mode, ranked, categoryId]);

  useEffect(() => {
    const id = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 4500);
    return () => clearInterval(id);
  }, []);

  // Leaving the screen cancels the search (unless a match was found).
  useEffect(() => () => void (useGame.getState().matchId ? undefined : emit('mm:leave').catch(() => undefined)), []);

  const acceptAi = async () => {
    try {
      const r = await emit('mm:accept_ai', { level: aiOffer ?? 'normal' });
      useGame.getState().reset(r.matchId);
      sfx('start');
      nav(`/match/${r.matchId}`, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const cancel = () => {
    haptic('tap');
    void emit('mm:leave').catch(() => undefined);
    if (history.length > 1) nav(-1);
    else nav('/', { replace: true });
  };

  const mm = `${num(Math.floor(elapsed / 60), lang)}:${num(String(elapsed % 60).padStart(2, '0'), lang)}`;
  return (
    <div className="stage-dark">
      <div className="mm-stage">
        <span className="chip on-dark"><Icon name={modeIcon(mode)} /> {modeLabel(mode)} · {ranked ? t('Ranked', 'র‍্যাংকড') : t('Casual', 'সাধারণ')}</span>
        <div className="radar" aria-hidden>
          <span className="sweep" />
          <span className="orbit o1"><Icon name="user" size={18} /></span>
          <span className="orbit o2"><Icon name="user" size={18} /></span>
          <span className="orbit o3"><Icon name="user" size={18} /></span>
          <Avatar name={user.username} src={user.avatarThumbUrl ?? user.avatarUrl} size={92} frame={user.frame} />
        </div>
        {timedOut ? (
          <>
            <h1>{t('No opponent found', 'কোনো প্রতিপক্ষ পাওয়া যায়নি')}</h1>
            <p className="dim">{t('Not many players in your range right now.', 'এই মুহূর্তে আপনার লেভেলের প্লেয়ার কম।')}</p>
            <button className="btn white lg" onClick={() => location.reload()}><Icon name="refresh" /> {t('Search again', 'আবার খুঁজুন')}</button>
          </>
        ) : (
          <>
            <h1 aria-live="polite">{t('Finding an opponent…', 'প্রতিপক্ষ খোঁজা হচ্ছে…')}</h1>
            <p className="dim row gap-sm" style={{ justifyContent: 'center' }}>
              <Icon name="timer" size={16} /> <span className="num">{mm}</span> · <LeagueBadge rating={user.rating} />
            </p>
          </>
        )}
        {aiOffer && !timedOut && (
          <div className="mm-ai card">
            <div className="row">
              <IconTile name="bot" tone="cyan" size={44} anim="float" />
              <div className="grow" style={{ textAlign: 'left' }}>
                <b>{t('No match yet — play vs AI?', 'এখনো কাউকে পাওয়া যায়নি — AI-এর সাথে খেলবেন?')}</b>
                <p className="xs muted">{t('AI battles are unranked and clearly marked in your history.', 'AI ব্যাটল র‍্যাংকড নয় এবং হিস্টোরিতে আলাদা করে দেখানো হয়।')}</p>
              </div>
            </div>
            <div className="row mt">
              <button className="btn ghost" onClick={() => setAiOffer(null)}>{t('Keep waiting', 'অপেক্ষা করি')}</button>
              <button className="btn accent grow" onClick={() => void acceptAi()}><Icon name="bot" /> {t('Play vs AI', 'AI-এর সাথে খেলুন')}</button>
            </div>
          </div>
        )}
        {error && <p className="form-error" role="alert"><Icon name="alert-circle" size={18} /> {error}</p>}
        <p className="mm-tip" key={tip}><Icon name="bulb" size={16} /> {t(...TIPS[tip])}</p>
        <button className="btn outline-dark" onClick={cancel}><Icon name="close" /> {t('Cancel', 'বাতিল করুন')}</button>
      </div>
    </div>
  );
}
