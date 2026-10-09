import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Loading, Modal, Pager } from '../components/ui';
import { Icon } from '../components/Icon';
import { api, errMsg } from '../lib/api';
import { useAdmin } from '../lib/auth';

const DIFFS = ['easy', 'medium', 'hard', 'expert'];

function QuestionForm({ id, categories, onDone }: { id: number | null; categories: any[]; onDone: () => void }) {
  const existing = useQuery({ queryKey: ['question', id], queryFn: () => api(`/questions/${id}`), enabled: !!id });
  const [err, setErr] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(undefined);
  if (id && existing.isLoading) return <Loading />;
  const q = existing.data ?? { categoryId: categories[0]?.id, difficulty: 'medium', language: 'bn', text: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', hint: '', isActive: true, imageUrl: null };
  const img = imageUrl === undefined ? q.imageUrl : imageUrl;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      categoryId: Number(f.get('categoryId')),
      difficulty: f.get('difficulty'),
      language: f.get('language'),
      text: f.get('text'),
      options: [0, 1, 2, 3].map((i) => String(f.get(`opt${i}`) ?? '')),
      correctIndex: Number(f.get('correct')),
      explanation: String(f.get('explanation') || '') || null,
      hint: String(f.get('hint') || '') || null,
      imageUrl: img || null,
      isActive: f.get('isActive') === 'on',
    };
    try {
      if (id) await api(`/questions/${id}`, { method: 'PUT', body });
      else await api('/questions', { body });
      onDone();
    } catch (e2: any) {
      setErr(e2.details?.[0] ? `${e2.details[0].path}: ${e2.details[0].message}` : errMsg(e2));
    }
  };
  return (
    <form className="form" onSubmit={submit}>
      {err && <p className="err">{err}</p>}
      <div className="cols">
        <div className="field"><label htmlFor="c">Category</label><select id="c" name="categoryId" className="input" defaultValue={q.categoryId}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="d">Difficulty</label><select id="d" name="difficulty" className="input" defaultValue={q.difficulty}>{DIFFS.map((d) => <option key={d}>{d}</option>)}</select></div>
        <div className="field"><label htmlFor="l">Language</label><select id="l" name="language" className="input" defaultValue={q.language}><option value="bn">বাংলা</option><option value="en">English</option></select></div>
      </div>
      <div className="field"><label htmlFor="t">Question</label><textarea id="t" name="text" className="input" required minLength={3} maxLength={1000} defaultValue={q.text} /></div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small" style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>Options — select the correct one</legend>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <input type="radio" name="correct" value={i} defaultChecked={q.correctIndex === i} aria-label={`Option ${'ABCD'[i]} is correct`} />
            <b>{'ABCD'[i]}</b>
            <input name={`opt${i}`} className="input grow" required maxLength={300} defaultValue={q.options[i]} aria-label={`Option ${'ABCD'[i]}`} />
          </div>
        ))}
      </fieldset>
      <div className="field"><label htmlFor="ex">Explanation (shown in review)</label><textarea id="ex" name="explanation" className="input" maxLength={2000} defaultValue={q.explanation ?? ''} /></div>
      <div className="field"><label htmlFor="h">Hint (used by the Hint power-up)</label><input id="h" name="hint" className="input" maxLength={300} defaultValue={q.hint ?? ''} /></div>
      <div className="field">
        <label>Image (optional — keep important text in the question, not the image)</label>
        <div className="row">
          {img && <img src={img} alt="" style={{ height: 64, borderRadius: 8 }} />}
          <input type="file" accept="image/*" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.append('file', file);
            try { setImageUrl((await api('/questions/image', { form })).url); } catch (e2) { setErr(errMsg(e2)); }
          }} />
          {img && <button type="button" className="btn sm" onClick={() => setImageUrl(null)}>Remove</button>}
        </div>
      </div>
      <label className="row"><input type="checkbox" name="isActive" defaultChecked={q.isActive} /> Active (served in games)</label>
      <button className="btn primary">{id ? 'Save changes' : 'Create question'}</button>
    </form>
  );
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [content, setContent] = useState('');
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="form">
      <p className="small muted">CSV header: <code>category,difficulty,language,text,option_a,option_b,option_c,option_d,correct,explanation,hint,image_url</code> — category is a slug/name/id, correct is A–D. JSON: <code>{'{"questions":[{category, difficulty, language, text, options:[4], correctIndex, explanation, hint}]}'}</code>. Duplicates (same text in the same category) are skipped.</p>
      <div className="tabs"><button aria-selected={format === 'csv'} onClick={() => setFormat('csv')}>CSV</button><button aria-selected={format === 'json'} onClick={() => setFormat('json')}>JSON</button></div>
      <input type="file" accept={format === 'csv' ? '.csv,text/csv' : '.json,application/json'} onChange={async (e) => { const f = e.target.files?.[0]; if (f) setContent(await f.text()); }} />
      <textarea className="input code" aria-label="Import content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="…or paste here" />
      {err && <p className="err">{err}</p>}
      {res && (
        <div className={res.errors.length ? 'err' : 'ok'}>
          Imported {res.created} of {res.total} · {res.skipped} duplicates skipped · {res.errors.length} errors
          {res.errors.slice(0, 20).map((e: any) => <div key={e.row} className="small">Row {e.row}: {e.message}</div>)}
        </div>
      )}
      <button className="btn primary" disabled={!content || busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { setRes(await api('/questions/import', { body: { format, content } })); onDone(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
      }}>{busy ? 'Importing…' : 'Import questions'}</button>
    </div>
  );
}

export default function Questions() {
  const { can } = useAdmin();
  const qc = useQueryClient();
  const [f, setF] = useState({ q: '', categoryId: '', difficulty: '', active: '' });
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<number | null | 'new'>(null);
  const [importing, setImporting] = useState(false);
  const cats = useQuery({ queryKey: ['categories'], queryFn: async () => (await api('/categories')).items as any[] });
  const params = new URLSearchParams({ page: String(page), pageSize: '25', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  const list = useQuery({ queryKey: ['questions', params.toString()], queryFn: () => api(`/questions?${params}`) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['questions'] });
  const set = (k: keyof typeof f, v: string) => (setF({ ...f, [k]: v }), setPage(1));
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); refresh(); } catch (e) { alert(errMsg(e)); } };
  const exportFile = async (format: 'csv' | 'json') => {
    const body = await api<string>(`/questions/export?format=${format}${f.categoryId ? `&categoryId=${f.categoryId}` : ''}`, { raw: true });
    const url = URL.createObjectURL(new Blob([body], { type: format === 'csv' ? 'text/csv' : 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `quizwar-questions.${format}` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="head">
        <h1>Questions</h1>
        {can('questions.manage') && <>
          <button className="btn" onClick={() => void exportFile('csv')}>Export CSV</button>
          <button className="btn" onClick={() => void exportFile('json')}>Export JSON</button>
          <button className="btn" onClick={() => setImporting(true)}>Bulk import</button>
          <button className="btn primary" onClick={() => setEdit('new')}><Icon name="plus" size={16} />Add question</button>
        </>}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search text" aria-label="Search" value={f.q} onChange={(e) => set('q', e.target.value)} />
        <select className="input" style={{ maxWidth: 200 }} aria-label="Category" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input" style={{ maxWidth: 150 }} aria-label="Difficulty" value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)}><option value="">Any difficulty</option>{DIFFS.map((d) => <option key={d}>{d}</option>)}</select>
        <select className="input" style={{ maxWidth: 140 }} aria-label="Status" value={f.active} onChange={(e) => set('active', e.target.value)}><option value="">Any status</option><option value="true">Active</option><option value="false">Inactive</option></select>
      </div>
      <div className="card table-wrap">
        {list.isLoading ? <Loading /> : (
          <table>
            <thead><tr><th>#</th><th>Question</th><th>Category</th><th>Difficulty</th><th>Shown</th><th>Accuracy</th><th>Avg time</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.data?.items.map((q: any) => (
                <tr key={q.id}>
                  <td className="faint">{q.id}</td>
                  <td style={{ maxWidth: 420, fontFamily: 'var(--font-bn)' }}>{q.text}{q.imageUrl && <> <Icon name="image" size={14} label="Has image" /></>}</td>
                  <td className="small">{q.category}</td>
                  <td><span className="badge">{q.difficulty}</span></td>
                  <td>{q.stats.shown}</td>
                  <td>{q.stats.accuracy == null ? '—' : `${q.stats.accuracy}%`}</td>
                  <td>{q.stats.avgResponseMs == null ? '—' : `${(q.stats.avgResponseMs / 1000).toFixed(1)}s`}</td>
                  <td>{q.isActive ? <span className="badge green">active</span> : <span className="badge">inactive</span>}</td>
                  <td>
                    {can('questions.manage') && <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setEdit(q.id)}>Edit</button>
                      <button className="btn sm" onClick={() => void act(() => api(`/questions/${q.id}/duplicate`, { method: 'POST' }))}>Duplicate</button>
                      <button className="btn sm" onClick={() => void act(() => api(`/questions/${q.id}/active`, { method: 'PATCH', body: { active: !q.isActive } }))}>{q.isActive ? 'Disable' : 'Enable'}</button>
                      <button className="btn sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Delete question ${q.id}?`) && void act(() => api(`/questions/${q.id}`, { method: 'DELETE' }))}>Delete</button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {list.data && <Pager page={page} setPage={setPage} hasMore={page * 25 < list.data.total} total={list.data.total} pageSize={25} />}
      </div>
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit === 'new' ? 'New question' : `Edit question #${edit}`} wide>
        {cats.data && <QuestionForm id={edit === 'new' ? null : (edit as number)} categories={cats.data} onDone={() => { setEdit(null); refresh(); }} />}
      </Modal>
      <Modal open={importing} onClose={() => setImporting(false)} title="Bulk import questions" wide>
        <ImportForm onDone={refresh} />
      </Modal>
    </>
  );
}
