import { all, one, col, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, field, input, swRow, csrfField } from '../layout.js';
import { saveImage, removeFile } from '../../../core/images.js';
import { str, int, flag } from '../../../core/forms.js';
import { uploadUrl } from '../../../ui/components.js';
import { bn } from '../../../core/bn.js';

export default {
  perm: 'banners',
  async post(c) {
    const f = c.fields;
    if (f.do === 'add') {
      const n = Number(await col('SELECT COUNT(*) FROM banners', [], 0));
      if (n >= 10) return c.go('banners', 'err', 'সর্বোচ্চ ১০টি ব্যানার রাখা যাবে।');
      const file = c.files.image?.[0]; if (!file) return c.go('banners', 'err', 'ছবি নির্বাচন করুন।');
      const r = await saveImage(file, { folder: 'banners', maxW: 1712, ratio: 856 / 292, targetKB: 220 });
      if (!r.file) return c.go('banners', 'err', r.err || 'ছবি আপলোড হয়নি।');
      await run('INSERT INTO banners (title, image, link, sort_order, is_active, created_at) VALUES (?,?,?,?,?,NOW())', [str(f.title, 160), r.file, str(f.link, 500), int(f.sort_order), flag(f.is_active) ? 1 : 0]);
      return c.go('banners', 'ok', 'ব্যানার যোগ হয়েছে।');
    }
    if (f.do === 'update') { await run('UPDATE banners SET title=?, link=?, sort_order=?, is_active=? WHERE id=?', [str(f.title, 160), str(f.link, 500), int(f.sort_order), flag(f.is_active) ? 1 : 0, int(f.id)]); return c.go('banners', 'ok', 'আপডেট হয়েছে।'); }
    if (f.do === 'toggle') { await run('UPDATE banners SET is_active = 1 - is_active WHERE id = ?', [int(f.id)]); return c.go('banners', 'ok', 'অবস্থা বদলানো হয়েছে।'); }
    if (f.do === 'delete') { const b = await one('SELECT * FROM banners WHERE id = ?', [int(f.id)]); if (b) { removeFile('banners', b.image); await run('DELETE FROM banners WHERE id = ?', [b.id]); } return c.go('banners', 'ok', 'মুছে ফেলা হয়েছে।'); }
    return c.go('banners');
  },
  async get(c) {
    const rows = await all('SELECT * FROM banners ORDER BY sort_order, id');
    return c.page('ব্যানার', html`
${card(`নতুন ব্যানার (${bn(rows.length)}/১০)`, 'image', html`<form method="post" enctype="multipart/form-data">${csrfField(c.csrf)}<input type="hidden" name="do" value="add"><div class="grid">
${field('ছবি (অটো ৮৫৬×২৯২ ক্রপ, ≈২০০ কেবি)', html`<input type="file" name="image" accept="image/*" required>`)}
<div class="grid g3">${field('শিরোনাম (ঐচ্ছিক)', input('title'))}${field('লিংক (ঐচ্ছিক)', input('link', '', { ph: 'https://…' }))}${field('ক্রম', input('sort_order', 0, { type: 'number' }))}</div>
${swRow('is_active', true, 'সক্রিয়')}</div><button class="btn" type="submit" style="margin-top:8px">${ic('plus')}যোগ করুন</button></form>`)}
${card('ব্যানার তালিকা', 'list', rows.length ? html`<div class="grid auto" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${rows.map((b) => html`<div class="a-card" style="margin:0;padding:12px"><div class="med"><img src="${uploadUrl(b.image, 'banners')}" alt="" style="aspect-ratio:856/292"></div>
<form method="post" style="margin-top:10px;display:grid;gap:8px">${csrfField(c.csrf)}<input type="hidden" name="do" value="update"><input type="hidden" name="id" value="${b.id}">${input('title', b.title, { ph: 'শিরোনাম' })}${input('link', b.link, { ph: 'লিংক' })}
<div style="display:flex;gap:8px;align-items:center"><input type="number" name="sort_order" value="${b.sort_order}" style="width:90px"><label style="display:flex;gap:6px;align-items:center;font-size:.84rem;font-weight:700"><input type="checkbox" name="is_active" value="1" ${Number(b.is_active) ? html`checked` : ''}>সক্রিয়</label><span style="flex:1"></span><button class="btn sm">${ic('save')}সেভ</button></div></form>
<form method="post" style="margin-top:8px">${csrfField(c.csrf)}<input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="${b.id}"><button class="btn sm dan block" data-confirm="মুছবেন?">${ic('trash')}মুছুন</button></form></div>`)}</div>` : html`<p class="sub">কোনো ব্যানার নেই।</p>`)}`);
  },
};
