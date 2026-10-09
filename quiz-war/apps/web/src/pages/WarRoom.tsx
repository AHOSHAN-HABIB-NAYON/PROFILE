import { MODES } from '@quizwar/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Avatar } from '../components/Avatar';
import { Empty } from '../components/Feedback';
import { categoryIcon, Icon } from '../components/Icon';
import { DIFFICULTY_INFO } from '../components/MatchOptions';
import { friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { num, useLang, useT } from '../lib/i18n';
import { modeIcon, modeLabel } from '../lib/labels';
import { haptic, PUBLIC_WEB_URL, share } from '../lib/platform';
import { emit, useConn } from '../lib/socket';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

export default function WarRoom() {
  const t = useT();
  const lang = useLang();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const me = useAuth((s) => s.user)!;
  const conn = useConn((s) => s.status);
  const snap = useGame((s) => (s.matchId === id ? s.snapshot : null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (conn !== 'connected') return;
    if (useGame.getState().matchId !== id) useGame.getState().reset(id);
    emit('room:join', { matchId: id })
      .then((r) => useGame.getState().applySnapshot(r.snapshot))
      .catch((e) => setError(friendlyError(e)));
  }, [conn, id]);

  useEffect(() => {
    if (snap && snap.state !== 'lobby') nav(`/match/${id}`, { replace: true });
  }, [snap, id, nav]);

  // Going back from a room that hasn't started closes your seat, so no ghost "match running" later.
  useEffect(
    () => () => {
      const g = useGame.getState();
      if (g.matchId === id && g.snapshot?.state === 'lobby') {
        g.reset();
        void emit('room:leave', { matchId: id }).catch(() => undefined);
      }
    },
    [id],
  );

  if (error)
    return (
      <div className="page full">
        <Empty icon="shield" tone="danger" title={t('War room unavailable', 'ওয়ার রুম পাওয়া যাচ্ছে না')} body={error} action={<button className="btn primary" onClick={() => nav('/battle')}><Icon name="arrow-left" /> {t('Back to battle', 'ব্যাটলে ফিরুন')}</button>} />
      </div>
    );
  if (!snap)
    return (
      <div className="stage-dark">
        <div className="mm-stage"><span className="spinner" style={{ width: 34, height: 34 }} /><p className="dim">{t('Entering the war room…', 'ওয়ার রুমে প্রবেশ করছেন…')}</p></div>
      </div>
    );

  const mine = snap.players.find((p) => p.userId === me.id);
  const isHost = snap.hostUserId === me.id;
  const teams = Array.from({ length: MODES[snap.mode].teams }, (_, i) => snap.players.filter((p) => p.team === i));
  const allReady = snap.players.every((p) => p.ready) && teams.every((x) => x.length > 0);
  const link = `${PUBLIC_WEB_URL.replace(/\/$/, '')}/war-room/${id}`;
  const readyCount = snap.players.filter((p) => p.ready).length;

  const toggleReady = async () => {
    haptic(mine?.ready ? 'tap' : 'success');
    sfx('tap');
    try {
      await emit('room:ready', { matchId: id, ready: !mine?.ready });
    } catch (e) {
      toast.error(t('Could not update', 'আপডেট করা যায়নি'), friendlyError(e));
    }
  };
  const startWar = async () => {
    setBusy(true);
    haptic('heavy');
    try {
      await emit('room:start', { matchId: id });
    } catch (e) {
      toast.error(t('Cannot start yet', 'এখনো শুরু করা যাবে না'), friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  // Leave instantly; the server is told in the background.
  const leave = () => {
    haptic('tap');
    useGame.getState().reset();
    useAuth.setState({ activeMatchId: null });
    nav('/battle', { replace: true });
    void emit('room:leave', { matchId: id }).catch(() => undefined);
  };

  return (
    <div className="stage-dark">
      <div className="war-room">
        <header className="wr-head">
          <p className="wr-kicker">QUIZ WAR</p>
          <h1><Icon name="swords" size={26} /> {t('War room', 'ওয়ার রুম')}</h1>
          <div className="wr-chips">
            <span className="chip on-dark"><Icon name={modeIcon(snap.mode)} /> {modeLabel(snap.mode)}</span>
            <span className="chip on-dark"><Icon name={snap.category ? categoryIcon(snap.category as any) : 'sparkles'} /> {snap.category ? snap.category.name : t('Mixed', 'মিশ্র')}</span>
            <span className="chip on-dark"><Icon name="list" /> {snap.questionCount ? num(snap.questionCount, lang) : '∞'}</span>
            <span className="chip on-dark"><Icon name="timer" /> {num(snap.questionTimeSec, lang)}{t('s', ' সে.')}</span>
            {snap.difficulty && <span className="chip on-dark"><Icon name={DIFFICULTY_INFO[snap.difficulty].icon} /> {t(DIFFICULTY_INFO[snap.difficulty].en, DIFFICULTY_INFO[snap.difficulty].bn)}</span>}
          </div>
        </header>

        <div className={`wr-teams ${teams.length > 1 ? 'versus' : ''}`}>
          {teams.map((players, ti) => (
            <section key={ti} className={`team-box t${ti}`} aria-label={t(`Team ${ti + 1}`, `দল ${ti + 1}`)}>
              <div className="tb-head">
                <b>{teams.length > 1 ? (ti === 0 ? t('Team Blue', 'নীল দল') : t('Team Red', 'লাল দল')) : t('Players', 'প্লেয়াররা')}</b>
                <span className="xs">{num(players.length, lang)}/{num(MODES[snap.mode].teamSize, lang)}</span>
              </div>
              {players.map((p) => (
                <div key={p.userId} className={`wr-player ${p.ready ? 'ready' : ''}`}>
                  <Avatar name={p.username} src={p.avatarUrl} size={42} bot={p.isBot} status={p.connected ? 'online' : 'offline'} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="ellipsis" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {p.username}
                      {p.userId === snap.hostUserId && <Icon name="crown" size={14} style={{ color: '#fde047' }} />}
                    </b>
                    <p className="xs">{t('Lv', 'লেভেল')} {num(p.level, lang)} · {num(p.rating, lang)}</p>
                  </div>
                  <span className={`ready-tag ${p.ready ? 'on' : 'off'}`}>
                    {p.ready ? <><Icon name="check" size={13} /> {t('Ready', 'প্রস্তুত')}</> : t('Waiting', 'অপেক্ষায়')}
                  </span>
                </div>
              ))}
              {Array.from({ length: Math.max(0, MODES[snap.mode].teamSize - players.length) }, (_, i) => (
                <div key={`empty-${i}`} className="wr-player empty">
                  <span className="wr-slot"><Icon name="user-plus" size={18} /></span>
                  <span className="xs">{t('Waiting for a player…', 'প্লেয়ারের অপেক্ষায়…')}</span>
                </div>
              ))}
            </section>
          ))}
          {teams.length > 1 && <span className="wr-vs">VS</span>}
        </div>

        <p className="dim center xs">{t(`${readyCount} of ${snap.players.length} ready`, `${num(snap.players.length, lang)} জনের মধ্যে ${num(readyCount, lang)} জন প্রস্তুত`)}</p>
        <button className={`btn lg block ${mine?.ready ? 'outline-dark' : 'success'}`} onClick={() => void toggleReady()}>
          <Icon name={mine?.ready ? 'close' : 'check'} /> {mine?.ready ? t('Not ready', 'এখনো প্রস্তুত নই') : t('I’m ready', 'আমি প্রস্তুত')}
        </button>
        {isHost && snap.players.length > 1 && (
          <button className="btn primary lg block start-war" disabled={!allReady || busy} onClick={() => void startWar()}>
            {busy ? <span className="spinner" /> : <Icon name="swords" />} {t('Start the war', 'যুদ্ধ শুরু করুন')}
          </button>
        )}
        <div className="row">
          <button
            className="btn white grow"
            onClick={() =>
              void share({ title: t('Join my war room', 'আমার ওয়ার রুমে যোগ দাও'), text: t(`Join my QUIZ WAR battle room (${modeLabel(snap.mode)})!`, `আমার QUIZ WAR ব্যাটল রুমে যোগ দাও (${modeLabel(snap.mode)})!`), url: link }).then(
                (r) => r === 'copied' && toast.success(t('Link copied', 'লিংক কপি হয়েছে'), undefined, 'copy'),
              )
            }
          >
            <Icon name="share" /> {t('Invite friends', 'বন্ধুদের ডাকুন')}
          </button>
          <button className="btn outline-dark" onClick={leave}><Icon name="door" /> {t('Leave', 'চলে যান')}</button>
        </div>
      </div>
    </div>
  );
}
