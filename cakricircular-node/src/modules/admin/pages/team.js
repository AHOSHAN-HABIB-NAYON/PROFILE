import { all, one, col, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, field, input, swRow, csrfField } from '../layout.js';
import { saveImage, removeFile } from '../../../core/images.js';
import { str, int, flag } from '../../../core/forms.js';
import { uploadUrl } from '../../../ui/components.js';
import { setSettings, setting } from '../../../core/settings.js';

export default {
  perm: 'settings',
  async post(c) {
    const f = c.fields;
    if (f.do === 'order') { const ids = String(f.ids || '').split(',').map((x) => int(x)).filter(Boolean); for (let i = 0; i < ids.length; i++) await run('UPDATE team_members SET sort_order = ? WHERE id = ?', [i + 1, ids[i]]); return c.json({ ok: true }); }
    if (f.do === 'section') { await setSettings({ team_title: str(f.team_title, 80), team_sub: str(f.team_sub, 200), team_show: flag(f.team_show) ? '1' : '0' }); return c.go('team', 'ok', 'সেকশনের তথ্য সংরক্ষিত।'); }
    if (f.do === 'save') {
      const id = int(f.id); const name = str(f.name, 120);
      if (!name) return c.go('team', 'err', 'নাম দিন।');
      const vals = [name, str(f.role, 120), str(f.bio, 400), str(f.facebook, 300), str(f.linkedin, 300), str(f.whatsapp, 300), str(f.email, 150), flag(f.is_active) ? 1 : 0];
      let mid = id;
      if (id) await run('UPDATE team_members SET name=?, role=?, bio=?, facebook=?, linkedin=?, whatsapp=?, email=?, is_active=? WHERE id=?', [...vals, id]);
      else { const max = Number(await col('SELECT COALESCE(MAX(sort_order),0) FROM team_members', [], 0)); const r = await run('INSERT INTO team_members (name, role, bio, facebook, linkedin, whatsapp, email, is_active, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())', [...vals, max + 1]); mid = r.insertId; }
      const cur = await one('SELECT photo FROM team_members WHERE id = ?', [mid]);
      if (flag(f.del_photo) && cur.photo) { removeFile('team', cur.photo); await run('UPDATE team_members SET photo = NULL WHERE id = ?', [mid]); cur.photo = null; }
      if (c.files.photo?.[0]) { const r = await saveImage(c.files.photo[0], { folder: 'team', maxW: 600, square: true, targetKB: 110 }); if (r.file) { removeFile('team', cur.photo); await run('UPDATE team_members SET photo = ? WHERE id = ?', [r.file, mid]); } else return c.go('team', 'err', r.err); }
      return c.go('team', 'ok', 'সংরক্ষণ হয়েছে।');
    }
    if (f.do === 'delete') { const m = await one('SELECT photo FROM team_members WHERE id = ?', [int(f.id)]); if (m) { removeFile('team', m.photo); await run('DELETE FROM team_members WHERE id = ?', [int(f.id)]); } return c.go('team', 'ok', 'মুছে ফেলা হয়েছে।'); }
    return c.go('team');
  },
  async get(c) {
    const edit = c.query.id ? await one('SELECT * FROM team_members WHERE id = ?', [int(c.query.id)]) : null;
    const rows = await all('SELECT * FROM team_members ORDER BY sort_order, id'); const e = edit || {};
    return c.page('আমাদের টিম', html`
${card('ফুটারের টিম সেকশন', 'users', html`<form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="section"><div class="grid">
${field('সেকশনের শিরোনাম', input('team_title', setting('team_title', 'আমাদের টিম')))}${field('ছোট বর্ণনা', input('team_sub', setting('team_sub', 'যাদের পরিশ্রমে প্রতিদিন নতুন তথ্য আপনার কাছে পৌঁছায়')))}
${swRow('team_show', setting('team_show', '1') !== '0', 'ফুটারে টিম সেকশন দেখান')}</div><button class="btn sm" type="submit">${ic('save')}সংরক্ষণ</button></form>`)}
${card(edit ? 'সদস্য এডিট' : 'নতুন সদস্য', 'plus', html`<form method="post" enctype="multipart/form-data">${csrfField(c.csrf)}<input type="hidden" name="do" value="save"><input type="hidden" name="id" value="${e.id || ''}"><div class="grid">
<div class="grid g2">${field('নাম *', input('name', e.name, { req: true, max: 120 }))}${field('পদবি', input('role', e.role, { max: 120, ph: 'যেমন: প্রতিষ্ঠাতা ও সম্পাদক' }))}</div>
${field('ছোট পরিচিতি', html`<textarea name="bio" maxlength="400" style="min-height:80px">${e.bio || ''}</textarea>`)}
<div>${field('ছবি (স্কোয়ার ক্রপ, অটো কম্প্রেস)', html`<input type="file" name="photo" accept="image/*">`)}${e.photo ? html`<div class="med sq" style="max-width:110px;margin-top:8px"><img src="${uploadUrl(e.photo, 'team')}" alt=""><label class="x"><input type="checkbox" name="del_photo" value="1" style="width:14px;height:14px">মুছুন</label></div>` : ''}</div>
<div class="grid g2">${field('ফেসবুক লিংক', input('facebook', e.facebook))}${field('লিংকডইন লিংক', input('linkedin', e.linkedin))}${field('হোয়াটসঅ্যাপ লিংক', input('whatsapp', e.whatsapp, { ph: 'https://wa.me/8801…' }))}${field('ইমেইল', input('email', e.email))}</div>
${swRow('is_active', edit ? Number(e.is_active) === 1 : true, 'দেখান')}</div>
<div style="display:flex;gap:10px;margin-top:10px"><button class="btn" type="submit">${ic('save')}সংরক্ষণ</button>${edit ? html`<a class="btn sec" href="${c.au('team')}">বাতিল</a>` : ''}</div></form>`)}
${card('সদস্যরা (টেনে সাজান)', 'grip', rows.length ? html`<div data-sortable>${rows.map((m) => html`<div class="team-row-a" draggable="true" data-id="${m.id}"><span class="drag">${ic('grip')}</span>${m.photo ? html`<img class="av" src="${uploadUrl(m.photo, 'team')}" alt="">` : html`<span class="av">${Array.from(m.name)[0]}</span>`}
<div style="flex:1;min-width:0"><b>${m.name}</b><div class="sub">${m.role || ''}</div></div>${Number(m.is_active) ? '' : html`<span class="tag off">লুকানো</span>`}<a class="ibtn" href="${c.au(`team?id=${m.id}`)}">${ic('edit')}</a>
<form method="post" style="display:inline">${csrfField(c.csrf)}<input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="${m.id}"><button class="ibtn dan" data-confirm="মুছবেন?">${ic('trash')}</button></form></div>`)}</div>` : html`<p class="sub">এখনো কোনো সদস্য নেই।</p>`)}`);
  },
};
