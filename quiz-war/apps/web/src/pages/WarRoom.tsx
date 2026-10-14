import { MODES } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar, statusLabel } from '../components/Avatar';
import type { MatchPlayerView, PresenceStatus, PublicUser } from '@quizwar/shared';
import { Empty } from '../components/Feedback';
import { Icon, IconTile } from '../components/Icon';
import { QrCode } from '../components/Qr';
import { RoomSettings } from '../components/RoomSettings';
import { DIFFICULTY_INFO } from '../components/MatchOptions';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
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
  const [qrOpen, setQrOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [picked, setPicked] = useState<MatchPlayerView | null>(null);
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await api<{ items: { user: PublicUser; status: PresenceStatus }[] }>('/friends')).items,
    enabled: inviteOpen,
  });
  // The host sets the rules first, then continues to the team lobby. Remembered per room.
  const stepKey = `qw-wr-step-${id}`;
  const [setup, setSetupState] = useState(() => {
    try {
      return sessionStorage.getItem(stepKey) !== 'teams';
    } catch {
      return true;
    }
  });
  const setSetup = (v: boolean) => {
    setSetupState(v);
    window.scrollTo({ top: 0 });
    try {
      sessionStorage.setItem(stepKey, v ? 'setup' : 'teams');
    } catch {
      /* private mode */
    }
  };

  useEffect(() => {
    if (conn !== 'connected') return;
    if (useGame.getState().matchId !== id) useGame.getState().reset(id);
    emit('room:join', { matchId: id })
      .then((r) => {
        if (r.snapshot.matchId !== id) {
          // Joined with the short room code: continue on the real room address.
          useGame.getState().reset(r.snapshot.matchId);
          useGame.getState().applySnapshot(r.snapshot);
          nav(`/war-room/${r.snapshot.matchId}`, { replace: true });
          return;
        }
        useGame.getState().applySnapshot(r.snapshot);
      })
      .catch((e) => {
        const code = (e as any)?.code;
        setError(
          code === 'kicked'
            ? t('The host removed you from this room.', 'হোস্ট আপনাকে এই রুম থেকে বের করে দিয়েছেন।')
            : code === 'room_full'
            ? t('Squad full — every seat in this room is taken.', 'স্কোয়াড ফুল — এই রুমে আর জায়গা নেই।')
            : code === 'match_not_found'
              ? t('This room was closed or the code is wrong.', 'রুমটি বন্ধ হয়ে গেছে অথবা কোডটি ভুল।')
              : code === 'match_started'
                ? t('This battle has already started.', 'এই ব্যাটল ইতিমধ্যে শুরু হয়ে গেছে।')
                : friendlyError(e),
        );
      });
  }, [conn, id]);

  useEffect(() => {
    if (snap && snap.state !== 'lobby') {
      useAuth.setState({ openRoomId: null });
      nav(`/match/${id}`, { replace: true });
    }
  }, [snap, id, nav]);

  // The room stays open until the player taps Leave, even if they go elsewhere or close the app.
  useEffect(() => {
    if (snap?.state === 'lobby') useAuth.setState({ openRoomId: snap.matchId });
  }, [snap?.state, snap?.matchId]);

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
  const link = `${PUBLIC_WEB_URL.replace(/\/$/, '')}/war-room/${snap.roomCode ?? id}`;
  const full = snap.players.length >= MODES[snap.mode].teams * MODES[snap.mode].teamSize;
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
    useAuth.setState({ activeMatchId: null, openRoomId: null });
    try {
      sessionStorage.removeItem(stepKey);
    } catch {
      /* private mode */
    }
    nav('/battle', { replace: true });
    void emit('room:leave', { matchId: id }).catch(() => undefined);
  };

  const inviteFriend = async (u: PublicUser) => {
    haptic('tap');
    setInvited((x) => new Set(x).add(u.id));
    try {
      await emit('room:invite', { matchId: id, userId: u.id });
      toast.success(t('Invite sent', 'ইনভাইট পাঠানো হয়েছে'), u.username, 'send');
    } catch (e) {
      setInvited((x) => {
        const n = new Set(x);
        n.delete(u.id);
        return n;
      });
      toast.error(t('Could not invite', 'ইনভাইট পাঠানো যায়নি'), friendlyError(e));
    }
  };
  const kick = async (p: MatchPlayerView) => {
    setPicked(null);
    haptic('heavy');
    try {
      await emit('room:kick', { matchId: id, userId: p.userId });
      toast.success(t('Removed from the room', 'রুম থেকে বের করে দেওয়া হয়েছে'), p.username, 'user-x');
    } catch (e) {
      toast.error(t('Could not remove', 'বের করা যায়নি'), friendlyError(e));
    }
  };
  const shareLink = () =>
    void share({ title: t('Join my war room', 'আমার ওয়ার রুমে যোগ দাও'), text: t(`Join my QUIZ WAR battle room (${modeLabel(snap.mode)})! Code: ${snap.roomCode ?? ''}`, `আমার QUIZ WAR ব্যাটল রুমে যোগ দাও (${modeLabel(snap.mode)})! কোড: ${snap.roomCode ?? ''}`), url: link }).then(
      (r) => r === 'copied' && toast.success(t('Link copied', 'লিংক কপি হয়েছে'), undefined, 'copy'),
    );
  const copyCode = () => void navigator.clipboard?.writeText(snap.roomCode ?? '').then(() => (haptic('tap'), toast.success(t('Code copied', 'কোড কপি হয়েছে'), snap.roomCode ?? '', 'copy')));
  const teamSize = MODES[snap.mode].teamSize;
  const maxPlayers = MODES[snap.mode].teams * teamSize;
  const timed = !!snap.totalTimeSec;
  const inRoom = new Set(snap.players.map((p) => p.userId));
  const hostName = snap.players.find((p) => p.userId === snap.hostUserId)?.username;

  return (
    <div className="stage-dark wr2-stage">
      <div className="war-room wr2">
        <header className="wr2-top">
          <button className="wr2-round" aria-label={t('Back', 'ফিরে যান')} onClick={() => nav('/battle')}><Icon name="back" size={22} /></button>
          <div className="wr2-brand">
            <span className="wr2-cup" aria-hidden><Icon name="trophy" size={26} /></span>
            <span>
              <b>QUIZ WAR</b>
              <small>{t('Bangladesh’s ultimate quiz battle', 'বাংলাদেশের সেরা কুইজ ব্যাটল')}</small>
            </span>
          </div>
          {isHost ? (
            <button className="wr2-round" aria-label={t('Room settings', 'রুম সেটিংস')} onClick={() => (haptic('tap'), setSetup(!setup))}><Icon name="settings" size={22} /></button>
          ) : (
            <button className="wr2-round" aria-label={t('Show QR code', 'QR কোড দেখান')} onClick={() => setQrOpen(true)}><Icon name="qr" size={22} /></button>
          )}
        </header>

        <section className="wr2-code">
          <div className="wr2-code-main">
            <span className="wr2-label">{t('Room code', 'রুম কোড')}</span>
            <div className="wr2-code-pill">
              <b aria-label={(snap.roomCode ?? '').split('').join(' ')}>{snap.roomCode ?? '—'}</b>
              <button aria-label={t('Copy room code', 'রুম কোড কপি')} onClick={copyCode}><Icon name="copy" size={18} /></button>
            </div>
            <div className="wr2-code-chips">
              <span><Icon name={modeIcon(snap.mode)} size={15} /> {modeLabel(snap.mode)}</span>
              <span className={full ? 'full' : undefined}><Icon name="users" size={15} /> {num(snap.players.length, lang)}/{num(maxPlayers, lang)}</span>
              <button onClick={() => setQrOpen(true)} aria-label={t('Show QR code', 'QR কোড দেখান')}><Icon name="qr" size={15} /> QR</button>
            </div>
          </div>
          <svg className="wr2-art" viewBox="0 0 120 120" aria-hidden>
            <defs>
              <linearGradient id="wrBlade1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bfdbfe" /><stop offset="1" stopColor="#3b82f6" /></linearGradient>
              <linearGradient id="wrBlade2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fecaca" /><stop offset="1" stopColor="#ef4444" /></linearGradient>
              <radialGradient id="wrGlow"><stop offset="0" stopColor="#818cf8" stopOpacity=".55" /><stop offset="1" stopColor="#818cf8" stopOpacity="0" /></radialGradient>
            </defs>
            <circle cx="60" cy="60" r="56" fill="url(#wrGlow)" />
            <path d="M22 20 L70 68 L64 74 L16 26 Z" fill="url(#wrBlade1)" />
            <path d="M98 20 L50 68 L56 74 L104 26 Z" fill="url(#wrBlade2)" />
            <path d="M58 70 l8 8 M62 66 l-8 8" stroke="#facc15" strokeWidth="6" strokeLinecap="round" />
            <path d="M20 92 q-8 -16 4 -30 M100 92 q8 -16 -4 -30" fill="none" stroke="#facc15" strokeWidth="4" strokeLinecap="round" />
            <polygon points="60,48 76,58 76,78 60,88 44,78 44,58" fill="#f59e0b" stroke="#fde68a" strokeWidth="3" />
            <path d="M60 58 l3.5 7 7.5 1 -5.5 5 1.5 7.5 -7 -3.8 -7 3.8 1.5 -7.5 -5.5 -5 7.5 -1 z" fill="#fff7cc" />
            <circle cx="30" cy="40" r="2" fill="#fff" opacity=".8" /><circle cx="92" cy="44" r="2" fill="#fff" opacity=".8" /><circle cx="88" cy="96" r="1.6" fill="#fff" opacity=".7" />
          </svg>
        </section>

        <div className="wr2-pills">
          <span className="wr2-pill open"><i /> {t('Room open', 'রুম খোলা')}</span>
          <span className="wr2-pill">{isHost ? t('You are the host', 'আপনি হোস্ট') : t(`Host: ${hostName ?? '—'}`, `হোস্ট: ${hostName ?? '—'}`)}</span>
          <span className={`wr2-pill ${conn === 'connected' ? 'on' : 'off'}`}><Icon name={conn === 'connected' ? 'wifi' : 'wifi-off'} size={15} /> {conn === 'connected' ? t('Online', 'অনলাইন') : t('Offline', 'অফলাইন')}</span>
        </div>

        {isHost && setup ? (
          <>
            <RoomSettings snap={snap} />
            <button className="btn primary lg block" onClick={() => (haptic('tap'), setSetup(false))}>
              {t('Continue', 'এগিয়ে যান')} <Icon name="arrow-right" />
            </button>
            <button className="btn outline-dark block" onClick={leave}><Icon name="door" /> {t('Cancel room', 'রুম বাতিল করুন')}</button>
          </>
        ) : (
          <>
            <section className="wr2-rules" aria-label={t('Room rules', 'রুমের নিয়ম')}>
              <div className="wr2-rules-head">
                <span className="wr2-rules-ic"><Icon name="settings" size={20} /></span>
                <span className="grow">
                  <b>{t('Room rules', 'রুমের নিয়ম')}</b>
                  <small>{t('Play fair • Stay friendly • Enjoy the game', 'ন্যায্য খেলুন • বন্ধুত্ব রাখুন • উপভোগ করুন')}</small>
                </span>
                {isHost && <button className="wr2-change" onClick={() => setSetup(true)}><Icon name="edit" size={15} /> {t('Change', 'বদলান')}</button>}
              </div>
              <div className="wr2-tiles">
                <div className="wr2-tile c-blue"><span><Icon name="grid" size={18} /></span><b>{snap.category ? snap.category.name : t('Mixed', 'মিশ্র')}</b><small>{t('Category', 'বিষয়')}</small></div>
                {timed ? (
                  <div className="wr2-tile c-green"><span><Icon name="hourglass" size={18} /></span><b>{num(Math.round((snap.totalTimeSec ?? 0) / 60), lang)} {t('min', 'মি')}</b><small>{t('Time limit', 'সময়সীমা')}</small></div>
                ) : (
                  <div className="wr2-tile c-green"><span><Icon name="list" size={18} /></span><b>{snap.questionCount ? num(snap.questionCount, lang) : '∞'}</b><small>{t('Questions', 'প্রশ্ন')}</small></div>
                )}
                <div className="wr2-tile c-pink"><span><Icon name="timer" size={18} /></span><b>{num(snap.questionTimeSec, lang)}{t('s', 'সে')}</b><small>{t('Each', 'প্রতি প্রশ্নে')}</small></div>
                <div className="wr2-tile c-purple"><span><Icon name={snap.difficulty ? DIFFICULTY_INFO[snap.difficulty].icon : 'chart'} size={18} /></span><b>{snap.difficulty ? t(DIFFICULTY_INFO[snap.difficulty].en, DIFFICULTY_INFO[snap.difficulty].bn) : t('Mixed', 'মিশ্র')}</b><small>{t('Level', 'লেভেল')}</small></div>
              </div>
            </section>

            <div className="wr2-teams">
              {teams.map((players, ti) => (
                <section key={ti} className={`wr2-team ${teams.length > 1 ? (ti === 0 ? 'blue' : 'red') : 'blue'}`} aria-label={t(`Team ${ti + 1}`, `দল ${ti + 1}`)}>
                  <div className="wr2-team-head">
                    <Icon name="shield" size={22} />
                    <b>{teams.length > 1 ? (ti === 0 ? t('Team Blue', 'নীল দল') : t('Team Red', 'লাল দল')) : t('Players', 'প্লেয়াররা')}</b>
                    <span>{num(players.length, lang)}/{num(teamSize, lang)}</span>
                  </div>
                  <div className="wr2-team-body">
                    {players.map((p) => (
                      <button key={p.userId} type="button" className={`wr2-player${p.ready ? ' ready' : ''}`} onClick={() => p.userId !== me.id && !p.isBot && (haptic('tap'), setPicked(p))}>
                        <Avatar name={p.username} src={p.avatarUrl} size={48} bot={p.isBot} status={p.connected ? 'online' : 'offline'} />
                        <span className="grow">
                          <b>
                            {p.username}
                            {p.userId === snap.hostUserId && <Icon name="crown" size={16} className="wr2-crown" />}
                            {p.userId === me.id && <em>{t('You', 'আপনি')}</em>}
                          </b>
                          <small>{t('Lv', 'লেভেল')} {num(p.level, lang)} · {num(p.rating, lang)}</small>
                        </span>
                        <span className={`wr2-state ${p.ready ? 'on' : 'off'}`}>
                          <Icon name={p.ready ? 'check' : 'clock'} size={15} /> {p.ready ? t('Ready', 'প্রস্তুত') : t('Waiting', 'অপেক্ষায়')}
                        </span>
                      </button>
                    ))}
                    {Array.from({ length: Math.max(0, teamSize - players.length) }, (_, i) => (
                      <button key={`e${i}`} type="button" className="wr2-empty" onClick={() => (haptic('tap'), setInviteOpen(true))}>
                        <span className="wr2-slot"><Icon name="user-plus" size={18} /></span>
                        <span>{t('Waiting for a player…', 'প্লেয়ারের অপেক্ষায়…')}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {teams.length > 1 && <span className="wr2-vs">VS</span>}
            </div>

            <p className="wr2-count">{t(`${readyCount} of ${snap.players.length} ready`, `${num(snap.players.length, lang)} জনের মধ্যে ${num(readyCount, lang)} জন প্রস্তুত`)}</p>
            <button className={`btn lg block wr2-ready ${mine?.ready ? 'is-ready' : ''}`} onClick={() => void toggleReady()}>
              <Icon name={mine?.ready ? 'close' : 'check'} size={24} /> {mine?.ready ? t('Not ready', 'এখনো প্রস্তুত নই') : t('I’m ready', 'আমি প্রস্তুত')} {!mine?.ready && <Icon name="arrow-right" />}
            </button>
            {isHost && snap.players.length > 1 && (
              <button className="btn primary lg block start-war" disabled={!allReady || busy} onClick={() => void startWar()}>
                {busy ? <span className="spinner" /> : <Icon name="swords" />} {t('Start the war', 'যুদ্ধ শুরু করুন')}
              </button>
            )}
            <div className="wr2-bottom">
              <button className="btn wr2-invite" onClick={() => (haptic('tap'), setInviteOpen(true))}><Icon name="share" /> {t('Invite friends', 'বন্ধুদের ডাকুন')}</button>
              <button className="btn wr2-leave" onClick={leave}><Icon name="door" /> {t('Leave', 'চলে যান')}</button>
            </div>
          </>
        )}
      </div>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title={t('Invite friends', 'বন্ধুদের ডাকুন')} icon="users">
        <div className="col">
          <div className="row">
            <button className="btn primary grow" onClick={shareLink}><Icon name="share" /> {t('Share link', 'লিংক শেয়ার')}</button>
            <button className="btn soft" onClick={() => (setInviteOpen(false), setQrOpen(true))}><Icon name="qr" /> QR</button>
          </div>
          <p className="xs muted">{t('Or invite a friend right now — they get a live popup and a phone notification.', 'অথবা এখনই বন্ধুকে ডাকুন — সে সাথে সাথে পপআপ আর ফোনে নোটিফিকেশন পাবে।')}</p>
          {friends.isLoading ? (
            <span className="spinner" />
          ) : !friends.data?.length ? (
            <p className="small muted center">{t('No friends yet. Add friends from the Chat tab.', 'এখনো কোনো বন্ধু নেই। চ্যাট ট্যাব থেকে বন্ধু যোগ করুন।')}</p>
          ) : (
            <div className="list invite-list">
              {friends.data.map((f) => {
                const here = inRoom.has(f.user.id);
                const sent = invited.has(f.user.id);
                const off = f.status === 'offline';
                return (
                  <div key={f.user.id} className="list-row">
                    <Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status} size={44} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <b className="ellipsis" style={{ display: 'block' }}>{f.user.username}</b>
                      <small className={`status-text s-${f.status}`}>{statusLabel(f.status)}</small>
                    </span>
                    <button className={`btn sm ${sent || here ? 'soft' : 'primary'}`} disabled={here || sent || f.status === 'in_match'} onClick={() => void inviteFriend(f.user)}>
                      {here ? t('In room', 'রুমে আছে') : sent ? <><Icon name="check" size={15} /> {t('Sent', 'পাঠানো হয়েছে')}</> : <><Icon name="send" size={15} /> {off ? t('Notify', 'জানান') : t('Invite', 'ডাকুন')}</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.username ?? ''} icon="user">
        {picked && (
          <section className="menu-list">
            {picked.uid && (
              <Link className="menu-row" to={`/u/${picked.uid}`} onClick={() => setPicked(null)}>
                <IconTile name="user" tone="primary" size={40} /><span className="m-text"><b>{t('View profile', 'প্রোফাইল দেখুন')}</b><small>{picked.uid}</small></span>
              </Link>
            )}
            {picked.uid && (
              <Link className="menu-row" to={`/chat/${picked.uid}`} onClick={() => setPicked(null)}>
                <IconTile name="message" tone="cyan" size={40} /><span className="m-text"><b>{t('Message', 'মেসেজ')}</b></span>
              </Link>
            )}
            {isHost && (
              <button className="menu-row danger" onClick={() => void kick(picked)}>
                <IconTile name="user-x" tone="danger" size={40} /><span className="m-text"><b>{t('Remove from room', 'রুম থেকে বের করে দিন')}</b><small>{t('They can’t rejoin this room', 'সে আর এই রুমে ঢুকতে পারবে না')}</small></span>
              </button>
            )}
          </section>
        )}
      </Sheet>

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title={t('Scan to join', 'স্ক্যান করে যোগ দিন')} icon="qr">
        <div className="col center">
          <div className="qr-box"><QrCode value={link} size={220} /></div>
          <b className="rc-code light">{snap.roomCode}</b>
          <p className="small muted center">{t('Friends can scan this QR, open the link, or type the code in Battle → Join room.', 'বন্ধুরা QR স্ক্যান করে, লিংক খুলে, বা ব্যাটল → রুমে যোগ দিন-এ কোড লিখে ঢুকতে পারবে।')}</p>
        </div>
      </Sheet>
    </div>
  );
}
