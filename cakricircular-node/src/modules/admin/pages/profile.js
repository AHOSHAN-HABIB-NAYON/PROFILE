import bcrypt from 'bcryptjs';
import { one, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, field, input, csrfField } from '../layout.js';
import { str } from '../../../core/forms.js';

export default {
  perm: '',
  async post(c) {
    const f = c.fields; const me = c.me;
    if (!(await bcrypt.compare(String(f.current || ''), String(me.pass).replace(/^\$2y\$/, '$2a$')))) return c.go('profile', 'err', 'বর্তমান পাসওয়ার্ড ভুল।');
    const user = str(f.username, 30);
    if (!/^[a-zA-Z0-9_]{4,30}$/.test(user)) return c.go('profile', 'err', 'ইউজারনেম ৪-৩০ অক্ষরের (a-z, 0-9, _) হতে হবে।');
    if (await one('SELECT id FROM admins WHERE username = ? AND id <> ?', [user, me.id])) return c.go('profile', 'err', 'এই ইউজারনেম আগেই ব্যবহার হচ্ছে।');
    await run('UPDATE admins SET username = ?, name = ? WHERE id = ?', [user, str(f.name, 120), me.id]);
    const np = String(f.password || '');
    if (np) {
      if (np.length < 8) return c.go('profile', 'err', 'নতুন পাসওয়ার্ড অন্তত ৮ অক্ষরের দিন।');
      if (np !== String(f.password2 || '')) return c.go('profile', 'err', 'দুইবারের পাসওয়ার্ড মেলেনি।');
      await run('UPDATE admins SET pass = ? WHERE id = ?', [await bcrypt.hash(np, 10), me.id]);
      return c.go('profile', 'ok', 'পাসওয়ার্ড বদলানো হয়েছে।');
    }
    return c.go('profile', 'ok', 'সংরক্ষণ হয়েছে।');
  },
  async get(c) {
    const m = c.me;
    return c.page('আমার অ্যাকাউন্ট', card('প্রোফাইল ও পাসওয়ার্ড', 'user', html`<form method="post" style="max-width:520px">${csrfField(c.csrf)}<div class="grid">
${field('ইউজারনেম', input('username', m.username, { req: true, max: 30 }))}${field('নাম', input('name', m.name))}
${field('নতুন পাসওয়ার্ড (বদলাতে চাইলে)', input('password', '', { type: 'password', extra: 'autocomplete="new-password"' }))}${field('নতুন পাসওয়ার্ড আবার', input('password2', '', { type: 'password', extra: 'autocomplete="new-password"' }))}
${field('বর্তমান পাসওয়ার্ড * (নিশ্চিত করতে)', input('current', '', { type: 'password', req: true, extra: 'autocomplete="current-password"' }))}</div>
<button class="btn" type="submit" style="margin-top:12px">${ic('save')}সংরক্ষণ</button></form>`));
  },
};
