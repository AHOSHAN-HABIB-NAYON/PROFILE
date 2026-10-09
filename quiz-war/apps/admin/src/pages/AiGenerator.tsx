import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Loading, Pager, fmtDate } from '../components/ui';
import { api, errMsg } from '../lib/api';
import { useAdmin } from '../lib/auth';

const DIFFS = ['mixed', 'easy', 'medium', 'hard', 'expert'];
type Tab = 'generate' | 'review' | 'settings';

function JobStatus({ s }: { s: string }) {
  const cls = { done: 'green', running: 'blue', queued: 'blue', failed: 'red', cancelled: '' }[s] ?? '';
  return <span className={`badge ${cls}`}>{s === 'running' ? '⏳ running' : s}</span>;
}

/* ------------------------------- Generate ------------------------------- */

function Generate({ categories, onReview }: { categories: any[]; onReview: (jobId: number) => void }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['ai-settings'], queryFn: () => api('/ai/settings') });
  const stats = useQuery({ queryKey: ['bank-stats'], queryFn: async () => (await api('/questions/bank-stats')).items as any[] });
  const jobs = useQuery({
    queryKey: ['ai-jobs'],
    queryFn: async () => (await api('/ai/jobs')).items as any[],
    refetchInterval: (q) => ((q.state.data as any[] | undefined)?.some((j) => j.status === 'queued' || j.status === 'running') ? 3000 : false),
  });
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  const running = jobs.data?.some((j) => j.status === 'running' || j.status === 'queued');
  useEffect(() => {
    if (!running) void qc.invalidateQueries({ queryKey: ['bank-stats'] });
  }, [running, qc]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg({});
    try {
      const r = await api('/ai/jobs', {
        body: {
          categoryId: Number(f.get('categoryId')),
          topic: String(f.get('topic') || '') || null,
          difficulty: f.get('difficulty'),
          language: f.get('language'),
          count: Number(f.get('count')),
          instructions: String(f.get('instructions') || '') || null,
          webSearch: f.get('webSearch') === 'on',
        },
      });
      setMsg({ ok: `Job #${r.id} started. Questions appear in the Review tab as they are written.` });
      void qc.invalidateQueries({ queryKey: ['ai-jobs'] });
    } catch (e2) {
      setMsg({ err: errMsg(e2) });
    } finally {
      setBusy(false);
    }
  };

  const s = settings.data;
  return (
    <>
      {s && !s.apiKeyConfigured && (
        <div className="card" style={{ borderColor: 'var(--warning, #d97706)' }}>
          <b>OpenAI API key missing.</b>
          <p className="small muted">Add <code>OPENAI_API_KEY</code> in Hostinger → Node.js app → Environment variables, then restart the app. The key stays on the server and is never shown to players.</p>
        </div>
      )}
      <div className="grid2">
        <form className="card form" onSubmit={submit}>
          <h2>Generate questions with AI</h2>
          <p className="small muted">The AI researches the web, writes exam-style questions with explanations and sources, and skips anything that already exists. New questions wait for your review before players see them.</p>
          <div className="cols">
            <div className="field"><label htmlFor="g-cat">Category</label>
              <select id="g-cat" name="categoryId" className="input" required>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}{c.nameBn ? ` · ${c.nameBn}` : ''}</option>)}</select>
            </div>
            <div className="field"><label htmlFor="g-count">How many</label><input id="g-count" name="count" type="number" min={1} max={200} defaultValue={50} className="input" required /></div>
            <div className="field"><label htmlFor="g-diff">Difficulty</label><select id="g-diff" name="difficulty" className="input" defaultValue="mixed">{DIFFS.map((d) => <option key={d}>{d}</option>)}</select></div>
            <div className="field"><label htmlFor="g-lang">Language</label><select id="g-lang" name="language" className="input" defaultValue="bn"><option value="bn">বাংলা</option><option value="en">English</option></select></div>
          </div>
          <div className="field"><label htmlFor="g-topic">Topic (optional)</label><input id="g-topic" name="topic" className="input" placeholder="e.g. মুক্তিযুদ্ধ ১৯৭১, সংবিধান, ব্যাংকিং পরিভাষা" maxLength={300} /></div>
          <div className="field"><label htmlFor="g-ins">Extra instructions (optional)</label><textarea id="g-ins" name="instructions" className="input" rows={3} maxLength={2000} placeholder="e.g. Focus on questions asked in 40th–46th BCS preliminary" /></div>
          <label className="row small"><input type="checkbox" name="webSearch" defaultChecked={s?.settings.webSearch ?? true} /> Research on the web (more accurate, slower)</label>
          {msg.ok && <p className="ok">{msg.ok}</p>}
          {msg.err && <p className="err">{msg.err}</p>}
          <button className="btn primary" disabled={busy || !s?.apiKeyConfigured}>{busy ? 'Starting…' : '✨ Generate'}</button>
          <p className="small faint">Model: <b>{s?.settings.model ?? '…'}</b> · change it in the Settings tab.</p>
        </form>

        <section className="card">
          <h2>Question bank</h2>
          <p className="small muted">Aim for 1,500+ new questions a month so active players never run out. Players never see a question twice until they have played the whole category.</p>
          {stats.isLoading ? <Loading /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Category</th><th>Live</th><th>Waiting review</th><th>Added (30 days)</th></tr></thead>
              <tbody>{stats.data?.map((c) => (
                <tr key={c.id}><td>{c.icon} {c.name}</td><td><b>{c.live}</b>{c.live < 300 && <span className="badge amber" style={{ marginLeft: 6 }}>low</span>}</td><td>{c.pending || '—'}</td><td>{c.last30}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Recent jobs</h2>
        {jobs.isLoading ? <Loading /> : !jobs.data?.length ? <p className="muted small">No jobs yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Category / topic</th><th>Progress</th><th>Skipped</th><th>Status</th><th>Model</th><th>Tokens</th><th>Started</th><th /></tr></thead>
            <tbody>{jobs.data.map((j) => (
              <tr key={j.id}>
                <td className="faint">{j.id}</td>
                <td>{j.category}{j.topic && <div className="small muted">{j.topic}</div>}<div className="small faint">{j.difficulty} · {j.language}{j.webSearch ? ' · 🌐' : ''}</div></td>
                <td><b>{j.created}</b> / {j.requested}<div className="bar"><span style={{ width: `${Math.min(100, (j.created / j.requested) * 100)}%` }} /></div></td>
                <td className="small">{j.duplicates} dup · {j.invalid} invalid</td>
                <td><JobStatus s={j.status} />{j.error && <div className="small err" style={{ maxWidth: 260 }}>{j.error}</div>}</td>
                <td className="small">{j.model}</td>
                <td className="small">{(j.inputTokens + j.outputTokens).toLocaleString()}</td>
                <td className="small">{fmtDate(j.createdAt)}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  {j.pending > 0 && <button className="btn sm primary" onClick={() => onReview(j.id)}>Review {j.pending}</button>}
                  {(j.status === 'running' || j.status === 'queued') && <button className="btn sm" onClick={() => void api(`/ai/jobs/${j.id}/cancel`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['ai-jobs'] }))}>Stop</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}

/* -------------------------------- Review -------------------------------- */

function Review({ categories, jobId, setJobId }: { categories: any[]; jobId: number | null; setJobId: (id: number | null) => void }) {
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const params = new URLSearchParams({ review: 'pending', page: String(page), pageSize: '20', ...(categoryId ? { categoryId } : {}), ...(jobId ? { aiJobId: String(jobId) } : {}) });
  const list = useQuery({ queryKey: ['review', params.toString()], queryFn: () => api(`/questions?${params}`) });
  const items: any[] = list.data?.items ?? [];
  const decide = async (ids: number[], action: 'approve' | 'reject') => {
    if (!ids.length) return;
    try {
      const r = await api('/questions/review', { body: { ids, action } });
      setMsg(`${r.updated} question${r.updated === 1 ? '' : 's'} ${action === 'approve' ? 'published' : 'rejected'}.`);
      setSel(new Set());
      void qc.invalidateQueries({ queryKey: ['review'] });
      void qc.invalidateQueries({ queryKey: ['bank-stats'] });
      void qc.invalidateQueries({ queryKey: ['ai-jobs'] });
    } catch (e) {
      setMsg(errMsg(e));
    }
  };
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <select className="input" style={{ maxWidth: 220 }} aria-label="Category" value={categoryId} onChange={(e) => (setCategoryId(e.target.value), setPage(1))}>
          <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        {jobId && <span className="badge blue">Job #{jobId} <button className="btn ghost sm" onClick={() => setJobId(null)} aria-label="Clear job filter">✕</button></span>}
        <span className="small muted">{list.data?.total ?? 0} waiting</span>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setSel(sel.size === items.length ? new Set() : new Set(items.map((q) => q.id)))}>{sel.size === items.length && items.length ? 'Clear selection' : 'Select page'}</button>
        <button className="btn sm primary" disabled={!sel.size} onClick={() => void decide([...sel], 'approve')}>✓ Approve {sel.size || ''}</button>
        <button className="btn sm" disabled={!sel.size} style={{ color: 'var(--danger)' }} onClick={() => void decide([...sel], 'reject')}>✕ Reject {sel.size || ''}</button>
      </div>
      {msg && <p className="ok">{msg}</p>}
      {list.isLoading ? <Loading /> : !items.length ? (
        <div className="card"><p className="muted">Nothing waiting for review. Generate questions in the Generate tab.</p></div>
      ) : (
        <div className="review-list">
          {items.map((q) => (
            <article key={q.id} className={`card review ${sel.has(q.id) ? 'selected' : ''}`}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={sel.has(q.id)} onChange={() => toggle(q.id)} aria-label={`Select question ${q.id}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small faint">#{q.id} · {q.category} · <span className="badge">{q.difficulty}</span></div>
                  <p className="q-text">{q.text}</p>
                  <ol className="opts">{q.options.map((o: string, i: number) => <li key={i} className={i === q.correctIndex ? 'correct' : ''}>{'কখগঘ'[i]}. {o}{i === q.correctIndex && ' ✓'}</li>)}</ol>
                  {q.explanation && <p className="small muted">💡 {q.explanation}</p>}
                  {q.sourceRefs?.length > 0 && <p className="small">{q.sourceRefs.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer noopener" style={{ marginRight: 8 }}>🔗 {new URL(u).hostname}</a>)}</p>}
                </div>
                <div className="col-actions">
                  <button className="btn sm primary" onClick={() => void decide([q.id], 'approve')}>Approve</button>
                  <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => void decide([q.id], 'reject')}>Reject</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {list.data && <Pager page={page} setPage={setPage} hasMore={page * 20 < list.data.total} total={list.data.total} pageSize={20} />}
      <p className="small faint mt">Tip: to fix a small mistake, approve it and then edit it from the Questions page.</p>
    </>
  );
}

/* ------------------------------- Settings ------------------------------- */

function Settings({ categories }: { categories: any[] }) {
  const { can } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ai-settings'], queryFn: () => api('/ai/settings') });
  const [draft, setDraft] = useState<any>(null);
  const [guideCat, setGuideCat] = useState<string>('');
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [test, setTest] = useState<string | null>(null);
  useEffect(() => {
    if (q.data && !draft) setDraft(q.data.settings);
  }, [q.data, draft]);
  if (!q.data || !draft) return <Loading />;
  const defaults = q.data.defaults;
  const slug = guideCat || categories[0]?.slug;
  const set = (k: string, v: unknown) => setDraft({ ...draft, [k]: v });
  const save = async () => {
    setMsg({});
    try {
      const r = await api('/ai/settings', { method: 'PUT', body: draft });
      setDraft(r);
      setMsg({ ok: 'Saved.' });
      void qc.invalidateQueries({ queryKey: ['ai-settings'] });
    } catch (e) {
      setMsg({ err: errMsg(e) });
    }
  };
  const runTest = async () => {
    setTest('Testing…');
    try {
      const r = await api('/ai/test', { body: { model: draft.model } });
      setTest(`✓ Connected to ${r.model} in ${(r.ms / 1000).toFixed(1)}s — reply: “${r.reply}”`);
    } catch (e) {
      setTest(`✕ ${errMsg(e)}`);
    }
  };
  const editable = can('settings.app');
  return (
    <section className="card form">
      <h2>AI settings</h2>
      {!editable && <p className="small muted">Only admins with “App settings” permission can change these.</p>}
      <fieldset disabled={!editable} className="form" style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="cols">
          <div className="field"><label htmlFor="ai-model">Model</label><input id="ai-model" className="input" value={draft.model} onChange={(e) => set('model', e.target.value)} placeholder={defaults.model} /></div>
          <div className="field"><label htmlFor="ai-eff">Reasoning effort</label><select id="ai-eff" className="input" value={draft.reasoningEffort} onChange={(e) => set('reasoningEffort', e.target.value)}>{['default', 'low', 'medium', 'high'].map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label htmlFor="ai-batch">Questions per request</label><input id="ai-batch" type="number" min={3} max={25} className="input" value={draft.batchSize} onChange={(e) => set('batchSize', Number(e.target.value))} /></div>
        </div>
        <label className="row small"><input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} /> AI generator enabled</label>
        <label className="row small"><input type="checkbox" checked={draft.webSearch} onChange={(e) => set('webSearch', e.target.checked)} /> Web research by default</label>
        <label className="row small"><input type="checkbox" checked={draft.autoApprove} onChange={(e) => set('autoApprove', e.target.checked)} /> Publish without review (not recommended — AI can make mistakes)</label>
        <div className="field">
          <label htmlFor="ai-sys">Master instructions (system prompt)</label>
          <textarea id="ai-sys" className="input code" rows={14} value={draft.systemPrompt || defaults.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} />
          <div className="row"><button type="button" className="btn sm ghost" onClick={() => set('systemPrompt', '')}>Reset to default</button></div>
        </div>
        <div className="field">
          <label htmlFor="ai-guide-cat">Syllabus guide per category</label>
          <select id="ai-guide-cat" className="input" style={{ maxWidth: 260 }} value={slug} onChange={(e) => setGuideCat(e.target.value)}>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>)}</select>
          <textarea aria-label="Category guide" className="input" rows={4} value={draft.categoryGuides[slug] ?? ''} placeholder={defaults.categoryGuides[slug] ?? 'Describe the syllabus focus for this category'}
            onChange={(e) => set('categoryGuides', { ...draft.categoryGuides, [slug]: e.target.value })} />
          <p className="small faint">Leave empty to use the built-in guide shown in grey.</p>
        </div>
      </fieldset>
      {msg.ok && <p className="ok">{msg.ok}</p>}
      {msg.err && <p className="err">{msg.err}</p>}
      <div className="row">
        {editable && <button className="btn primary" onClick={() => void save()}>Save settings</button>}
        <button className="btn" onClick={() => void runTest()} disabled={!q.data.apiKeyConfigured}>Test connection</button>
        {test && <span className="small">{test}</span>}
      </div>
    </section>
  );
}

export default function AiGenerator() {
  const [tab, setTab] = useState<Tab>('generate');
  const [jobId, setJobId] = useState<number | null>(null);
  const cats = useQuery({ queryKey: ['categories'], queryFn: async () => (await api('/categories')).items as any[] });
  return (
    <>
      <div className="head"><h1>AI question generator</h1><span className="small faint">OpenAI · web research · review before publishing</span></div>
      <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
        {(['generate', 'review', 'settings'] as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{{ generate: '✨ Generate', review: '✅ Review queue', settings: '⚙️ Settings' }[t]}</button>)}
      </div>
      {!cats.data ? <Loading /> : tab === 'generate' ? <Generate categories={cats.data} onReview={(id) => (setJobId(id), setTab('review'))} />
        : tab === 'review' ? <Review categories={cats.data} jobId={jobId} setJobId={setJobId} /> : <Settings categories={cats.data} />}
    </>
  );
}
