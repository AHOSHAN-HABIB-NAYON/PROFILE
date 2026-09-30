import bcrypt from 'bcryptjs';
import { all, one, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, field, input, sel, swRow, csrfField } from '../layout.js';
import { str, int, flag, arr } from '../../../core/forms.js';
import { bnDateTime } from '../../../core/bn.js';

const PERMS = { posts: 'পোস্ট (যোগ/এডিট/ডিলিট, বিজ্ঞাপন)', categories: 'ক্যাটাগরি', banners: 'ব্যানার', notices: 'নোটিশ', reports: 'রিপোর্ট', analytics: 'অ্যানালিটিকস', users: 'এডমিন ব্যবস্থাপনা', settings: 'সেটিংস, টিম, অটোমেশন, নোটিফিকেশন' };
const hash = (p) => bcrypt.hash(p, 10);

export default {
  perm: 'users',
  async post(c) {
    if (c.me.role !== 'super') return c.go('users', 'err', 'শুধু মেইন এডমিন এই কাজ করতে পারবেন।');
    const f = c.fields;
    if (f.do === 'save') {
      const id = int(f.id); const user = str(f.username, 30); const role = ['admin', 'moderator'].includes(f.role) ? f.role : 'moderator';
      const perms = JSON.stringify(arr(f.perms).filter((p) => PERMS[p]));
      if (!/^[a-zA-Z0-9_]{4,30}$/.test(user)) return c.go('users', 'err', 'ইউজারনেম ৪-৩০ অক্ষরের (a-z, 0-9, _) হতে হবে।');
      const pw = String(f.password || '');
      if (id) {
        await run("UPDATE admins SET username=?, name=?, role=?, perms=?, is_active=? WHERE id=? AND role <> 'super'", [user, str(f.name, 120), role, perms, flag(f.is_active) ? 1 : 0, id]);
        if (pw) { if (pw.length < 8) return c.go('users', 'err', 'পাসওয়ার্ড অন্তত ৮ অক্ষরের দিন।'); await run('UPDATE admins SET pass = ? WHERE id = ?', [await hash(pw), id]); }
        return c.go('users', 'ok', 'আপডেট হয়েছে।');
      }
      if (pw.length < 8) return c.go('users', 'err', 'পাসওয়ার্ড অন্তত ৮ অক্ষরের দিন।');
      if (await one('SELECT id FROM admins WHERE username = ?', [user])) return c.go('users', 'err', 'এই ইউজারনেম আগেই আছে।');
      await run('INSERT INTO admins (username, pass, name, role, perms, is_active, created_at) VALUES (?,?,?,?,?,?,NOW())', [user, await hash(pw), str(f.name, 120), role, perms, flag(f.is_active) ? 1 : 0]);
      return c.go('users', 'ok', 'নতুন অ্যাকাউন্ট তৈরি হয়েছে।');
    }
    if (f.do === 'delete') {
      const id = int(f.id); if (id === c.me.id) return c.go('users', 'err', 'নিজের অ্যাকাউন্ট মোছা যাবে না।');
      await run("DELETE FROM admins WHERE id = ? AND role <> 'super'", [id]); return c.go('users', 'ok', 'মুছে ফেলা হয়েছে।');
    }
    return c.go('users');
  },
  async get(c) {
    const edit = c.query.id ? await one('SELECT * FROM admins WHERE id = ?', [int(c.query.id)]) : null;
    const ep = (() => { try { return JSON.parse(edit?.perms || '[]') || []; } catch { return []; } })();
    const rows = await all("SELECT * FROM admins ORDER BY role = 'super' DESC, id"); const e = edit || {};
    const ROLE = { super: 'মেইন এডমিন', admin: 'এডমিন', moderator: 'মডারেটর' };
    return c.page('এডমিন ও মডারেটর', html`
${c.me.role === 'super' ? card(edit ? 'অ্যাকাউন্ট এডিট' : 'নতুন অ্যাকাউন্ট', 'shield', html`<form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="save"><input type="hidden" name="id" value="${e.id || ''}"><div class="grid">
<div class="grid g2">${field('ইউজারনেম *', input('username', e.username, { req: true, max: 30 }))}${field('নাম', input('name', e.name))}</div>
<div class="grid g2">${field(edit ? 'নতুন পাসওয়ার্ড (বদলাতে চাইলে)' : 'পাসওয়ার্ড * (৮+)', input('password', '', { type: 'password', extra: 'autocomplete="new-password"' }))}${field('ভূমিকা', sel('role', e.role || 'moderator', [['admin', 'এডমিন'], ['moderator', 'মডারেটর']]))}</div>
${field('অনুমতি', html`<div style="display:grid;gap:4px">${Object.entries(PERMS).map(([k, l]) => html`<label style="display:flex;gap:9px;align-items:center;font-size:.9rem"><input type="checkbox" name="perms" value="${k}" ${ep.includes(k) || ep.includes('all') ? html`checked` : ''}>${l}</label>`)}</div>`)}
${swRow('is_active', edit ? Number(e.is_active) === 1 : true, 'সক্রিয় (লগইন করতে পারবে)')}</div>
<div style="display:flex;gap:10px;margin-top:10px"><button class="btn" type="submit">${ic('save')}সংরক্ষণ</button>${edit ? html`<a class="btn sec" href="${c.au('users')}">বাতিল</a>` : ''}</div></form>`) : ''}
${card('সব অ্যাকাউন্ট', 'users', html`<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>ইউজার</th><th>ভূমিকা</th><th>শেষ লগইন</th><th>অবস্থা</th><th></th></tr></thead><tbody>${rows.map((u) => html`<tr><td><b>${u.username}</b><div class="sub">${u.name || ''}</div></td><td data-l="ভূমিকা"><span class="tag ${u.role === 'super' ? 'gold' : ''}">${ROLE[u.role]}</span></td><td data-l="শেষ লগইন"><span class="sub">${u.last_login ? bnDateTime(u.last_login) : '—'}</span></td><td>${Number(u.is_active) ? html`<span class="tag on">সক্রিয়</span>` : html`<span class="tag off">বন্ধ</span>`}</td>
<td>${c.me.role === 'super' && u.role !== 'super' ? html`<div class="row-act"><a class="ibtn" href="${c.au(`users?id=${u.id}`)}">${ic('edit')}</a><form method="post" style="display:inline">${csrfField(c.csrf)}<input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="${u.id}"><button class="ibtn dan" data-confirm="মুছবেন?">${ic('trash')}</button></form></div>` : ''}</td></tr>`)}</tbody></table></div>`)}`);
  },
};
