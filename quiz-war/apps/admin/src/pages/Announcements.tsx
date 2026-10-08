import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Loading, fmtDate } from '../components/ui';
import { api, errMsg } from '../lib/api';

export default function Announcements() {
  const list = useQuery({ queryKey: ['announcements'], queryFn: () => api('/announcements') });
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (!confirm('Send this announcement to players?')) return;
    try {
      await api('/announcements', { body: { title: f.get('title'), body: f.get('body'), push: f.get('push') === 'on' } });
      setMsg({ ok: 'Announcement sent (online players see it instantly; others get an in-app notification).' });
      form.reset();
      void list.refetch();
    } catch (e2) {
      setMsg({ err: errMsg(e2) });
    }
  };
  return (
    <>
      <div className="head"><h1>Announcements</h1></div>
      <form className="card form" onSubmit={submit}>
        {msg.ok && <p className="ok">{msg.ok}</p>}
        {msg.err && <p className="err">{msg.err}</p>}
        <div className="field"><label htmlFor="t">Title</label><input id="t" name="title" className="input" required maxLength={120} /></div>
        <div className="field"><label htmlFor="b">Message</label><textarea id="b" name="body" className="input" required maxLength={500} /></div>
        <label className="row"><input type="checkbox" name="push" /> Also send a push notification</label>
        <button className="btn primary">Send announcement</button>
      </form>
      <div className="card mt table-wrap">
        {list.isLoading ? <Loading /> : (
          <table><thead><tr><th>Date</th><th>Title</th><th>Message</th><th>Push</th><th>By</th></tr></thead>
            <tbody>{list.data.items.map((a: any) => <tr key={a.id}><td className="small">{fmtDate(a.createdAt)}</td><td><b>{a.title}</b></td><td className="small">{a.body}</td><td>{a.push ? 'Yes' : 'No'}</td><td>{a.admin}</td></tr>)}</tbody></table>
        )}
      </div>
    </>
  );
}
