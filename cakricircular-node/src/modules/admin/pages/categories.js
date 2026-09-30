import { all, one, col, run } from '../../../db.js';
import { html } from '../../../core/html.js';
import { ic, ICON_NAMES, iconName } from '../../../ui/icons.js';
import { card, field, input, swRow, csrfField } from '../layout.js';
import { uniqueSlug } from '../../../core/slug.js';
import { str, int, flag } from '../../../core/forms.js';
import { bn } from '../../../core/bn.js';

export default {
  perm: 'categories',
  async post(c) {
    const f = c.fields;
    if (f.do === 'save') {
      const id = int(f.id); const name = str(f.name, 120);
      if (!name) return c.go('categories', 'err', 'নাম দিন।');
      const slug = await uniqueSlug(str(f.slug, 140) || name, 'categories', id);
      const a = [name, slug, iconName(str(f.icon, 60)) , str(f.meta_title, 190) || null, str(f.meta_desc, 300) || null, int(f.sort_order), flag(f.is_active) ? 1 : 0];
      if (id) await run('UPDATE categories SET name=?, slug=?, icon=?, meta_title=?, meta_desc=?, sort_order=?, is_active=? WHERE id=?', [...a, id]);
      else await run('INSERT INTO categories (name, slug, icon, meta_title, meta_desc, sort_order, is_active) VALUES (?,?,?,?,?,?,?)', a);
      return c.go('categories', 'ok', 'সংরক্ষণ হয়েছে।');
    }
    if (f.do === 'delete') {
      const id = int(f.id); const n = Number(await col('SELECT COUNT(*) FROM posts WHERE cat_id = ?', [id], 0));
      if (n) return c.go('categories', 'err', `এই ক্যাটাগরিতে ${bn(n)} টি পোস্ট আছে। আগে সেগুলো সরান।`);
      await run('DELETE FROM categories WHERE id = ?', [id]); return c.go('categories', 'ok', 'মুছে ফেলা হয়েছে।');
    }
    return c.go('categories');
  },
  async get(c) {
    const edit = c.query.id ? await one('SELECT * FROM categories WHERE id = ?', [int(c.query.id)]) : null;
    const rows = await all('SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.cat_id = c.id) n FROM categories c ORDER BY c.sort_order, c.id');
    const au = c.au; const e = edit || {};
    return c.page('ক্যাটাগরি', html`
${card(edit ? 'ক্যাটাগরি এডিট' : 'নতুন ক্যাটাগরি', 'folder', html`<form method="post">${csrfField(c.csrf)}<input type="hidden" name="do" value="save"><input type="hidden" name="id" value="${e.id || ''}"><div class="grid">
<div class="grid g3">${field('নাম *', input('name', e.name, { req: true, max: 120 }))}${field('স্লাগ (খালি = অটো)', input('slug', e.slug))}${field('ক্রম', input('sort_order', e.sort_order ?? 0, { type: 'number' }))}</div>
${field('আইকন', html`<div class="seg2" style="display:flex;gap:6px;flex-wrap:wrap;max-height:150px;overflow:auto;padding:8px" id="iconPick">${ICON_NAMES.map((n) => html`<label style="cursor:pointer"><input type="radio" name="icon" value="${n}" ${n === iconName(e.icon || 'folder') ? html`checked` : ''} style="display:none"><span class="ibtn" style="width:40px;height:40px" title="${n}">${ic(n)}</span></label>`)}</div>`)}
<div class="grid g2">${field('মেটা টাইটেল', input('meta_title', e.meta_title))}${field('মেটা বিবরণ', input('meta_desc', e.meta_desc))}</div>
${swRow('is_active', edit ? Number(e.is_active) === 1 : true, 'সক্রিয় (মেনুতে দেখাবে)')}</div>
<div style="display:flex;gap:10px;margin-top:10px"><button class="btn" type="submit">${ic('save')}সংরক্ষণ</button>${edit ? html`<a class="btn sec" href="${au('categories')}">বাতিল</a>` : ''}</div></form>
<style>#iconPick input:checked + .ibtn{background:var(--brand);color:var(--on-brand);border-color:var(--brand)}</style>`)}
${card('সব ক্যাটাগরি', 'list', html`<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th></th><th>নাম</th><th>স্লাগ</th><th>পোস্ট</th><th>অবস্থা</th><th></th></tr></thead><tbody>${rows.map((r) => html`<tr><td><span class="ibtn">${ic(r.icon)}</span></td><td><b>${r.name}</b></td><td data-l="স্লাগ"><span class="sub">${r.slug}</span></td><td data-l="পোস্ট">${bn(r.n)}</td><td>${Number(r.is_active) ? html`<span class="tag on">সক্রিয়</span>` : html`<span class="tag off">বন্ধ</span>`}</td>
<td><div class="row-act"><a class="ibtn" href="${au(`categories?id=${r.id}`)}">${ic('edit')}</a><form method="post" style="display:inline">${csrfField(c.csrf)}<input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="${r.id}"><button class="ibtn dan" data-confirm="মুছবেন?">${ic('trash')}</button></form></div></td></tr>`)}</tbody></table></div>`)}`);
  },
};
