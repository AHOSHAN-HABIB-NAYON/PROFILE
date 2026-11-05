import type { AppSettings as App } from '@quizwar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Loading } from '../components/ui';
import { api, errMsg } from '../lib/api';

type Code = { code: string; days: number; maxUses: number; uses: number; note: string | null; expiresAt: string | null; createdAt: string };
type Purchase = { userId: number; uid: string; username: string | null; productId: string; state: string; expiresAt: string | null; autoRenew: number; updatedAt: string };
type Data = { stats: { active: number; forever: number; paying: number }; codes: Code[]; purchases: Purchase[]; canVerifyPlay: boolean; rtdn: boolean };

const STATE: Record<string, string> = {
  SUBSCRIPTION_STATE_ACTIVE: 'Active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'Grace period',
  SUBSCRIPTION_STATE_CANCELED: 'Cancelled (runs to end)',
  SUBSCRIPTION_STATE_ON_HOLD: 'On hold (payment failed)',
  SUBSCRIPTION_STATE_EXPIRED: 'Expired',
  SUBSCRIPTION_STATE_REVOKED: 'Refunded',
  SUBSCRIPTION_STATE_REPLACED: 'Replaced',
  SUBSCRIPTION_STATE_PENDING: 'Pending payment',
};
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

/** Premium: sale switch, what is locked, redeem codes, Play purchases. */
export default function Premium() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const data = useQuery({ queryKey: ['premium'], queryFn: () => api<Data>('/premium') });
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [codeMsg, setCodeMsg] = useState<{ ok?: string; err?: string }>({});
  const [newCodes, setNewCodes] = useState<string[]>([]);
  if (settings.isLoading || data.isLoading) return <Loading rows={8} />;
  if (settings.error || !settings.data) return <p className="err">{errMsg(settings.error)}</p>;
  const a = settings.data.app as App;
  const d = data.data;

  const saveSettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setMsg({});
    try {
      await api('/settings/app', {
        method: 'PUT',
        body: {
          premiumEnabled: f.get('premiumEnabled') === 'on',
          premiumProductId: String(f.get('premiumProductId') || 'premium_monthly').trim(),
          premiumCalls: f.get('premiumCalls') === 'on',
          premiumVoiceMessages: f.get('premiumVoiceMessages') === 'on',
          premiumPhotos: f.get('premiumPhotos') === 'on',
          premiumLiveMic: f.get('premiumLiveMic') === 'on',
          monthlyPremiumTop: Number(f.get('monthlyPremiumTop') || 0),
        },
      });
      setMsg({ ok: 'Saved.' });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e2) {
      setMsg({ err: errMsg(e2) });
    }
  };
  const makeCodes = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setCodeMsg({});
    try {
      const r = await api<{ codes: string[] }>('/premium/codes', {
        body: { count: Number(f.get('count') || 1), days: Number(f.get('days') || 30), maxUses: Number(f.get('maxUses') || 1), note: String(f.get('note') || '') || null, validDays: Number(f.get('validDays') || 0) || null },
      });
      setNewCodes(r.codes);
      setCodeMsg({ ok: `${r.codes.length} code(s) made.` });
      void data.refetch();
    } catch (e2) {
      setCodeMsg({ err: errMsg(e2) });
    }
  };
  const del = async (c: Code) => {
    if (!confirm(`Delete code ${c.code}?`)) return;
    await api(`/premium/codes/${c.code}`, { method: 'DELETE' }).catch((e2) => alert(errMsg(e2)));
    void data.refetch();
  };

  return (
    <>
      <div className="head"><h1>Premium</h1><span className="small faint">Monthly Google Play subscription, redeem codes and free gifts.</span></div>
      {d && (
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="card" style={{ minWidth: 160 }}><p className="small muted">Premium now (timed)</p><h2>{d.stats.active}</h2></div>
          <div className="card" style={{ minWidth: 160 }}><p className="small muted">Paying on Google Play</p><h2>{d.stats.paying}</h2></div>
          <div className="card" style={{ minWidth: 160 }}><p className="small muted">Premium for good (badge)</p><h2>{d.stats.forever}</h2></div>
        </div>
      )}
      <div className="settings-grid">
        <form className="card form" onSubmit={(e) => void saveSettings(e)} aria-label="Premium settings">
          <div className="card-head"><span className="cat-ic"><Icon name="crown" size={20} /></span><div><h2>Sell premium</h2><p className="small muted">Turn on after the subscription is active in Play Console. While off, everything stays free and the Premium page is hidden.</p></div></div>
          <label className="switch"><input type="checkbox" name="premiumEnabled" defaultChecked={!!a.premiumEnabled} /><span>Premium on (sell + lock the features below)</span></label>
          <div className="field" style={{ maxWidth: 320 }}><label htmlFor="pr-id">Play subscription product ID</label><input id="pr-id" name="premiumProductId" className="input" defaultValue={a.premiumProductId ?? 'premium_monthly'} maxLength={100} /><span className="small faint">Play Console → Monetize → Subscriptions. Must match exactly.</span></div>
          <p className="small bold" style={{ marginTop: 8 }}>Needs premium (text chat is always free):</p>
          <label className="switch"><input type="checkbox" name="premiumCalls" defaultChecked={a.premiumCalls !== false} /><span>Audio calls<small>Starting or adding people to a call. Answering stays free.</small></span></label>
          <label className="switch"><input type="checkbox" name="premiumVoiceMessages" defaultChecked={a.premiumVoiceMessages !== false} /><span>Voice messages in chat</span></label>
          <label className="switch"><input type="checkbox" name="premiumPhotos" defaultChecked={a.premiumPhotos !== false} /><span>Sending photos in chat</span></label>
          <label className="switch"><input type="checkbox" name="premiumLiveMic" defaultChecked={a.premiumLiveMic !== false} /><span>Talking in quiz / Ludo games and rooms<small>Everyone can still listen; the mic needs premium.</small></span></label>
          <div className="field" style={{ maxWidth: 260 }}><label htmlFor="pr-top">Monthly reward: top players</label><input id="pr-top" name="monthlyPremiumTop" type="number" min={0} max={100} className="input" defaultValue={a.monthlyPremiumTop ?? 5} /><span className="small faint">The top N of last month's leaderboard get 30 days free, automatically on the 1st. 0 = off.</span></div>
          {d && (
            <p className="small" style={{ color: d.canVerifyPlay ? 'var(--success)' : 'var(--danger)' }}>
              {d.canVerifyPlay ? 'Purchase checking is set up.' : 'Add PLAY_SERVICE_ACCOUNT_JSON on the server so purchases can be checked.'}
              {d.rtdn ? ' Real-time notifications on.' : ' (Optional: PLAY_RTDN_SECRET for renewals/refunds in real time.)'}
            </p>
          )}
          <div className="row"><button className="btn primary">Save premium</button><span className="small" role="status" style={{ color: 'var(--success)', fontWeight: 700 }}>{msg.ok}</span></div>
          {msg.err && <p className="err" role="alert">{msg.err}</p>}
        </form>

        <form className="card form" onSubmit={(e) => void makeCodes(e)} aria-label="Redeem codes">
          <div className="card-head"><span className="cat-ic"><Icon name="gift" size={20} /></span><div><h2>Make redeem codes</h2><p className="small muted">Players enter a code on the Premium page to get free premium days (gifts, contests, Facebook giveaways).</p></div></div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ width: 110 }}><label htmlFor="c-n">How many</label><input id="c-n" name="count" type="number" min={1} max={100} defaultValue={1} className="input" /></div>
            <div className="field" style={{ width: 110 }}><label htmlFor="c-d">Days</label><input id="c-d" name="days" type="number" min={1} max={365} defaultValue={30} className="input" /></div>
            <div className="field" style={{ width: 130 }}><label htmlFor="c-u">Uses per code</label><input id="c-u" name="maxUses" type="number" min={1} max={100000} defaultValue={1} className="input" /></div>
            <div className="field" style={{ width: 150 }}><label htmlFor="c-v">Valid for (days)</label><input id="c-v" name="validDays" type="number" min={0} max={3650} defaultValue={30} className="input" /><span className="small faint">0 = no end</span></div>
          </div>
          <div className="field"><label htmlFor="c-note">Note (only you see it)</label><input id="c-note" name="note" maxLength={120} className="input" placeholder="e.g. Facebook giveaway" /></div>
          <div className="row"><button className="btn primary">Make codes</button><span className="small" role="status" style={{ color: 'var(--success)', fontWeight: 700 }}>{codeMsg.ok}</span></div>
          {codeMsg.err && <p className="err" role="alert">{codeMsg.err}</p>}
          {newCodes.length > 0 && (
            <textarea className="input" readOnly rows={Math.min(8, newCodes.length + 1)} value={newCodes.join('\n')} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: 'monospace' }} aria-label="New codes" />
          )}
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Codes</h2>
        {!d?.codes.length ? <p className="small muted">No codes yet.</p> : (
          <table className="table">
            <thead><tr><th>Code</th><th>Days</th><th>Used</th><th>Valid until</th><th>Note</th><th /></tr></thead>
            <tbody>
              {d.codes.map((c) => (
                <tr key={c.code}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.code}</td>
                  <td>{c.days}</td>
                  <td>{c.uses} / {c.maxUses}</td>
                  <td>{day(c.expiresAt)}</td>
                  <td className="small">{c.note}</td>
                  <td><button className="btn sm" onClick={() => void del(c)}><Icon name="trash" size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Google Play purchases</h2>
        {!d?.purchases.length ? <p className="small muted">No purchases yet.</p> : (
          <table className="table">
            <thead><tr><th>Player</th><th>Status</th><th>Until</th><th>Renews</th><th>Updated</th></tr></thead>
            <tbody>
              {d.purchases.map((p, i) => (
                <tr key={i}>
                  <td><a href={`users/${p.userId}`}>{p.username ?? 'Player'}</a> <span className="small faint">{p.uid}</span></td>
                  <td>{STATE[p.state] ?? p.state}</td>
                  <td>{day(p.expiresAt)}</td>
                  <td>{p.autoRenew ? 'Yes' : 'No'}</td>
                  <td className="small">{new Date(p.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
