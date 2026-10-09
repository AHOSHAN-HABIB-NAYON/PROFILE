import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ACHIEVEMENT_ICONS, Icon, IconPicker, hasIcon } from '../components/Icon';
import { Loading, Modal, fmtDate } from '../components/ui';
import { api, errMsg } from '../lib/api';

/** Same key fallback the player app uses for achievements that still store an emoji. */
const ACH_BY_KEY: Record<string, string> = { first_victory: 'medal', wins_10: 'swords', wins_100: 'shield-check', correct_1000: 'target', win_streak_10: 'fire', matches_100: 'gamepad', champion_league: 'trophy', speed_demon: 'bolt', quiz_master: 'brain', daily_warrior: 'calendar', streak_7: 'calendar', streak_30: 'heart-pulse' };
const achIcon = (a: any) => (hasIcon(a.icon) ? a.icon : ACH_BY_KEY[a.ach_key] ?? 'award');

const METRICS = ['wins', 'total_correct', 'best_win_streak', 'total_games', 'peak_rating', 'fast_answers', 'level', 'daily_challenges_done', 'best_streak_days'];

function Achievements() {
  const list = useQuery({ queryKey: ['ach'], queryFn: () => api('/achievements') });
  const [edit, setEdit] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { key: f.get('key'), name: f.get('name'), description: f.get('description'), icon: f.get('icon'), metric: f.get('metric'), threshold: Number(f.get('threshold')), rewardCoins: Number(f.get('rewardCoins')), rewardXp: Number(f.get('rewardXp')), isActive: f.get('isActive') === 'on' };
    try {
      if (edit.id) await api(`/achievements/${edit.id}`, { method: 'PUT', body });
      else await api('/achievements', { body });
      setEdit(null);
      void list.refetch();
    } catch (e2) {
      setErr(errMsg(e2));
    }
  };
  return (
    <section className="card table-wrap">
      <div className="row"><h2 className="grow">Achievements</h2><button className="btn primary sm" onClick={() => (setErr(null), setEdit({ isActive: 1, icon: 'medal', metric: 'wins', threshold: 1, reward_coins: 0, reward_xp: 0 }))}><Icon name="plus" size={14} />Add achievement</button></div>
      {list.isLoading ? <Loading /> : (
        <table className="mt"><thead><tr><th>Icon</th><th>Name</th><th>Rule</th><th>Reward</th><th>Unlocked</th><th>Status</th><th /></tr></thead>
          <tbody>{list.data.items.map((a: any) => (
            <tr key={a.id}><td><span className="cat-ic"><Icon name={achIcon(a)} size={20} /></span></td><td><b>{a.name}</b><div className="small faint">{a.description}</div></td><td className="small"><code>{a.metric}</code> ≥ {a.threshold}</td><td className="small">{a.reward_coins} coins · {a.reward_xp} XP</td><td>{a.unlocked}</td><td>{a.is_active ? <span className="badge green">active</span> : <span className="badge">off</span>}</td><td><button className="btn sm" onClick={() => (setErr(null), setEdit(a))}>Edit</button></td></tr>
          ))}</tbody></table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit achievement' : 'New achievement'}>
        {edit && <form className="form" onSubmit={submit}>
          {err && <p className="err">{err}</p>}
          <div className="cols">
            <div className="field"><label htmlFor="ct-key">Key</label><input id="ct-key" name="key" className="input" required pattern="[a-z0-9_]{2,40}" defaultValue={edit.ach_key} /></div>
            <div className="field"><label htmlFor="ct-name">Name</label><input id="ct-name" name="name" className="input" required defaultValue={edit.name} /></div>
            <div className="field"><label htmlFor="ct-metric">Metric</label><select id="ct-metric" name="metric" className="input" defaultValue={edit.metric}>{METRICS.map((m) => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label htmlFor="ct-threshold">Threshold</label><input id="ct-threshold" name="threshold" type="number" min={1} className="input" defaultValue={edit.threshold} /></div>
            <div className="field"><label htmlFor="ct-rewardCoins">Reward coins</label><input id="ct-rewardCoins" name="rewardCoins" type="number" min={0} className="input" defaultValue={edit.reward_coins} /></div>
            <div className="field"><label htmlFor="ct-rewardXp">Reward XP</label><input id="ct-rewardXp" name="rewardXp" type="number" min={0} className="input" defaultValue={edit.reward_xp} /></div>
          </div>
          <div className="field"><label htmlFor="ct-description">Description</label><input id="ct-description" name="description" className="input" required maxLength={200} defaultValue={edit.description} /></div>
          <IconPicker name="icon" label="Icon" options={ACHIEVEMENT_ICONS} defaultValue={achIcon(edit)} />
          <label className="row"><input type="checkbox" name="isActive" defaultChecked={!!edit.is_active || edit.isActive} /> Active</label>
          <button className="btn primary">Save achievement</button>
        </form>}
      </Modal>
    </section>
  );
}

function Seasons() {
  const list = useQuery({ queryKey: ['seasons'], queryFn: () => api('/seasons') });
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await api('/seasons', { body: { name: f.get('name'), startsAt: f.get('startsAt'), endsAt: f.get('endsAt'), softResetFactor: Number(f.get('factor')) } });
      form.reset();
      void list.refetch();
    } catch (e2) {
      setErr(errMsg(e2));
    }
  };
  return (
    <section className="card table-wrap">
      <h2>Seasons</h2>
      <p className="small muted">One season is active at a time. When it ends, final ranks are saved, league rewards are paid and ratings are soft-reset towards the start rating. A new 30-day season starts automatically if none is scheduled.</p>
      {list.isLoading ? <Loading /> : (
        <table className="mt"><thead><tr><th>Name</th><th>Start</th><th>End</th><th>Status</th><th>Players</th><th>Soft reset</th><th /></tr></thead>
          <tbody>{list.data.items.map((s: any) => (
            <tr key={s.id}><td><b>{s.name}</b></td><td className="small">{fmtDate(s.starts_at)}</td><td className="small">{fmtDate(s.ends_at)}</td><td><span className={`badge ${s.status === 'active' ? 'green' : ''}`}>{s.status}</span></td><td>{s.players}</td><td>{s.soft_reset_factor}</td>
              <td>{s.status === 'active' && <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => confirm('End this season now? Rewards are paid and ratings soft-reset.') && void api(`/seasons/${s.id}/end`, { method: 'POST' }).then(() => list.refetch())}>End now</button>}</td></tr>
          ))}</tbody></table>
      )}
      <form className="form mt" onSubmit={submit}>
        <h3>Schedule a season</h3>
        {err && <p className="err">{err}</p>}
        <div className="cols">
          <div className="field"><label htmlFor="ct-name">Name</label><input id="ct-name" name="name" className="input" required /></div>
          <div className="field"><label htmlFor="ct-startsAt">Starts</label><input id="ct-startsAt" name="startsAt" type="datetime-local" className="input" required /></div>
          <div className="field"><label htmlFor="ct-endsAt">Ends</label><input id="ct-endsAt" name="endsAt" type="datetime-local" className="input" required /></div>
          <div className="field"><label htmlFor="ct-factor">Soft reset factor (0–1)</label><input id="ct-factor" name="factor" type="number" step="0.05" min={0} max={1} defaultValue={0.5} className="input" /></div>
        </div>
        <button className="btn primary">Create season</button>
      </form>
    </section>
  );
}

function ShopItems() {
  const list = useQuery({ queryKey: ['shop-admin'], queryFn: () => api('/shop') });
  const [edit, setEdit] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const body = { key: f.get('key'), type: f.get('type'), name: f.get('name'), description: f.get('description') || null, price: Number(f.get('price')), data: f.get('data') ? JSON.parse(String(f.get('data'))) : null, isActive: f.get('isActive') === 'on' };
      if (edit.id) await api(`/shop/${edit.id}`, { method: 'PUT', body });
      else await api('/shop', { body });
      setEdit(null);
      void list.refetch();
    } catch (e2) {
      setErr(e2 instanceof SyntaxError ? 'Data must be valid JSON' : errMsg(e2));
    }
  };
  return (
    <section className="card table-wrap">
      <div className="row"><h2 className="grow">Shop & power-up items</h2><button className="btn primary sm" onClick={() => (setErr(null), setEdit({ type: 'frame', is_active: 1, price: 100 }))}><Icon name="plus" size={14} />Add item</button></div>
      <p className="small muted">Cosmetic, non-pay-to-win items. Power-ups are disabled in ranked by default (Game settings › powerUps).</p>
      {list.isLoading ? <Loading /> : (
        <table className="mt"><thead><tr><th>Key</th><th>Type</th><th>Name</th><th>Price</th><th>Status</th><th /></tr></thead>
          <tbody>{list.data.items.map((i: any) => <tr key={i.id}><td><code>{i.item_key}</code></td><td>{i.type}</td><td>{i.name}</td><td><span className="inline-ic"><Icon name="coins" size={16} label="Coins" />{i.price}</span></td><td>{i.is_active ? <span className="badge green">active</span> : <span className="badge">off</span>}</td><td><button className="btn sm" onClick={() => (setErr(null), setEdit(i))}>Edit</button></td></tr>)}</tbody></table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit item' : 'New item'}>
        {edit && <form className="form" onSubmit={submit}>
          {err && <p className="err">{err}</p>}
          <div className="cols">
            <div className="field"><label htmlFor="ct-key">Key</label><input id="ct-key" name="key" className="input" required pattern="[a-z0-9_]{2,40}" defaultValue={edit.item_key} /></div>
            <div className="field"><label htmlFor="ct-type">Type</label><select id="ct-type" name="type" className="input" defaultValue={edit.type}>{['avatar', 'frame', 'theme', 'title', 'effect', 'power_up'].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label htmlFor="ct-name">Name</label><input id="ct-name" name="name" className="input" required defaultValue={edit.name} /></div>
            <div className="field"><label htmlFor="ct-price">Price (coins)</label><input id="ct-price" name="price" type="number" min={0} className="input" defaultValue={edit.price} /></div>
          </div>
          <div className="field"><label htmlFor="ct-description">Description</label><input id="ct-description" name="description" className="input" defaultValue={edit.description ?? ''} /></div>
          <div className="field"><label htmlFor="ct-data">Data (JSON, e.g. {'{"css":"gold"}'} or {'{"text":"Scholar"}'})</label><textarea id="ct-data" name="data" className="input code" defaultValue={edit.data ? JSON.stringify(edit.data) : ''} /></div>
          <label className="row"><input type="checkbox" name="isActive" defaultChecked={!!edit.is_active} /> Active</label>
          <button className="btn primary">Save item</button>
        </form>}
      </Modal>
    </section>
  );
}

export default function Content() {
  const [tab, setTab] = useState<'ach' | 'seasons' | 'shop'>('ach');
  return (
    <>
      <div className="head"><h1>Achievements, seasons & shop</h1><div className="tabs"><button aria-selected={tab === 'ach'} onClick={() => setTab('ach')}>Achievements</button><button aria-selected={tab === 'seasons'} onClick={() => setTab('seasons')}>Seasons</button><button aria-selected={tab === 'shop'} onClick={() => setTab('shop')}>Shop</button></div></div>
      {tab === 'ach' ? <Achievements /> : tab === 'seasons' ? <Seasons /> : <ShopItems />}
    </>
  );
}
