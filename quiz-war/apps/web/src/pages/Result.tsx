import { MODES, type MatchEndPayload } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Confetti } from '../components/Confetti';
import { CountUp, Empty } from '../components/Feedback';
import { useLeagues } from '../components/Game';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { haptic, isNative, PUBLIC_WEB_URL, share } from '../lib/platform';
import { profileLink } from '../lib/qr';
import { shareWithCard } from '../lib/shareCard';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

export default function Result() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const me = useAuth((s) => s.user)!;
  const leagues = useLeagues();
  const local = useGame((s) => (s.end?.matchId === id ? s.end : null));
  const snap = useGame((s) => (s.snapshot?.matchId === id ? s.snapshot : null));
  const remote = useQuery({ queryKey: ['result', id], queryFn: () => api<{ result: MatchEndPayload; snapshot: any }>(`/matches/${id}/result`), enabled: !local, retry: false });
  const end = local ?? remote.data?.result ?? null;
  const players = snap?.players ?? remote.data?.snapshot?.players ?? [];

  const mine = end?.players.find((p) => p.userId === me.id);
  const solo = end ? MODES[end.mode].kind === 'solo' : false;
  const outcome = !end || !mine ? 'draw' : solo ? 'solo' : end.winnerTeam === null ? 'draw' : end.winnerTeam === mine.team ? 'win' : 'loss';
  const leagueUp = useMemo(() => {
    if (!mine?.leagueAfter || !mine.leagueBefore || mine.leagueAfter === mine.leagueBefore) return null;
    const a = leagues.findIndex((l) => l.key === mine.leagueAfter);
    const b = leagues.findIndex((l) => l.key === mine.leagueBefore);
    return a > b ? leagues[a] : null;
  }, [mine, leagues]);

  useEffect(() => {
    if (!end) return;
    if (outcome === 'win' || leagueUp) {
      sfx(leagueUp ? 'rankup' : 'victory');
      haptic('success');
    } else if (outcome === 'loss') sfx('defeat');
    else sfx('reward');
  }, [end, outcome, leagueUp]);

  useEffect(() => () => useGame.getState().reset(), []);

  if (!end) {
    if (remote.isLoading) return <div className="page full"><div className="mm-stage"><span className="spinner" /></div></div>;
    return <div className="page full"><Empty icon="📊" title="Result not available" action={<Link className="btn primary" to="/">Home</Link>} /></div>;
  }

  const title = { win: 'VICTORY!', loss: 'DEFEAT', draw: 'DRAW', solo: end.reason === 'wrong_answer' ? 'RUN OVER' : end.reason === 'time_up' ? "TIME'S UP" : 'COMPLETE' }[outcome];
  const emoji = { win: '🏆', loss: '🛡️', draw: '🤝', solo: '🎯' }[outcome];
  const ratingDelta = mine?.ratingAfter != null && mine.ratingBefore != null ? mine.ratingAfter - mine.ratingBefore : null;
  const nameOf = (uid: number) => players.find((p: any) => p.userId === uid)?.username ?? (uid < 0 ? '🤖 AI' : 'Player');

  const doShare = async () => {
    const text =
      outcome === 'win'
        ? `🏆 I won a ${MODES[end.mode].label} battle on QUIZ WAR with ${mine?.score} points! Can you beat me? My UID: ${me.uid}`
        : `🎯 I scored ${mine?.score} points (${mine?.correct} correct) in ${MODES[end.mode].label} on QUIZ WAR! My UID: ${me.uid}`;
    const url = profileLink(me.uid);
    if (isNative) return void share({ title: 'QUIZ WAR', text, url });
    const r = await shareWithCard({ title: title!, subtitle: `${me.username} · ${MODES[end.mode].label}`, big: `${mine?.score ?? 0} pts`, footer: `${PUBLIC_WEB_URL.replace(/^https?:\/\//, '')}/u/${me.uid}`, accent: outcome === 'win' ? '#16a34a' : undefined }, text, url);
    if (r === 'copied') toast.success('Copied to clipboard', 'Paste it anywhere to share.');
  };

  const again = () => {
    if (end.type === 'ai') return nav('/battle#ai');
    if (end.mode === 'daily') return nav('/rank?tab=daily');
    if (solo) return nav(`/battle#${end.mode}`);
    nav(`/matchmaking?mode=${end.mode}&ranked=${end.ranked ? 1 : 0}`, { replace: true });
  };

  return (
    <div className="page full stack">
      {(outcome === 'win' || leagueUp) && <Confetti />}
      <section className={`result-hero ${outcome}`}>
        <div className="r-emoji" aria-hidden>{emoji}</div>
        <h1>{title}</h1>
        <p>{end.reason === 'forfeit' ? (outcome === 'win' ? 'Your opponent left the match' : 'You left the match') : solo ? `${mine?.correct ?? 0} correct · best combo ${mine?.bestCombo ?? 0}` : `${end.teamScores.join(' — ')}`}</p>
        <div className="gain-row">
          <div className="gain"><b>+<CountUp value={mine?.xpGained ?? 0} /></b><span>XP</span></div>
          <div className="gain"><b>🪙 +<CountUp value={mine?.coinsGained ?? 0} /></b><span>Coins</span></div>
          <div className="gain"><b>{ratingDelta == null ? <CountUp value={mine?.score ?? 0} /> : `${ratingDelta >= 0 ? '+' : ''}${ratingDelta}`}</b><span>{ratingDelta == null ? 'Score' : 'Rating'}</span></div>
        </div>
      </section>

      {!!mine?.penaltyCoins || !!mine?.penaltyXp ? (
        <div className="penalty-box" role="status">
          <span className="pb-icon" aria-hidden>⚠️</span>
          <div><strong>ম্যাচ ছেড়ে যাওয়ার জরিমানা</strong><div className="pb-amounts">{!!mine.penaltyCoins && <span>🪙 −{mine.penaltyCoins}</span>}{!!mine.penaltyXp && <span>⭐ −{mine.penaltyXp} XP</span>}</div></div>
        </div>
      ) : null}
      {!!mine?.bonusCoins && (
        <div className="bonus-box" role="status"><span aria-hidden>🎁</span> প্রতিপক্ষ ম্যাচ ছেড়ে যাওয়ায় তার জরিমানার <b>🪙 {mine.bonusCoins}</b> কয়েন আপনি পেয়েছেন!</div>
      )}
      {leagueUp && (
        <div className="rank-up" role="status">
          <span className="ru-icon">{leagueUp.icon}</span>
          RANK UP! Welcome to {leagueUp.name} League
        </div>
      )}
      {mine && mine.levelAfter > mine.levelBefore && <div className="card center bold" style={{ animation: 'pop-in .4s' }}>⭐ Level Up! You reached Level {mine.levelAfter}</div>}
      {mine?.achievements.map((a) => (
        <div key={a.key} className="card row" style={{ animation: 'pop-in .4s' }}><span style={{ fontSize: 30 }}>{a.icon}</span><div><b>Achievement unlocked</b><p className="small muted">{a.name}</p></div></div>
      ))}

      <section className="card">
        <h3 className="mb">Scoreboard</h3>
        {[...end.players].sort((a, b) => b.score - a.score).map((p) => (
          <div key={p.userId} className={`lb-row ${p.userId === me.id ? 'me' : ''}`}>
            <Avatar name={nameOf(p.userId)} src={players.find((x: any) => x.userId === p.userId)?.avatarUrl} size={36} bot={p.isBot} />
            <div className="grow">
              <b className="ellipsis">{nameOf(p.userId)}{p.isBot && <span className="chip" style={{ marginLeft: 6 }}>AI</span>}</b>
              <p className="xs muted">{p.correct}/{p.answered} correct · combo {p.bestCombo}{p.avgResponseMs ? ` · ${(p.avgResponseMs / 1000).toFixed(1)}s avg` : ''}</p>
            </div>
            <b className="num">{p.score}</b>
          </div>
        ))}
      </section>

      <div className="row">
        <button className="btn primary lg grow" onClick={again}>{solo || end.type === 'ai' ? 'Play again' : 'Rematch'}</button>
        <button className="btn soft lg" onClick={() => void doShare()} aria-label="Share result"><Icon name="share" /></button>
      </div>
      <div className="row">
        <Link to={`/review/${id}`} className="btn outline grow">📘 Review answers</Link>
        <button className="btn ghost grow" onClick={() => nav('/', { replace: true })}>Home</button>
      </div>
    </div>
  );
}
