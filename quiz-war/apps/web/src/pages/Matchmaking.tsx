import { MODES, type AiLevel, type ModeKey } from '@quizwar/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { LeagueBadge } from '../components/Game';
import { friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { emit, getSocket, useConn } from '../lib/socket';
import { haptic } from '../lib/platform';
import { sfx } from '../lib/sound';

export default function Matchmaking() {
  const [params] = useSearchParams();
  const mode = (params.get('mode') ?? 'duel') as ModeKey;
  const ranked = params.get('ranked') === '1';
  const categoryId = params.get('category') ? Number(params.get('category')) : null;
  const user = useAuth((s) => s.user)!;
  const conn = useConn((s) => s.status);
  const nav = useNavigate();
  const [elapsed, setElapsed] = useState(0);
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
    };
    const onTimeout = () => setTimedOut(true);
    s.on('mm:status', onStatus);
    s.on('mm:ai_offer', onOffer);
    s.on('mm:timeout', onTimeout);
    const t = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => {
      clearInterval(t);
      s.off('mm:status', onStatus);
      s.off('mm:ai_offer', onOffer);
      s.off('mm:timeout', onTimeout);
    };
  }, [conn, mode, ranked, categoryId]);

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
    void emit('mm:leave').catch(() => undefined);
    nav(-1);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0') + ':' + String(elapsed % 60).padStart(2, '0');
  return (
    <div className="page full">
      <div className="mm-stage">
        <span className="chip primary">{MODES[mode].label} · {ranked ? 'Ranked' : 'Casual'}</span>
        <div className="radar" aria-hidden>
          <span className="sweep" />
          <Avatar name={user.username} src={user.avatarThumbUrl ?? user.avatarUrl} size={88} frame={user.frame} />
        </div>
        {timedOut ? (
          <>
            <h1>No opponent found</h1>
            <p className="muted">Not many players in your range right now.</p>
            <button className="btn primary lg" onClick={() => location.reload()}>Search again</button>
          </>
        ) : (
          <>
            <h1 aria-live="polite">Finding opponent…</h1>
            <p className="muted num">{mm} · <LeagueBadge rating={user.rating} /></p>
          </>
        )}
        {aiOffer && !timedOut && (
          <div className="card" style={{ width: '100%', maxWidth: 380, animation: 'pop-in .3s' }}>
            <p className="bold">🤖 No match yet — play vs AI?</p>
            <p className="xs muted">AI battles are unranked and clearly marked in your history.</p>
            <div className="row mt">
              <button className="btn accent grow" onClick={() => void acceptAi()}>Play vs AI</button>
              <button className="btn ghost" onClick={() => setAiOffer(null)}>Keep waiting</button>
            </div>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn outline" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}
