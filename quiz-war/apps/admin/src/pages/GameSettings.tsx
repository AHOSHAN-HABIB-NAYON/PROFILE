import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Loading } from '../components/ui';
import { api, errMsg } from '../lib/api';

const SECTIONS: Record<string, string> = {
  match: 'Match (question count, timer, countdown)',
  scoring: 'Score, speed bonus & combo',
  rewards: 'XP, coins, daily & streak rewards',
  levels: 'Level XP curve',
  powerUps: 'Power-ups (availability, quantity, cost, cooldown)',
  matchmaking: 'Matchmaking & AI fallback timeout',
  ai: 'AI opponents (availability, difficulty, speed, accuracy)',
  disconnect: 'Disconnect grace period',
  penalties: 'Quit fines & AFK (coins/XP taken from players who leave)',
  ranked: 'Ranked, rating & leagues',
  battleRequests: 'Battle requests (expiry & limits)',
  survival: 'Survival mode',
  speedRound: 'Speed round',
  dailyChallenge: 'Daily challenge',
};

function Field({ path, value, onChange }: { path: string[]; value: any; onChange: (v: any) => void }) {
  const label = path[path.length - 1].replace(/([A-Z])/g, ' $1').toLowerCase();
  if (typeof value === 'boolean') return <label className="row small"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
  if (typeof value === 'number') return <div className="field"><label>{label}</label><input type="number" step="any" className="input" value={value} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} /></div>;
  if (typeof value === 'string') return <div className="field"><label>{label}</label><input className="input" value={value} onChange={(e) => onChange(e.target.value)} /></div>;
  return null;
}

/** Simple keys get typed inputs; nested objects/arrays get JSON editors (validated server-side). */
function SectionEditor({ name, value, onSaved }: { name: string; value: any; onSaved: () => void }) {
  const [draft, setDraft] = useState(value);
  const [json, setJson] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  useEffect(() => setDraft(value), [value]);
  const save = async () => {
    setMsg({});
    try {
      const body = { ...draft };
      for (const [k, v] of Object.entries(json)) body[k] = JSON.parse(v);
      await api(`/settings/game/${name}`, { method: 'PUT', body });
      setMsg({ ok: 'Saved. New matches use these values immediately.' });
      onSaved();
    } catch (e: any) {
      setMsg({ err: e instanceof SyntaxError ? 'Invalid JSON' : e.details?.[0] ? `${e.details[0].path.join?.('.') ?? e.details[0].path}: ${e.details[0].message}` : errMsg(e) });
    }
  };
  return (
    <section className="card">
      <h2>{SECTIONS[name] ?? name}</h2>
      <div className="form mt">
        <div className="cols">
          {Object.entries(draft).map(([k, v]) => (typeof v !== 'object' || v === null) && <Field key={k} path={[k]} value={v} onChange={(nv) => setDraft({ ...draft, [k]: nv })} />)}
        </div>
        {Object.entries(draft).filter(([, v]) => typeof v === 'object' && v !== null).map(([k, v]) => (
          <div key={k} className="field"><label>{k}</label><textarea className="input code" value={json[k] ?? JSON.stringify(v, null, 2)} onChange={(e) => setJson({ ...json, [k]: e.target.value })} aria-label={k} /></div>
        ))}
        {msg.ok && <p className="ok">{msg.ok}</p>}
        {msg.err && <p className="err">{msg.err}</p>}
        <div className="row"><button className="btn primary" onClick={() => void save()}>Save {name}</button><button className="btn ghost" onClick={() => (setDraft(value), setJson({}))}>Reset</button></div>
      </div>
    </section>
  );
}

export default function GameSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const [section, setSection] = useState('match');
  if (isLoading) return <Loading rows={10} />;
  return (
    <>
      <div className="head"><h1>Game settings</h1><span className="small faint">Every change is validated and written to the audit log</span></div>
      <div className="row" style={{ marginBottom: 12 }}>
        {Object.keys(SECTIONS).map((s) => <button key={s} className={`btn sm ${section === s ? 'primary' : ''}`} onClick={() => setSection(s)}>{s}</button>)}
      </div>
      <SectionEditor key={section} name={section} value={data.game[section]} onSaved={() => void qc.invalidateQueries({ queryKey: ['settings'] })} />
    </>
  );
}
