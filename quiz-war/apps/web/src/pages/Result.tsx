import { InAppReview } from '@capacitor-community/in-app-review';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { MODES, type MatchEndPayload, type MatchPlayerView } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Confetti } from '../components/Confetti';
import { CountUp, Empty } from '../components/Feedback';
import { useLeagues } from '../components/Game';
import { Icon, IconTile, achievementIcon, type IconName } from '../components/Icon';
import { LeagueEmblem, RankMedal } from '../components/LeagueEmblem';
import { DIFFICULTY_INFO } from '../components/MatchOptions';
import { useConfig } from '../hooks/queries';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { num, useLang, useT } from '../lib/i18n';
import { modeIcon, modeLabel } from '../lib/labels';
import { haptic, isNative, PUBLIC_WEB_URL } from '../lib/platform';
import { profileLink } from '../lib/qr';
import { useSettings } from '../lib/settings';
import { renderResultCard, type CardPlayer } from '../lib/shareCard';
import { saveImage, shareImage } from '../lib/shareImage';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

type Outcome = 'win' | 'loss' | 'draw' | 'solo';

/** Distinct vibration "signatures": a rising triple pulse for a win, one long soft buzz for a loss. */
function resultVibration(outcome: Outcome) {
  if (!useSettings.getState().haptics) return;
  const pattern = outcome === 'win' ? [40, 60, 40, 60, 120] : outcome === 'loss' ? [220] : [30, 70, 60];
  if (isNative) {
    const styles = outcome === 'win' ? [ImpactStyle.Light, ImpactStyle.Medium, ImpactStyle.Heavy] : outcome === 'loss' ? [ImpactStyle.Heavy] : [ImpactStyle.Light, ImpactStyle.Medium];
    styles.forEach((style, i) => setTimeout(() => void Haptics.impact({ style }).catch(() => undefined), i * 110));
    if (outcome === 'loss') void Haptics.vibrate({ duration: 220 }).catch(() => undefined);
  } else if ('vibrate' in navigator) navigator.vibrate(pattern);
}

const HERO_ICON: Record<Outcome, IconName> = { win: 'trophy', loss: 'shield', draw: 'handshake', solo: 'target' };

function HeroEmblem({ outcome }: { outcome: Outcome }) {
  return (
    <div className={`rh-emblem ${outcome}`} aria-hidden>
      <svg className="rh-rays" viewBox="0 0 200 200">
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} d="M100 100 L94 0 L106 0 Z" transform={`rotate(${i * 22.5} 100 100)`} />
        ))}
      </svg>
      <svg className="rh-ring" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" pathLength={100} />
      </svg>
      <span className="rh-core">
        <Icon name={HERO_ICON[outcome]} size={64} strokeWidth={1.7} />
      </span>
      {outcome === 'win' && (
        <>
          <Icon name="sparkles" size={22} className="rh-spark s1" />
          <Icon name="star" size={16} className="rh-spark s2" />
          <Icon name="sparkles" size={18} className="rh-spark s3" />
        </>
      )}
    </div>
  );
}

export default function Result() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const t = useT();
  const lang = useLang();
  const me = useAuth((s) => s.user)!;
  const leagues = useLeagues();
  const config = useConfig();
  const local = useGame((s) => (s.end?.matchId === id ? s.end : null));
  const snap = useGame((s) => (s.snapshot?.matchId === id ? s.snapshot : null));
  const remote = useQuery({ queryKey: ['result', id], queryFn: () => api<{ result: MatchEndPayload; snapshot: any }>(`/matches/${id}/result`), enabled: !local, retry: false });
  const end = local ?? remote.data?.result ?? null;
  const players: MatchPlayerView[] = snap?.players ?? remote.data?.snapshot?.players ?? [];

  const mine = end?.players.find((p) => p.userId === me.id);
  const solo = end ? MODES[end.mode].kind === 'solo' : false;
  const outcome: Outcome = !end || !mine ? 'draw' : solo ? 'solo' : end.winnerTeam === null ? 'draw' : end.winnerTeam === mine.team ? 'win' : 'loss';
  const leagueUp = useMemo(() => {
    if (!mine?.leagueAfter || !mine.leagueBefore || mine.leagueAfter === mine.leagueBefore) return null;
    const a = leagues.findIndex((l) => l.key === mine.leagueAfter);
    const b = leagues.findIndex((l) => l.key === mine.leagueBefore);
    return a > b ? leagues[a] : null;
  }, [mine, leagues]);

  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const announced = useRef(false);

  // Sound + vibration + rate prompt, once per result.
  useEffect(() => {
    if (!end || announced.current) return;
    announced.current = true;
    if (outcome === 'win' || leagueUp) sfx(leagueUp ? 'rankup' : 'victory');
    else if (outcome === 'loss') sfx('defeat');
    else sfx('reward');
    resultVibration(outcome);
    if (outcome === 'win' && isNative) {
      const s = useSettings.getState();
      if (s.rateCounter >= 0) {
        const n = s.rateCounter + 1;
        const after = config.data?.ratePromptAfterWins ?? 5;
        if (after > 0 && n >= after) {
          s.set({ rateCounter: -1 });
          setTimeout(() => void InAppReview.requestReview().catch(() => undefined), 2600);
        } else s.set({ rateCounter: n });
      }
    }
  }, [end, outcome, leagueUp, config.data]);

  useEffect(() => () => useGame.getState().reset(), []);

  const title = !end
    ? ''
    : {
        win: t('VICTORY!', 'বিজয়!'),
        loss: t('DEFEAT', 'পরাজয়'),
        draw: t('DRAW', 'ড্র'),
        solo: end.reason === 'wrong_answer' ? t('RUN OVER', 'খেলা শেষ') : end.reason === 'time_up' ? t("TIME'S UP", 'সময় শেষ') : t('COMPLETE', 'সম্পন্ন'),
      }[outcome];
  const sub = !end
    ? ''
    : end.reason === 'forfeit'
      ? outcome === 'win'
        ? t('Your opponent left the match', 'প্রতিপক্ষ ম্যাচ ছেড়ে চলে গেছে')
        : t('You left the match', 'আপনি ম্যাচ ছেড়ে দিয়েছেন')
      : end.reason === 'aborted'
        ? t('Match ended early', 'ম্যাচ আগেই শেষ হয়েছে')
        : outcome === 'win'
          ? t('Brilliant! You beat them all.', 'দারুণ! আপনি সবাইকে হারিয়েছেন।')
          : outcome === 'loss'
            ? t('So close — learn and come back stronger.', 'অল্পের জন্য — রিভিউ করে আবার চেষ্টা করুন।')
            : outcome === 'draw'
              ? t('An even fight!', 'সমানে সমান লড়াই!')
              : t(`${mine?.correct ?? 0} correct · best combo ${mine?.bestCombo ?? 0}`, `${num(mine?.correct ?? 0, lang)}টি সঠিক · সেরা কম্বো ${num(mine?.bestCombo ?? 0, lang)}`);

  const view = (uid: number) => players.find((p) => p.userId === uid);
  const nameOf = (uid: number, isBot: boolean) => view(uid)?.username ?? (isBot ? t('AI player', 'এআই প্লেয়ার') : t('Player', 'প্লেয়ার'));

  const snapInfo: any = snap ?? remote.data?.snapshot ?? null;
  /** Facts for the share card and share text: category, questions, accuracy, difficulty. */
  const cardDetails = () => {
    if (!end) return [];
    const out: { label: string; value: string }[] = [];
    out.push({ label: t('Category', 'ক্যাটাগরি'), value: snapInfo?.category?.name ?? t('Mixed', 'মিশ্র') });
    const total = mine?.answered ?? 0;
    out.push({ label: t('Questions', 'প্রশ্ন'), value: num(snapInfo?.questionCount ?? total, lang) });
    if (total > 0) out.push({ label: t('Accuracy', 'সঠিকতা'), value: `${num(Math.round(((mine?.correct ?? 0) / total) * 100), lang)}%` });
    const diff = snapInfo?.difficulty as keyof typeof DIFFICULTY_INFO | null | undefined;
    if (diff) out.push({ label: t('Difficulty', 'কঠিনতা'), value: t(DIFFICULTY_INFO[diff].en, DIFFICULTY_INFO[diff].bn) });
    else if (mine?.avgResponseMs) out.push({ label: t('Avg. time', 'গড় সময়'), value: `${num((mine.avgResponseMs / 1000).toFixed(1), lang)}${t('s', ' সে')}` });
    return out;
  };
  // Build the branded share card in the background as soon as the result is known.
  useEffect(() => {
    if (!end) return;
    let alive = true;
    let url = '';
    const cardPlayers: CardPlayer[] = end.players.map((p) => {
      const v = view(p.userId);
      return {
        name: nameOf(p.userId, p.isBot),
        uid: p.userId === me.id ? me.uid : (v?.uid ?? null),
        avatarUrl: p.userId === me.id ? me.avatarUrl : (v?.avatarUrl ?? null),
        score: p.score,
        correct: p.correct,
        answered: p.answered,
        team: p.team,
        isBot: p.isBot,
        isMe: p.userId === me.id,
      };
    });
    const date = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
    void renderResultCard({
      lang,
      outcome,
      headline: title,
      subline: `${modeLabel(end.mode)}${end.type === 'ai' ? ` · ${t('vs AI', 'এআই-এর সাথে')}` : end.ranked ? ` · ${t('Ranked', 'র‍্যাংকড')}` : ''}`,
      details: cardDetails(),
      date,
      teamScores: end.teamScores,
      teams: MODES[end.mode].teams,
      myTeam: mine?.team ?? 0,
      winnerTeam: end.winnerTeam,
      players: cardPlayers,
      appUrl: PUBLIC_WEB_URL,
      profileUrl: profileLink(me.uid),
      ctaText: t(`Challenge me! UID ${me.uid}`, `আমাকে চ্যালেঞ্জ করুন! UID ${me.uid}`),
      labels: { correct: t('correct', 'সঠিক'), points: t('points', 'পয়েন্ট'), teamBlue: t('Blue team', 'নীল দল'), teamRed: t('Opponent', 'প্রতিপক্ষ'), you: t('You', 'আপনি'), ai: t('AI player', 'এআই প্লেয়ার') },
    }).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setCard({ blob, url });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end, lang, players.length]);

  if (!end) {
    if (remote.isLoading) return <div className="page full"><div className="mm-stage"><span className="spinner" /></div></div>;
    return (
      <div className="page full">
        <Empty icon="chart" title={t('Result not available', 'ফলাফল পাওয়া যায়নি')} action={<Link className="btn primary" to="/"><Icon name="home" /> {t('Home', 'হোম')}</Link>} />
      </div>
    );
  }

  const ratingDelta = mine?.ratingAfter != null && mine.ratingBefore != null ? mine.ratingAfter - mine.ratingBefore : null;
  const fileName = `quizwar-result-${id.slice(0, 8)}.png`;
  const factsLine = cardDetails().map((f) => `${f.label}: ${f.value}`).join(' · ');
  const headline =
    outcome === 'win'
      ? t(`I won a ${modeLabel(end.mode)} battle on QUIZ WAR Bangladesh with ${mine?.score ?? 0} points!`, `QUIZ WAR Bangladesh-এ ${modeLabel(end.mode)} ব্যাটলে ${num(mine?.score ?? 0)} পয়েন্ট নিয়ে জিতেছি!`)
      : t(`I scored ${mine?.score ?? 0} points in ${modeLabel(end.mode)} on QUIZ WAR Bangladesh.`, `QUIZ WAR Bangladesh-এ ${modeLabel(end.mode)}-এ ${num(mine?.score ?? 0)} পয়েন্ট পেয়েছি।`);
  const shareText = [
    headline,
    factsLine,
    outcome === 'win' ? t('Can you beat me?', 'পারলে আমাকে হারাও!') : t('Play with me!', 'আমার সাথে খেলো!'),
    `UID: ${me.uid}`,
    '#QuizWarBangladesh #QUIZWAR',
  ]
    .filter(Boolean)
    .join('\n');

  const doShare = async () => {
    haptic('tap');
    setBusy('share');
    const r = await shareImage(card?.blob ?? null, { title: 'QUIZ WAR Bangladesh', text: shareText, url: profileLink(me.uid), fileName });
    setBusy(null);
    if (r === 'copied') toast.success(t('Copied to clipboard', 'ক্লিপবোর্ডে কপি হয়েছে'), t('Paste it anywhere to share.', 'যেকোনো জায়গায় পেস্ট করে শেয়ার করুন।'), 'copy');
    else if (r === 'failed') toast.error(t('Could not share', 'শেয়ার করা যায়নি'));
  };
  const doSave = async () => {
    if (!card) return;
    haptic('tap');
    setBusy('save');
    const r = await saveImage(card.blob, fileName);
    setBusy(null);
    if (r === 'failed') toast.error(t('Could not save', 'সেভ করা যায়নি'));
    else {
      haptic('success');
      toast.success(r === 'saved' ? t('Saved to gallery', 'গ্যালারিতে সেভ হয়েছে') : t('Image downloaded', 'ছবি ডাউনলোড হয়েছে'), r === 'saved' ? t('Find it in Pictures › QUIZ WAR', 'Pictures › QUIZ WAR ফোল্ডারে পাবেন') : undefined, 'image');
    }
  };

  const again = () => {
    if (end.type === 'ai') return nav('/battle#ai');
    if (end.mode === 'daily') return nav('/rank?tab=daily');
    if (solo) return nav(`/battle#${end.mode}`);
    nav(`/matchmaking?mode=${end.mode}&ranked=${end.ranked ? 1 : 0}`, { replace: true });
  };

  const ranked = [...end.players].sort((a, b) => b.score - a.score);
  const teams = MODES[end.mode].teams;

  return (
    <div className="page full stack result-page">
      {(outcome === 'win' || leagueUp) && <Confetti colors={['#facc15', '#f59e0b', '#22d3ee', '#16a34a', '#f42a41', '#ffffff']} />}
      <section className={`result-hero ${outcome}`}>
        <span className="rh-mode chip"><Icon name={modeIcon(end.mode, end.type)} size={14} /> {modeLabel(end.mode)}{end.ranked ? ` · ${t('Ranked', 'র‍্যাংকড')}` : ''}</span>
        <HeroEmblem outcome={outcome} />
        <h1>{title}</h1>
        <p>{sub}</p>
        {teams > 1 && (() => {
          const myTeam = mine?.team ?? 0;
          const best = (team: number) => [...end.players].filter((p) => p.team === team).sort((a, b) => b.score - a.score)[0];
          const meP = mine ?? best(myTeam);
          const opp = best(myTeam === 0 ? 1 : 0);
          const side = (p: typeof meP | undefined, team: number, mineSide: boolean) => {
            const v = p ? view(p.userId) : undefined;
            const won = end.winnerTeam === team;
            return (
              <div className={`vs-side ${won ? 'won' : ''} ${mineSide ? 'me' : 'opp'}`}>
                <span className="vs-ava">
                  {won && <Icon name="crown" size={26} className="vs-crown" />}
                  <Avatar name={p ? nameOf(p.userId, p.isBot) : '?'} src={p && p.userId === me.id ? me.avatarUrl : v?.avatarUrl} size={64} bot={p?.isBot} />
                </span>
                <b className="ellipsis">{mineSide ? t('You', 'আপনি') : p ? nameOf(p.userId, p.isBot) : t('Opponent', 'প্রতিপক্ষ')}{MODES[end.mode].teamSize > 1 ? ` +${num(MODES[end.mode].teamSize - 1, lang)}` : ''}</b>
                <span className="vs-pts num"><CountUp value={end.teamScores[team] ?? 0} /></span>
              </div>
            );
          };
          return (
            <div className="rh-versus" aria-label={t('Team score', 'দলের স্কোর')}>
              {side(meP, myTeam, true)}
              <span className="vs-mid">VS</span>
              {side(opp, myTeam === 0 ? 1 : 0, false)}
            </div>
          );
        })()}
        <div className="gain-row">
          <div className="gain"><Icon name="xp" size={22} /><b>+<CountUp value={mine?.xpGained ?? 0} /></b><span>XP</span></div>
          <div className="gain"><Icon name="coin" size={22} /><b>+<CountUp value={mine?.coinsGained ?? 0} /></b><span>{t('Coins', 'কয়েন')}</span></div>
          <div className="gain">
            <Icon name={ratingDelta == null ? 'target' : 'chart'} size={22} />
            <b>{ratingDelta == null ? <CountUp value={mine?.score ?? 0} /> : `${ratingDelta >= 0 ? '+' : '−'}${num(Math.abs(ratingDelta), lang)}`}</b>
            <span>{ratingDelta == null ? t('Score', 'স্কোর') : t('Rating', 'রেটিং')}</span>
          </div>
        </div>
      </section>

      {!!mine?.penaltyCoins || !!mine?.penaltyXp ? (
        <div className="penalty-box" role="status">
          <IconTile name="alert" tone="danger" size={40} />
          <div>
            <strong>{t('Penalty for leaving the match', 'ম্যাচ ছেড়ে যাওয়ার জরিমানা')}</strong>
            <div className="pb-amounts">
              {!!mine.penaltyCoins && <span><Icon name="coin" size={16} /> −{num(mine.penaltyCoins, lang)}</span>}
              {!!mine.penaltyXp && <span><Icon name="xp" size={16} /> −{num(mine.penaltyXp, lang)} XP</span>}
            </div>
          </div>
        </div>
      ) : null}
      {!!mine?.bonusCoins && (
        <div className="bonus-box" role="status">
          <IconTile name="gift" tone="success" size={40} />
          <span>{t('Your opponent left, so their penalty is yours:', 'প্রতিপক্ষ ম্যাচ ছেড়ে যাওয়ায় তার জরিমানা আপনি পেয়েছেন:')} <b className="coin-text"><Icon name="coin" size={16} /> {num(mine.bonusCoins, lang)}</b></span>
        </div>
      )}
      {leagueUp && (
        <div className="rank-up" role="status">
          <span className="ru-icon"><LeagueEmblem league={leagueUp.key} size={72} /></span>
          <b>{t('RANK UP!', 'র‍্যাংক আপ!')}</b> {t(`Welcome to ${leagueUp.name} league`, `${leagueUp.name} লীগে স্বাগতম`)}
        </div>
      )}
      {mine && mine.levelAfter > mine.levelBefore && (
        <div className="card row unlock-card">
          <IconTile name="star" tone="coin" size={44} anim="pop" />
          <div><b>{t('Level up!', 'লেভেল আপ!')}</b><p className="small muted">{t(`You reached level ${mine.levelAfter}`, `আপনি লেভেল ${num(mine.levelAfter, lang)}-এ পৌঁছেছেন`)}</p></div>
        </div>
      )}
      {mine?.achievements.map((a) => (
        <div key={a.key} className="card row unlock-card">
          <IconTile name={achievementIcon(a)} tone="primary" size={44} anim="pop" />
          <div><b>{t('Achievement unlocked', 'অ্যাচিভমেন্ট আনলক')}</b><p className="small muted">{a.name}</p></div>
        </div>
      ))}

      <section className="card">
        <h3 className="mb row gap-sm"><Icon name="list" size={18} /> {t('Scoreboard', 'স্কোরবোর্ড')}</h3>
        {ranked.map((p, i) => {
          const v = view(p.userId);
          return (
            <div key={p.userId} className={`lb-row ${p.userId === me.id ? 'me' : ''} ${teams > 1 ? `team-${p.team}` : ''}`}>
              <span className="lb-rank">{i < 3 ? <RankMedal rank={i + 1} size={30} /> : <b className="num">{num(i + 1, lang)}</b>}</span>
              <Avatar name={nameOf(p.userId, p.isBot)} src={p.userId === me.id ? me.avatarUrl : v?.avatarUrl} size={40} bot={p.isBot} />
              <div className="grow">
                <b className="ellipsis">
                  {nameOf(p.userId, p.isBot)}
                  {p.userId === me.id && <span className="chip primary xs-chip">{t('You', 'আপনি')}</span>}
                  {p.isBot && <span className="chip xs-chip"><Icon name="bot" size={12} /> AI</span>}
                </b>
                <p className="xs muted">
                  {!p.isBot && (p.userId === me.id ? me.uid : v?.uid) ? `${p.userId === me.id ? me.uid : v?.uid} · ` : ''}
                  {t(`${p.correct}/${p.answered} correct`, `${num(p.correct, lang)}/${num(p.answered, lang)} সঠিক`)}
                  {p.avgResponseMs ? ` · ${num((p.avgResponseMs / 1000).toFixed(1), lang)}${t('s', ' সে')}` : ''}
                </p>
              </div>
              <b className="num lb-score">{num(p.score, lang)}</b>
            </div>
          );
        })}
      </section>

      <section className="card share-panel">
        <div className="sp-head">
          <IconTile name="image" tone="primary" size={40} />
          <div>
            <b>{t('Your result card', 'আপনার রেজাল্ট কার্ড')}</b>
            <p className="xs muted">{t('Share it with friends or keep it in your gallery.', 'বন্ধুদের সাথে শেয়ার করুন বা গ্যালারিতে রেখে দিন।')}</p>
          </div>
        </div>
        <div className="sp-preview">{card ? <img src={card.url} alt={t('Result card preview', 'রেজাল্ট কার্ডের প্রিভিউ')} /> : <span className="spinner" />}</div>
        <div className="row">
          <button className="btn primary grow share-btn" disabled={busy !== null} onClick={() => void doShare()}>
            {busy === 'share' ? <span className="spinner" /> : <Icon name="share" />} {t('Share', 'শেয়ার করুন')}
          </button>
          <button className="btn soft grow" disabled={!card || busy !== null} onClick={() => void doSave()}>
            {busy === 'save' ? <span className="spinner" /> : <Icon name="download" />} {isNative ? t('Save to gallery', 'গ্যালারিতে সেভ') : t('Download', 'ডাউনলোড')}
          </button>
        </div>
      </section>

      <div className="row">
        <button className="btn primary lg grow" onClick={again}>
          <Icon name="refresh" /> {solo || end.type === 'ai' ? t('Play again', 'আবার খেলুন') : t('Rematch', 'আবার লড়াই')}
        </button>
      </div>
      <div className="row">
        <Link to={`/review/${id}`} className="btn outline grow"><Icon name="book-check" /> {t('Review answers', 'উত্তর দেখুন')}</Link>
        <button className="btn ghost grow" onClick={() => nav('/', { replace: true })}><Icon name="home" /> {t('Home', 'হোম')}</button>
      </div>
    </div>
  );
}
