import { AI_LEVEL_DIFFICULTY, AI_LEVELS, type AiLevel, type BattleRequestView, type Difficulty } from '@quizwar/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar } from '../components/Avatar';
import { CategoryPicker } from '../components/CategoryPicker';
import { Empty, ListSkeleton } from '../components/Feedback';
import { categoryIcon, Icon, IconTile, type IconName } from '../components/Icon';
import { CountPicker, DifficultyPicker, MatchSummary, useMatchOptions } from '../components/MatchOptions';
import { PullToRefresh } from '../components/PullToRefresh';
import { QrScanner } from '../components/QrScanner';
import { api, ApiError, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { num, useLang, useT } from '../lib/i18n';
import { haptic } from '../lib/platform';
import { emit } from '../lib/socket';
import { nativeScan, nativeScanAvailable, roomCodeFrom, scanAvailable } from '../lib/scanner';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

const AI_INFO: Record<AiLevel, { icon: IconName; tone: 'success' | 'primary' | 'warning' | 'danger'; en: string; bn: string }> = {
  easy: { icon: 'smile', tone: 'success', en: 'Easy', bn: 'সহজ' },
  normal: { icon: 'gauge', tone: 'primary', en: 'Normal', bn: 'সাধারণ' },
  hard: { icon: 'bolt', tone: 'warning', en: 'Hard', bn: 'কঠিন' },
  expert: { icon: 'brain', tone: 'danger', en: 'Expert', bn: 'এক্সপার্ট' },
};

function useStart() {
  const nav = useNavigate();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const start = async (event: string, payload: object) => {
    setBusy(true);
    haptic('heavy');
    try {
      const r = await emit(event as any, payload);
      useGame.getState().reset(r.matchId);
      sfx('start');
      nav(event === 'room:create' ? `/war-room/${r.matchId}` : `/match/${r.matchId}`);
    } catch (e) {
      if ((e as ApiError).code === 'room_open') {
        const roomId = useAuth.getState().openRoomId;
        toast.error(t('Your war room is still open', 'আপনার ওয়ার রুম এখনো খোলা'), t('Leave that room first to play something else.', 'অন্য খেলা খেলতে আগে ওই রুম থেকে Leave করুন।'));
        if (roomId) nav(`/war-room/${roomId}`);
      } else toast.error(t('Could not start', 'শুরু করা যায়নি'), friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, start };
}

function Requests() {
  const nav = useNavigate();
  const t = useT();
  const lang = useLang();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['battle-requests'], queryFn: () => api<{ incoming: BattleRequestView[]; outgoing: BattleRequestView[] }>('/battles/requests'), refetchInterval: 15000 });
  const act = async (id: number, action: 'accept' | 'decline' | 'cancel') => {
    haptic('tap');
    try {
      if (action === 'cancel') await api(`/battles/requests/${id}`, { method: 'DELETE' });
      else {
        const r = await api<{ matchId: string | null }>(`/battles/requests/${id}/${action}`, { method: 'POST' });
        if (r.matchId) {
          useGame.getState().reset(r.matchId);
          nav(`/war-room/${r.matchId}`);
        }
      }
      void refetch();
    } catch (e) {
      toast.error(t('Something went wrong', 'কিছু একটা সমস্যা হয়েছে'), friendlyError(e));
      void refetch();
    }
  };
  if (isLoading) return <ListSkeleton rows={3} />;
  const none = !data?.incoming.length && !data?.outgoing.length;
  if (none)
    return (
      <Empty
        icon="swords"
        tone="danger"
        title={t('No pending challenges', 'কোনো চ্যালেঞ্জ অপেক্ষায় নেই')}
        body={t('Challenge a friend from your friends list or by UID.', 'ফ্রেন্ড লিস্ট বা UID দিয়ে বন্ধুকে চ্যালেঞ্জ করুন।')}
        action={
          <button className="btn soft" onClick={() => nav('/friends')}>
            <Icon name="users" /> {t('Open friends', 'বন্ধুদের দেখুন')}
          </button>
        }
      />
    );
  return (
    <div className="stack">
      {!!data?.incoming.length && <div className="section-label"><Icon name="arrow-left" size={14} /> {t('Incoming', 'আপনার কাছে এসেছে')}</div>}
      {data?.incoming.map((r) => (
        <div key={r.id} className="card req-card">
          <div className="row">
            <Avatar name={r.from.username} src={r.from.avatarThumbUrl} size={46} />
            <div className="grow">
              <b>{r.from.username}</b>
              <p className="xs muted">1 VS 1 · {num(r.questionCount, lang)} {t('questions', 'প্রশ্ন')} · {num(r.questionTimeSec, lang)}{t('s', ' সেকেন্ড')}{r.category ? ` · ${r.category.name}` : ''}</p>
            </div>
          </div>
          <div className="row mt">
            <button className="btn sm outline grow" onClick={() => void act(r.id, 'decline')}><Icon name="close" /> {t('Decline', 'ফিরিয়ে দিন')}</button>
            <button className="btn sm success grow" onClick={() => void act(r.id, 'accept')}><Icon name="check" /> {t('Accept', 'গ্রহণ করুন')}</button>
          </div>
        </div>
      ))}
      {!!data?.outgoing.length && <div className="section-label"><Icon name="arrow-right" size={14} /> {t('Sent', 'পাঠানো')}</div>}
      {data?.outgoing.map((r) => (
        <div key={r.id} className="card row">
          <Avatar name={r.to.username} src={r.to.avatarThumbUrl} size={42} />
          <div className="grow">
            <b>{r.to.username}</b>
            <p className="xs muted row gap-sm"><Icon name="hourglass" size={13} /> {t('Waiting for an answer…', 'উত্তরের অপেক্ষায়…')}</p>
          </div>
          <button className="btn sm ghost" onClick={() => void act(r.id, 'cancel')}>{t('Cancel', 'বাতিল')}</button>
        </div>
      ))}
    </div>
  );
}

export default function Battle({ tab: initialTab }: { tab?: 'play' | 'requests' }) {
  const t = useT();
  const lang = useLang();
  const [tab, setTab] = useState<'play' | 'requests'>(initialTab ?? 'play');
  const [params] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const [category, setCategory] = useState<number | null>(null);
  const [ranked, setRanked] = useState(true);
  const [level, setLevel] = useState<AiLevel>('normal');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [roomMode, setRoomMode] = useState<'duel' | 'duo' | 'trio' | 'squad'>('duo');
  const [joinCode, setJoinCode] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const opts = useMatchOptions();
  const [aiCount, setAiCount] = useState(opts.defaultCount);
  const [soloCount, setSoloCount] = useState(10);
  const { busy, start } = useStart();
  const daily = useQuery({ queryKey: ['daily'], queryFn: () => api('/daily') });
  const stats = useQuery({ queryKey: ['my-stats'], queryFn: () => api('/me/stats'), staleTime: 120_000 });

  useEffect(() => {
    if (params.get('quick')) nav('/matchmaking?mode=duel&ranked=1', { replace: true });
    if (params.get('daily') && daily.data?.available && !daily.data.played) document.getElementById('daily')?.scrollIntoView({ behavior: 'smooth' });
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [params, loc.hash, daily.data, nav]);

  const cat = category ? `&category=${category}` : '';
  return (
    <PullToRefresh>
      <div className="page stack battle-page">
        <PageHeader title={t('Battle', 'ব্যাটল')} />
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'play'} onClick={() => setTab('play')}><Icon name="gamepad" /> {t('Play', 'খেলুন')}</button>
          <button role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')}><Icon name="swords" /> {t('Challenges', 'চ্যালেঞ্জ')}</button>
        </div>
        {tab === 'requests' ? (
          <Requests />
        ) : (
          <>
            <div className="section-label"><Icon name="grid" size={14} /> {t('Category', 'ক্যাটাগরি')}</div>
            <CategoryPicker value={category} onChange={setCategory} />

            <section className="card" aria-labelledby="qb-h">
              <div className="card-title">
                <h2 id="qb-h"><IconTile name="swords" tone="danger" size={34} /> {t('Quick battle', 'কুইক ব্যাটল')}</h2>
                <label className="row small bold">
                  {t('Ranked', 'র‍্যাংকড')}
                  <span className="switch"><input type="checkbox" role="switch" checked={ranked} onChange={(e) => setRanked(e.target.checked)} aria-label={t('Ranked', 'র‍্যাংকড')} /></span>
                </label>
              </div>
              <div className="row">
                <button className="btn primary grow" onClick={() => (haptic('heavy'), nav(`/matchmaking?mode=duel&ranked=${ranked ? 1 : 0}${cat}`))}><Icon name="user" /> 1 VS 1</button>
                <button className="btn soft grow" onClick={() => (haptic('heavy'), nav(`/matchmaking?mode=duo&ranked=0${cat}`))}><Icon name="users" /> 2 VS 2</button>
              </div>
            </section>

            <section className="card" id="ai" aria-labelledby="ai-h">
              <div className="card-title"><h2 id="ai-h"><IconTile name="bot" tone="cyan" size={34} /> {t('Play vs AI', 'AI-এর সাথে খেলুন')}</h2><span className="chip">{t('Unranked', 'আনর‍্যাংকড')}</span></div>
              <div className="ai-levels" role="radiogroup" aria-label={t('AI difficulty', 'AI-এর কঠিনতা')}>
                {AI_LEVELS.map((l) => (
                  <button key={l} role="radio" aria-checked={level === l} className="ai-level" onClick={() => (haptic('tap'), setLevel(l))}>
                    <IconTile name={AI_INFO[l].icon} tone={AI_INFO[l].tone} size={36} />
                    {t(AI_INFO[l].en, AI_INFO[l].bn)}
                  </button>
                ))}
              </div>
              <CountPicker value={aiCount} onChange={setAiCount} />
              <MatchSummary count={aiCount} difficulty={AI_LEVEL_DIFFICULTY[level]} seconds={opts.timeFor(AI_LEVEL_DIFFICULTY[level])} />
              <button className="btn accent block mt" disabled={busy} onClick={() => void start('ai:start', { level, categoryId: category, questionCount: aiCount })}>
                {busy ? <span className="spinner" /> : <Icon name="bot" />} {t(`Battle ${AI_INFO[level].en} AI`, `${AI_INFO[level].bn} AI-এর সাথে লড়ুন`)}
              </button>
            </section>

            {daily.data?.available && (
              <section className="card feature-card daily" id="daily" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="card-title" style={{ marginBottom: 4 }}>
                  <h2><IconTile name="calendar" tone="accent" size={34} /> {t('Daily challenge', 'ডেইলি চ্যালেঞ্জ')}</h2>
                  <span className="chip">{num(daily.data.players, lang)} {t('played', 'জন খেলেছে')}</span>
                </div>
                <p className="small muted">
                  {num(daily.data.questionCount, lang)} {t('questions', 'প্রশ্ন')} · {num(Math.round(daily.data.totalTimeSec / 60), lang)} {t('minutes', 'মিনিট')} · {t('Same questions for everyone today. One attempt.', 'আজ সবার জন্য একই প্রশ্ন, একবারই খেলা যাবে।')}
                </p>
                {daily.data.played ? (
                  <button className="btn soft block mt" onClick={() => nav('/rank?tab=daily')}>
                    <Icon name="trophy" /> {t(`Your score: ${daily.data.result?.score} — leaderboard`, `আপনার স্কোর: ${num(daily.data.result?.score ?? 0, lang)} — লিডারবোর্ড`)}
                  </button>
                ) : (
                  <button className="btn primary block mt" disabled={busy} onClick={() => void start('solo:start', { mode: 'daily' })}>
                    <Icon name="bolt" /> {t('Start daily challenge', 'ডেইলি চ্যালেঞ্জ শুরু করুন')}
                  </button>
                )}
              </section>
            )}

            <section className="card" id="solo">
              <div className="card-title"><h2><IconTile name="brain" tone="success" size={34} /> {t('Solo practice', 'একা অনুশীলন')}</h2></div>
              <DifficultyPicker value={difficulty} onChange={setDifficulty} />
              <CountPicker value={soloCount} onChange={setSoloCount} />
              <button className="btn soft block mt" disabled={busy} onClick={() => void start('solo:start', { mode: 'solo', categoryId: category, difficulty, questionCount: soloCount })}>
                <Icon name="book-check" /> {t(`Practice ${soloCount} questions`, `${num(soloCount, lang)}টি প্রশ্ন অনুশীলন করুন`)}
              </button>
              {!!stats.data?.mistakesAvailable && (
                <button className="btn outline block mt" disabled={busy} onClick={() => void start('solo:start', { mode: 'solo', practiceMistakes: true, categoryId: category })}>
                  <Icon name="rotate" /> {t(`Practice mistakes (${stats.data.mistakesAvailable})`, `ভুলগুলো আবার অনুশীলন (${num(stats.data.mistakesAvailable, lang)})`)}
                </button>
              )}
              {!!stats.data?.weakCategories?.length && (
                <div className="weak-spots mt">
                  <span className="xs bold faint">{t('Weak spots', 'দুর্বল জায়গা')}</span>
                  <div className="chips-scroll">
                    {stats.data.weakCategories.map((c: any) => (
                      <span key={c.id ?? c.name} className="chip"><Icon name={categoryIcon(c)} /> {c.name} · {num(c.accuracy, lang)}%</span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <div className="mode-grid">
              <button className="mode-card" id="survival" disabled={busy} onClick={() => void start('solo:start', { mode: 'survival', categoryId: category })}>
                <IconTile name="heart-pulse" tone="warning" size={44} />
                <strong>{t('Survival', 'সারভাইভাল')}</strong>
                <span>{t('Keep going until one mistake', 'একটা ভুল না হওয়া পর্যন্ত চলবে')}</span>
              </button>
              <button className="mode-card" id="speed" disabled={busy} onClick={() => void start('solo:start', { mode: 'speed', categoryId: category })}>
                <IconTile name="bolt" tone="accent" size={44} />
                <strong>{t('Speed round', 'স্পিড রাউন্ড')}</strong>
                <span>{t('As many as you can in 60s', '৬০ সেকেন্ডে যত বেশি পারেন')}</span>
              </button>
            </div>

            <section className="card" aria-labelledby="wr-h">
              <div className="card-title"><h2 id="wr-h"><IconTile name="shield" tone="primary" size={34} /> {t('Custom war room', 'কাস্টম ওয়ার রুম')}</h2></div>
              <p className="small muted">{t('Pick the size and create the room — set questions, time and difficulty inside. Friends join with the code or QR.', 'সাইজ বাছাই করে রুম বানান — প্রশ্ন, সময় ও কঠিনতা রুমের ভিতরে ঠিক করবেন। বন্ধুরা কোড বা QR দিয়ে যোগ দেবে।')}</p>
              <div className="tabs mt" role="radiogroup" aria-label={t('Room size', 'রুমের আকার')}>
                {(['duel', 'duo', 'trio', 'squad'] as const).map((m) => (
                  <button key={m} role="radio" aria-checked={roomMode === m} aria-selected={roomMode === m} onClick={() => setRoomMode(m)}>
                    {{ duel: '1v1', duo: '2v2', trio: '3v3', squad: '4v4' }[m]}
                  </button>
                ))}
              </div>
              <button
                className="btn outline block mt"
                disabled={busy}
                onClick={() => void start('room:create', { mode: roomMode, categoryId: category })}
              >
                <Icon name="plus" /> {t('Create war room', 'ওয়ার রুম তৈরি করুন')}
              </button>
              <form
                className="row mt"
                onSubmit={(e) => {
                  e.preventDefault();
                  const id = joinCode.trim().split('/').pop()?.toUpperCase();
                  if (id) nav(`/war-room/${id}`);
                }}
              >
                <div className="input-wrap grow">
                  <Icon name="link" size={18} />
                  <input className="input" aria-label={t('Room link or code', 'রুম লিংক বা কোড')} placeholder={t('Room code, e.g. K7P4QX', 'রুম কোড, যেমন K7P4QX')} autoCapitalize="characters" maxLength={80} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
                </div>
                {scanAvailable() && (
                  <button
                    type="button"
                    className="btn icon soft"
                    aria-label={t('Scan QR with camera', 'ক্যামেরা দিয়ে QR স্ক্যান')}
                    title={t('Scan QR', 'QR স্ক্যান')}
                    onClick={async () => {
                      haptic('tap');
                      if (!nativeScanAvailable()) return setScanOpen(true);
                      try {
                        const raw = await nativeScan();
                        const code = raw && roomCodeFrom(raw);
                        if (code) nav(`/war-room/${code}`);
                        else if (raw) toast.error(t('Not a room QR', 'এটি রুমের QR নয়'), t('Scan the QR shown inside a war room.', 'ওয়ার রুমের ভিতরে দেখানো QR স্ক্যান করুন।'));
                      } catch {
                        toast.error(t('Scanner unavailable', 'স্ক্যানার চালু হয়নি'), t('Please type the room code instead.', 'রুম কোডটি লিখে যোগ দিন।'));
                      }
                    }}
                  >
                    <Icon name="scan" size={20} />
                  </button>
                )}
                <button className="btn soft" disabled={!joinCode.trim()}>{t('Join', 'যোগ দিন')}</button>
              </form>
              <QrScanner open={scanOpen} onClose={() => setScanOpen(false)} onCode={(code) => (setScanOpen(false), nav(`/war-room/${code}`))} />
            </section>
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
