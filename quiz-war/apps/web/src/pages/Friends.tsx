import { normalizeUid, type PublicUser } from '@quizwar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar, statusLabel } from '../components/Avatar';
import { ChallengeSheet } from '../components/ChallengeSheet';
import { Empty, ErrorBox, ListSkeleton } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PullToRefresh } from '../components/PullToRefresh';
import { QrCode, QrScanner } from '../components/Qr';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num, useLang, useT } from '../lib/i18n';
import { haptic, share } from '../lib/platform';
import { profileLink } from '../lib/qr';
import { toast } from '../lib/toast';
import { PlayerName } from '../components/Verified';

export default function Friends() {
  const t = useT();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'friends' | 'online' | 'requests' | 'add') ?? 'friends';
  const setTab = (x: string) => setParams({ tab: x }, { replace: true });
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const nav = useNavigate();
  const friends = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: any[] }>('/friends')).items });
  const online = useQuery({
    queryKey: ['players-online'],
    queryFn: async () => (await api<{ items: { user: PublicUser; status: string; isFriend: boolean }[] }>('/players/online')).items,
    enabled: tab === 'online',
    refetchInterval: tab === 'online' ? 20_000 : false,
  });
  const requests = useQuery({ queryKey: ['friend-requests'], queryFn: () => api<{ incoming: any[]; outgoing: any[] }>('/friends/requests') });
  const [challenge, setChallenge] = useState<PublicUser | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [uid, setUid] = useState('');
  const [found, setFound] = useState<{ user: PublicUser; status: string } | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const search = async (raw: string) => {
    setSearchErr(null);
    setFound(null);
    const n = normalizeUid(raw);
    if (!n) return setSearchErr(t('Enter a valid UID like QW-8F29K7', 'সঠিক UID দিন, যেমন QW-8F29K7'));
    setSearching(true);
    try {
      setFound(await api(`/users/search?uid=${encodeURIComponent(n)}`));
    } catch (e) {
      setSearchErr(friendlyError(e));
    } finally {
      setSearching(false);
    }
  };

  const addFriend = async (u: PublicUser) => {
    try {
      const r = await api<{ status: string }>('/friends/requests', { body: { userId: u.id } });
      haptic('success');
      toast.success(r.status === 'accepted' ? t('You are now friends!', 'আপনারা এখন বন্ধু!') : t('Friend request sent', 'ফ্রেন্ড রিকোয়েস্ট পাঠানো হয়েছে'), u.username, 'user-check');
      void qc.invalidateQueries({ queryKey: ['friends'] });
      void qc.invalidateQueries({ queryKey: ['friend-requests'] });
    } catch (e) {
      toast.error(t('Could not add friend', 'বন্ধু যোগ করা যায়নি'), friendlyError(e));
    }
  };

  const respond = async (id: number, accept: boolean) => {
    haptic('tap');
    try {
      await api(`/friends/requests/${id}/${accept ? 'accept' : 'reject'}`, { method: 'POST' });
      if (accept) toast.success(t('Friend added', 'বন্ধু যোগ হয়েছে'), undefined, 'user-check');
      void qc.invalidateQueries({ queryKey: ['friends'] });
      void qc.invalidateQueries({ queryKey: ['friend-requests'] });
    } catch (e) {
      toast.error(t('Something went wrong', 'কিছু একটা সমস্যা হয়েছে'), friendlyError(e));
    }
  };

  const incoming = requests.data?.incoming.length ?? 0;
  const onlineCount = friends.data?.filter((f) => f.status !== 'offline').length ?? 0;
  const sorted = [...(friends.data ?? [])].sort((a, b) => Number(a.status === 'offline') - Number(b.status === 'offline'));

  return (
    <PullToRefresh>
      <div className="page stack">
        <PageHeader
          title={t('Friends', 'বন্ধুরা')}
          action={
            <div className="row gap-sm">
              <button className="btn icon sm soft" aria-label={t('Show my QR code', 'আমার QR কোড')} onClick={() => setQrOpen(true)}><Icon name="qr" size={20} /></button>
              <button className="btn icon sm soft" aria-label={t('Scan a QR code', 'QR কোড স্ক্যান')} onClick={() => setScanOpen(true)}><Icon name="scan" size={20} /></button>
            </div>
          }
        />
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')}>
            <Icon name="users" /> {t('Friends', 'বন্ধু')} {friends.data ? <span className="tab-count">{num(onlineCount, lang)}/{num(friends.data.length, lang)}</span> : null}
          </button>
          <button role="tab" aria-selected={tab === 'online'} onClick={() => setTab('online')}>
            <Icon name="wifi" /> {t('Online', 'অনলাইন')}
          </button>
          <button role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')}>
            <Icon name="user-add" /> {t('Requests', 'রিকোয়েস্ট')} {incoming ? <span className="tab-badge">{num(incoming, lang)}</span> : null}
          </button>
          <button role="tab" aria-selected={tab === 'add'} onClick={() => setTab('add')}>
            <Icon name="plus" /> {t('Add', 'যোগ করুন')}
          </button>
        </div>

        {tab === 'friends' &&
          (friends.isLoading ? (
            <ListSkeleton rows={5} />
          ) : friends.error ? (
            <ErrorBox error={friends.error} retry={friends.refetch} />
          ) : !friends.data?.length ? (
            <Empty
              icon="users"
              title={t('No friends yet', 'এখনো কোনো বন্ধু নেই')}
              body={t('Add friends with their UID or by scanning their QR code.', 'UID দিয়ে বা QR কোড স্ক্যান করে বন্ধু যোগ করুন।')}
              action={<button className="btn primary" onClick={() => setTab('add')}><Icon name="user-plus" /> {t('Add friends', 'বন্ধু যোগ করুন')}</button>}
            />
          ) : (
            <div className="card list stagger">
              {sorted.map((f) => {
                const canChallenge = !(f.status === 'offline' || f.status === 'in_match' || f.status === 'dnd');
                return (
                  <div key={f.user.id} className="list-row">
                    <Link to={`/u/${f.user.uid}`}><Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status} size={48} frame={f.user.frame} /></Link>
                    <Link to={`/u/${f.user.uid}`} className="grow" style={{ color: 'var(--text)', minWidth: 0 }}>
                      <b style={{ display: 'block' }}><PlayerName name={f.user.username} verified={f.user.verified} /></b>
                      <span className={`xs status-text s-${f.status}`}>{statusLabel(f.status)}</span>
                      <span className="xs muted"> · {t('Lv', 'লেভেল')} {num(f.user.level, lang)}</span>
                    </Link>
                    <button className="btn sm primary" disabled={!canChallenge} onClick={() => (haptic('tap'), setChallenge(f.user))} aria-label={t(`Challenge ${f.user.username}`, `${f.user.username}-কে চ্যালেঞ্জ`)}>
                      <Icon name="swords" /> {t('Challenge', 'চ্যালেঞ্জ')}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}

        {tab === 'online' && (
          <>
            <p className="small muted">{t('Players who are online and open to battles right now — closest skill first.', 'এই মুহূর্তে অনলাইনে আছেন আর ব্যাটলের জন্য প্রস্তুত এমন প্লেয়ার — আপনার কাছাকাছি দক্ষতার প্লেয়ার আগে।')}</p>
            {online.isLoading ? (
              <ListSkeleton rows={5} />
            ) : online.error ? (
              <ErrorBox error={online.error} retry={online.refetch} />
            ) : !online.data?.length ? (
              <Empty
                icon="wifi"
                title={t('Nobody available right now', 'এখন কেউ ফ্রি নেই')}
                body={t('Try Quick Battle — we will find an opponent or an AI player for you.', 'কুইক ব্যাটল চাপুন — আমরা প্রতিপক্ষ বা এআই প্লেয়ার খুঁজে দেব।')}
                action={<button className="btn primary" onClick={() => nav('/battle')}><Icon name="swords" /> {t('Quick battle', 'কুইক ব্যাটল')}</button>}
              />
            ) : (
              <div className="card list stagger">
                {online.data.map((f) => (
                  <div key={f.user.id} className="list-row">
                    <Link to={`/u/${f.user.uid}`}><Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status as any} size={48} frame={f.user.frame} /></Link>
                    <Link to={`/u/${f.user.uid}`} className="grow" style={{ color: 'var(--text)', minWidth: 0 }}>
                      <b style={{ display: 'block' }}><PlayerName name={f.user.username} verified={f.user.verified} />{f.isFriend && <span className="chip success xs-chip">{t('Friend', 'বন্ধু')}</span>}</b>
                      <span className="xs muted">{t('Lv', 'লেভেল')} {num(f.user.level, lang)} · {t('Rating', 'রেটিং')} {num(f.user.rating, lang)}</span>
                    </Link>
                    {!f.isFriend && (
                      <button className="btn icon sm soft" onClick={() => void addFriend(f.user)} aria-label={t(`Add ${f.user.username} as friend`, `${f.user.username}-কে বন্ধু করুন`)}>
                        <Icon name="user-plus" size={18} />
                      </button>
                    )}
                    <button className="btn sm primary" onClick={() => (haptic('tap'), setChallenge(f.user))} aria-label={t(`Challenge ${f.user.username}`, `${f.user.username}-কে চ্যালেঞ্জ`)}>
                      <Icon name="swords" /> {t('Challenge', 'চ্যালেঞ্জ')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'requests' &&
          (requests.isLoading ? (
            <ListSkeleton rows={3} />
          ) : !requests.data?.incoming.length && !requests.data?.outgoing.length ? (
            <Empty icon="user-add" title={t('No friend requests', 'কোনো ফ্রেন্ড রিকোয়েস্ট নেই')} body={t('Requests you receive will appear here.', 'নতুন রিকোয়েস্ট এলে এখানে দেখাবে।')} />
          ) : (
            <>
              {requests.data!.incoming.map((r) => (
                <div key={r.id} className="card req-card">
                  <div className="row">
                    <Avatar name={r.user.username} src={r.user.avatarThumbUrl} size={46} />
                    <div className="grow"><b>{r.user.username}</b><p className="xs muted">{r.user.uid} · {t('wants to be your friend', 'আপনার বন্ধু হতে চায়')}</p></div>
                  </div>
                  <div className="row mt">
                    <button className="btn sm outline grow" onClick={() => void respond(r.id, false)}><Icon name="close" /> {t('Decline', 'বাতিল')}</button>
                    <button className="btn sm primary grow" onClick={() => void respond(r.id, true)}><Icon name="check" /> {t('Accept', 'গ্রহণ করুন')}</button>
                  </div>
                </div>
              ))}
              {!!requests.data!.outgoing.length && <div className="section-label">{t('Sent', 'পাঠানো')}</div>}
              {requests.data!.outgoing.map((r) => (
                <div key={r.id} className="card row">
                  <Avatar name={r.user.username} src={r.user.avatarThumbUrl} size={42} />
                  <div className="grow"><b>{r.user.username}</b><p className="xs muted row gap-sm"><Icon name="hourglass" size={13} /> {t('Pending', 'অপেক্ষায়')}</p></div>
                  <button className="btn sm ghost" onClick={() => void api(`/friends/requests/${r.id}`, { method: 'DELETE' }).then(() => requests.refetch())}>{t('Cancel', 'বাতিল')}</button>
                </div>
              ))}
            </>
          ))}

        {tab === 'add' && (
          <>
            <form className="card col" onSubmit={(e: FormEvent) => (e.preventDefault(), void search(uid))}>
              <label htmlFor="uid" className="bold">{t('Find a player by UID', 'UID দিয়ে প্লেয়ার খুঁজুন')}</label>
              <div className="row">
                <div className="input-wrap grow">
                  <Icon name="search" size={20} />
                  <input id="uid" className="input" placeholder="QW-8F29K7" autoCapitalize="characters" spellCheck={false} enterKeyHint="search" value={uid} onChange={(e) => (setUid(e.target.value), setSearchErr(null))} aria-invalid={!!searchErr} />
                </div>
                <button className="btn primary" disabled={!uid.trim() || searching}>{searching ? <span className="spinner" /> : t('Search', 'খুঁজুন')}</button>
              </div>
              {searchErr && <span className="field-error"><Icon name="alert-circle" size={15} /> {searchErr}</span>}
            </form>
            {found && (
              <div className="card found-card">
                <Avatar name={found.user.username} src={found.user.avatarThumbUrl} size={56} status={found.status as any} frame={found.user.frame} />
                <div className="grow"><b><PlayerName name={found.user.username} verified={found.user.verified} /></b><p className="xs muted">{found.user.uid} · {t('Lv', 'লেভেল')} {num(found.user.level, lang)}</p></div>
                {found.user.id !== me.id && (
                  <div className="row gap-sm">
                    <button className="btn sm soft" onClick={() => void addFriend(found.user)}><Icon name="user-plus" /> {t('Add', 'যোগ')}</button>
                    <button className="btn icon sm primary" aria-label={t('Challenge', 'চ্যালেঞ্জ')} onClick={() => setChallenge(found.user)}><Icon name="swords" /></button>
                  </div>
                )}
              </div>
            )}
            <div className="qr-actions">
              <button className="card tap qr-action" onClick={() => setQrOpen(true)}>
                <Icon name="qr" size={30} />
                <b>{t('My QR code', 'আমার QR কোড')}</b>
                <span className="xs muted">{t('Let friends scan you', 'বন্ধুরা স্ক্যান করবে')}</span>
              </button>
              <button className="card tap qr-action" onClick={() => setScanOpen(true)}>
                <Icon name="scan" size={30} />
                <b>{t('Scan QR', 'QR স্ক্যান')}</b>
                <span className="xs muted">{t('Add a friend instantly', 'সাথে সাথে বন্ধু যোগ')}</span>
              </button>
            </div>
          </>
        )}

        <ChallengeSheet target={challenge} onClose={() => setChallenge(null)} />

        <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title={t('My QR code', 'আমার QR কোড')} icon="qr">
          <div className="col center">
            <QrCode value={profileLink(me.uid)} />
            <span className="uid-badge" style={{ margin: '8px auto 0' }}>{me.uid}</span>
            <p className="xs muted">{t('Friends can scan this to add or challenge you. It only contains your public profile link.', 'বন্ধুরা এটি স্ক্যান করে আপনাকে অ্যাড বা চ্যালেঞ্জ করতে পারবে। এতে শুধু আপনার পাবলিক প্রোফাইল লিংক আছে।')}</p>
            <div className="row" style={{ width: '100%' }}>
              <button className="btn soft grow" onClick={() => void navigator.clipboard?.writeText(me.uid).then(() => toast.success(t('UID copied', 'UID কপি হয়েছে'), me.uid, 'copy'))}><Icon name="copy" /> {t('Copy UID', 'UID কপি')}</button>
              <button className="btn primary grow" onClick={() => void share({ title: 'QUIZ WAR', text: t(`Challenge me on QUIZ WAR! My UID: ${me.uid}`, `QUIZ WAR-এ আমাকে চ্যালেঞ্জ করো! আমার UID: ${me.uid}`), url: profileLink(me.uid) })}><Icon name="share" /> {t('Share', 'শেয়ার')}</button>
            </div>
          </div>
        </Sheet>

        <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title={t('Scan QR code', 'QR কোড স্ক্যান')} icon="scan">
          <QrScanner onUid={(u) => (setScanOpen(false), nav(`/u/${u}`))} />
        </Sheet>
      </div>
    </PullToRefresh>
  );
}
