import { normalizeUid, type PublicUser } from '@quizwar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '../components/AppShell';
import { Avatar, statusLabel } from '../components/Avatar';
import { ChallengeSheet } from '../components/ChallengeSheet';
import { Empty, ErrorBox, Skeleton } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { QrCode, QrScanner } from '../components/Qr';
import { Sheet } from '../components/Sheet';
import { api, friendlyError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { share } from '../lib/platform';
import { profileLink } from '../lib/qr';
import { toast } from '../lib/toast';

export default function Friends() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'friends' | 'requests' | 'add') ?? 'friends';
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const nav = useNavigate();
  const friends = useQuery({ queryKey: ['friends'], queryFn: async () => (await api<{ items: any[] }>('/friends')).items });
  const requests = useQuery({ queryKey: ['friend-requests'], queryFn: () => api<{ incoming: any[]; outgoing: any[] }>('/friends/requests') });
  const [challenge, setChallenge] = useState<PublicUser | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [uid, setUid] = useState('');
  const [found, setFound] = useState<{ user: PublicUser; status: string } | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const search = async (raw: string) => {
    setSearchErr(null);
    setFound(null);
    const n = normalizeUid(raw);
    if (!n) return setSearchErr('Enter a valid UID like QW-8F29K7');
    try {
      setFound(await api(`/users/search?uid=${encodeURIComponent(n)}`));
    } catch (e) {
      setSearchErr(friendlyError(e));
    }
  };

  const addFriend = async (u: PublicUser) => {
    try {
      const r = await api<{ status: string }>('/friends/requests', { body: { userId: u.id } });
      toast.success(r.status === 'accepted' ? 'You are now friends!' : 'Friend request sent', u.username, '👥');
      void qc.invalidateQueries({ queryKey: ['friends'] });
      void qc.invalidateQueries({ queryKey: ['friend-requests'] });
    } catch (e) {
      toast.error('Could not add friend', friendlyError(e));
    }
  };

  const respond = async (id: number, accept: boolean) => {
    try {
      await api(`/friends/requests/${id}/${accept ? 'accept' : 'reject'}`, { method: 'POST' });
      void qc.invalidateQueries({ queryKey: ['friends'] });
      void qc.invalidateQueries({ queryKey: ['friend-requests'] });
    } catch (e) {
      toast.error('Something went wrong', friendlyError(e));
    }
  };

  const incoming = requests.data?.incoming.length ?? 0;
  const onlineCount = friends.data?.filter((f) => f.status !== 'offline').length ?? 0;

  return (
    <div className="page stack">
      <PageHeader
        title="Friends"
        action={
          <div className="row gap-sm">
            <button className="btn icon sm soft" aria-label="Show my QR code" onClick={() => setQrOpen(true)}><Icon name="qr" size={18} /></button>
            <button className="btn icon sm soft" aria-label="Scan a QR code" onClick={() => setScanOpen(true)}><Icon name="scan" size={18} /></button>
          </div>
        }
      />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'friends'} onClick={() => setTab('friends')}>Friends {friends.data ? `(${onlineCount}/${friends.data.length})` : ''}</button>
        <button role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')}>Requests {incoming ? `(${incoming})` : ''}</button>
        <button role="tab" aria-selected={tab === 'add'} onClick={() => setTab('add')}>Add</button>
      </div>

      {tab === 'friends' && (
        friends.isLoading ? <Skeleton lines={5} /> : friends.error ? <ErrorBox error={friends.error} retry={friends.refetch} /> : !friends.data?.length ? (
          <Empty icon="👥" title="No friends yet" body="Add friends with their UID or by scanning their QR code." action={<button className="btn primary" onClick={() => setTab('add')}>Add friends</button>} />
        ) : (
          <div className="card list">
            {friends.data.map((f) => (
              <div key={f.user.id} className="list-row">
                <Link to={`/u/${f.user.uid}`}><Avatar name={f.user.username} src={f.user.avatarThumbUrl} status={f.status} size={46} frame={f.user.frame} /></Link>
                <Link to={`/u/${f.user.uid}`} className="grow" style={{ color: 'var(--text)', minWidth: 0 }}>
                  <b className="ellipsis" style={{ display: 'block' }}>{f.user.username}</b>
                  <span className="xs muted">{statusLabel(f.status)} · Lv {f.user.level} · {f.user.rating}</span>
                </Link>
                <button className="btn sm primary" disabled={f.status === 'offline' || f.status === 'in_match' || f.status === 'dnd'} onClick={() => setChallenge(f.user)}>⚔️ Challenge</button>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'requests' && (
        requests.isLoading ? <Skeleton lines={3} /> : !requests.data?.incoming.length && !requests.data?.outgoing.length ? (
          <Empty icon="📭" title="No friend requests" />
        ) : (
          <>
            {requests.data!.incoming.map((r) => (
              <div key={r.id} className="card row">
                <Avatar name={r.user.username} src={r.user.avatarThumbUrl} size={44} />
                <div className="grow"><b>{r.user.username}</b><p className="xs muted">{r.user.uid}</p></div>
                <button className="btn sm success" onClick={() => void respond(r.id, true)}>Accept</button>
                <button className="btn sm ghost" onClick={() => void respond(r.id, false)}>Reject</button>
              </div>
            ))}
            {!!requests.data!.outgoing.length && <div className="section-label">Sent</div>}
            {requests.data!.outgoing.map((r) => (
              <div key={r.id} className="card row">
                <Avatar name={r.user.username} src={r.user.avatarThumbUrl} size={40} />
                <div className="grow"><b>{r.user.username}</b><p className="xs muted">Pending</p></div>
                <button className="btn sm ghost" onClick={() => void api(`/friends/requests/${r.id}`, { method: 'DELETE' }).then(() => requests.refetch())}>Cancel</button>
              </div>
            ))}
          </>
        )
      )}

      {tab === 'add' && (
        <>
          <form className="card col" onSubmit={(e: FormEvent) => { e.preventDefault(); void search(uid); }}>
            <label htmlFor="uid" className="bold">Search by UID</label>
            <div className="row">
              <input id="uid" className="input grow" placeholder="QW-8F29K7" autoCapitalize="characters" value={uid} onChange={(e) => (setUid(e.target.value), setSearchErr(null))} aria-invalid={!!searchErr} />
              <button className="btn primary" disabled={!uid.trim()}><Icon name="search" /></button>
            </div>
            {searchErr && <span className="field-error">{searchErr}</span>}
          </form>
          {found && (
            <div className="card row" style={{ animation: 'pop-in .25s' }}>
              <Avatar name={found.user.username} src={found.user.avatarThumbUrl} size={50} status={found.status as any} />
              <div className="grow"><b>{found.user.username}</b><p className="xs muted">{found.user.uid} · Lv {found.user.level}</p></div>
              {found.user.id !== me.id && (
                <>
                  <button className="btn sm soft" onClick={() => void addFriend(found.user)}>Add</button>
                  <button className="btn sm primary" onClick={() => setChallenge(found.user)}>⚔️</button>
                </>
              )}
            </div>
          )}
          <div className="row">
            <button className="btn outline grow" onClick={() => setQrOpen(true)}><Icon name="qr" /> My QR</button>
            <button className="btn outline grow" onClick={() => setScanOpen(true)}><Icon name="scan" /> Scan QR</button>
          </div>
        </>
      )}

      <ChallengeSheet target={challenge} onClose={() => setChallenge(null)} />

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="My QR code">
        <div className="col center">
          <QrCode value={profileLink(me.uid)} />
          <span className="uid-badge" style={{ margin: '8px auto 0' }}>{me.uid}</span>
          <p className="xs muted">Friends can scan this to add or challenge you. It only contains your public profile link.</p>
          <div className="row">
            <button className="btn soft grow" onClick={() => void navigator.clipboard?.writeText(me.uid).then(() => toast.success('UID copied'))}><Icon name="copy" /> Copy UID</button>
            <button className="btn primary grow" onClick={() => void share({ title: 'Add me on QUIZ WAR', text: `⚔️ Challenge me on QUIZ WAR! My UID: ${me.uid}`, url: profileLink(me.uid) })}><Icon name="share" /> Share</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title="Scan QR code">
        <QrScanner onUid={(u) => { setScanOpen(false); nav(`/u/${u}`); }} />
      </Sheet>
    </div>
  );
}
