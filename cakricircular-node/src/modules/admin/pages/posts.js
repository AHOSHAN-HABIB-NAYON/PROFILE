/* পোস্ট সমূহ: তালিকা, ফিল্টার, বাল্ক অ্যাকশন, রিসাইকেল বিন, ভাঙা লিংক ঠিক করা */
import { all, one, col, run } from '../../../db.js';
import { html, raw } from '../../../core/html.js';
import { bn, timeAgo } from '../../../core/bn.js';
import { ic } from '../../../ui/icons.js';
import { card, sel, csrfField, adminPager } from '../layout.js';
import { slugify, uniqueSlug } from '../../../core/slug.js';
import { categories } from '../../site/data.js';
import { removeFile } from '../../../core/images.js';
import { enqueueNewPost } from '../../notify/jobs.js';
import { arr, int, str } from '../../../core/forms.js';

export default {
  perm: 'posts',
  async post(c) {
    const f = c.fields;
    if (f.do === 'fixslug') {
      let fixed = 0;
      for (const r of await all('SELECT id, title, slug FROM posts')) {
        const good = slugify(r.title);
        if (good === r.slug || !good) continue;
        if (good.replace(/\p{M}+/gu, '') !== r.slug) continue;
        const ns = await uniqueSlug(r.title, 'posts', r.id);
        await run('INSERT IGNORE INTO slug_redirects (old_slug, post_id, created_at) VALUES (?,?,NOW())', [r.slug, r.id]);
        await run('UPDATE posts SET slug = ? WHERE id = ?', [ns, r.id]); fixed += 1;
      }
      return c.go('posts', 'ok', fixed ? `${bn(fixed)} টি পোস্টের লিংক ঠিক করা হয়েছে। পুরনো লিংক অটো নতুনে যাবে।` : 'ভাঙা লিংক পাওয়া যায়নি — সবগুলো ঠিক আছে।');
    }
    let act = str(f.bulk); let ids = arr(f.ids).map((x) => int(x)).filter(Boolean);
    if (act.includes(':')) { const [a, o] = act.split(':'); act = a; ids = [int(o)]; }
    if (ids.length && act) {
      if (act === 'delete') { await run('UPDATE posts SET deleted_at = NOW(), status = 0 WHERE id IN (?)', [ids]); return c.go(back(c), 'ok', `${bn(ids.length)} টি পোস্ট রিসাইকেল বিনে গেছে — ফিরিয়ে আনা যাবে।`); }
      if (act === 'restore') { await run('UPDATE posts SET deleted_at = NULL WHERE id IN (?)', [ids]); return c.go(back(c), 'ok', `${bn(ids.length)} টি পোস্ট ফিরিয়ে আনা হয়েছে (খসড়া অবস্থায়)।`); }
      if (act === 'purge') {
        for (const id of ids) {
          for (const im of await all('SELECT image FROM post_images WHERE post_id = ?', [id])) removeFile('posts', im.image);
          const p = await one('SELECT thumb, pdf FROM posts WHERE id = ?', [id]); removeFile('posts', p?.thumb); removeFile('pdf', p?.pdf);
        }
        await run('DELETE FROM post_images WHERE post_id IN (?)', [ids]); await run('DELETE FROM post_links WHERE post_id IN (?)', [ids]); await run('DELETE FROM posts WHERE id IN (?)', [ids]);
        return c.go(back(c), 'ok', `${bn(ids.length)} টি পোস্ট স্থায়ীভাবে মুছে ফেলা হয়েছে।`);
      }
      if (act === 'publish' || act === 'draft') {
        if (act === 'publish') {
          await run('UPDATE posts SET published_at = NOW(), review_pending = 0 WHERE review_pending = 1 AND id IN (?)', [ids]);
          const was = await all('SELECT id FROM posts WHERE status = 0 AND id IN (?)', [ids]);
          await run('UPDATE posts SET status = 1 WHERE id IN (?)', [ids]);
          if (f.notify !== '0') for (const w of was) await enqueueNewPost(w.id);
        } else await run('UPDATE posts SET status = 0 WHERE id IN (?)', [ids]);
        return c.go(back(c), 'ok', act === 'publish' ? 'প্রকাশ করা হয়েছে। সাবস্ক্রাইবারদের জানানো হচ্ছে…' : 'খসড়ায় নেওয়া হয়েছে।');
      }
    }
    return c.go(back(c));
  },
  async get(c) {
    const q = c.query; const au = c.au;
    const fCat = int(q.cat); const fSt = str(q.st, 2); const fQ = str(q.q, 100); const page = Math.max(1, int(q.page, 1)); const per = 25;
    const trash = Boolean(q.trash); const review = Boolean(q.review);
    const w = [trash ? 'p.deleted_at IS NOT NULL' : 'p.deleted_at IS NULL']; const a = [];
    if (review) w.push('p.review_pending = 1');
    if (fCat) { w.push('p.cat_id = ?'); a.push(fCat); }
    if (fSt !== '') { w.push('p.status = ?'); a.push(int(fSt)); }
    if (fQ) { w.push('p.title LIKE ?'); a.push(`%${fQ}%`); }
    const ws = w.join(' AND ');
    const [total, reviewN, trashN] = await Promise.all([col(`SELECT COUNT(*) FROM posts p WHERE ${ws}`, a, 0), col('SELECT COUNT(*) FROM posts WHERE review_pending = 1 AND deleted_at IS NULL', [], 0), col('SELECT COUNT(*) FROM posts WHERE deleted_at IS NOT NULL', [], 0)]);
    const rows = await all(`SELECT p.id, p.title, p.slug, p.status, p.views, p.published_at, p.deadline, p.is_premium, p.is_auto, p.review_pending, p.thumb, c.name cat FROM posts p LEFT JOIN categories c ON c.id = p.cat_id WHERE ${ws} ORDER BY p.id DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, a);
    const pages = Math.max(1, Math.ceil(Number(total) / per));
    let broken = 0;
    for (const r of await all('SELECT title, slug FROM posts')) { const g = slugify(r.title); if (g && g !== r.slug && g.replace(/\p{M}+/gu, '') === r.slug) broken += 1; }
    const cats = await categories();
    const qs = (o) => { const p = new URLSearchParams({ ...(fCat ? { cat: fCat } : {}), ...(fSt !== '' ? { st: fSt } : {}), ...(fQ ? { q: fQ } : {}), ...(trash ? { trash: 1 } : {}), ...(review ? { review: 1 } : {}), ...o }); return `${au('posts')}?${p}`; };
    return c.page(trash ? 'রিসাইকেল বিন' : 'পোস্ট সমূহ', html`
<div class="a-card"><div class="filters">
  <div class="seg2"><a class="${!trash && !review ? 'on' : ''}" href="${au('posts')}">সব</a><a class="${review ? 'on' : ''}" href="${au('posts?review=1')}">${ic('bot')}রিভিউ বাকি (${bn(reviewN)})</a><a class="${trash ? 'on' : ''}" href="${au('posts?trash=1')}">${ic('trash')}বিন (${bn(trashN)})</a></div>
  <form method="get" action="${au('posts')}" class="filters" style="flex:1;margin:0;min-width:240px" data-nolock>
    ${trash ? html`<input type="hidden" name="trash" value="1">` : ''}${review ? html`<input type="hidden" name="review" value="1">` : ''}
    <input type="search" name="q" value="${fQ}" placeholder="শিরোনাম খুঁজুন…">${sel('cat', fCat, cats.map((x) => [x.id, x.name]), { empty: 'সব ক্যাটাগরি' })}${sel('st', fSt, [['1', 'প্রকাশিত'], ['0', 'খসড়া']], { empty: 'সব অবস্থা' })}
    <button class="btn sm" type="submit">${ic('search')}খুঁজুন</button></form>
  <a class="btn sm" href="${au('post')}">${ic('plus')}নতুন পোস্ট</a></div>
${broken && !trash ? html`<form method="post" class="msg info" style="margin:0 0 12px" data-nolock>${csrfField(c.csrf)}<input type="hidden" name="do" value="fixslug">${ic('link')}<span style="flex:1">${bn(broken)} টি পোস্টের বাংলা লিংক ভাঙা</span><button class="btn sm" type="submit">লিংক ঠিক করুন</button></form>` : ''}
<form method="post">${csrfField(c.csrf)}
<div class="row-act" style="margin-bottom:10px;align-items:center"><label style="display:flex;gap:8px;align-items:center;font-size:.84rem;font-weight:700"><input type="checkbox" data-all=".rowchk"> সব বাছাই</label><span style="flex:1"></span>
  ${trash ? html`<button class="btn sm sec" name="bulk" value="restore">${ic('refresh')}ফিরিয়ে আনুন</button><button class="btn sm dan" name="bulk" value="purge" data-confirm="স্থায়ীভাবে মুছে যাবে — নিশ্চিত?">${ic('trash')}চিরতরে মুছুন</button>`
    : html`<button class="btn sm ok" name="bulk" value="publish">${ic('check')}প্রকাশ</button><button class="btn sm sec" name="bulk" value="draft">খসড়া</button><button class="btn sm dan" name="bulk" value="delete" data-confirm="বিনে পাঠাবেন?">${ic('trash')}বিনে</button>`}</div>
<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th style="width:30px"></th><th>শিরোনাম</th><th>ক্যাটাগরি</th><th>অবস্থা</th><th>ভিউ</th><th>প্রকাশ</th><th></th></tr></thead><tbody>
${rows.length ? rows.map((p) => html`<tr>
<td><input class="rowchk" type="checkbox" name="ids" value="${p.id}"></td>
<td><a class="ttl" href="${au(`post?id=${p.id}`)}">${p.title}</a><span class="sub">/post/${p.slug}</span> ${p.is_premium ? html`<span class="tag gold">${ic('crown')}প্রিমিয়াম</span>` : ''} ${p.is_auto ? html`<span class="tag auto">অটো</span>` : ''} ${p.review_pending ? html`<span class="tag warn">রিভিউ বাকি</span>` : ''}</td>
<td data-l="ক্যাটাগরি">${p.cat || '—'}</td><td data-l="অবস্থা">${p.status ? html`<span class="tag on">প্রকাশিত</span>` : html`<span class="tag off">খসড়া</span>`}</td>
<td data-l="ভিউ">${bn(p.views)}</td><td data-l="প্রকাশ"><span class="sub">${timeAgo(p.published_at)}</span></td>
<td><div class="row-act"><a class="ibtn" href="${au(`post?id=${p.id}`)}" aria-label="এডিট">${ic('edit')}</a><a class="ibtn" href="/post/${p.slug}" target="_blank" rel="noopener" aria-label="দেখুন">${ic('eye')}</a>
${trash ? html`<button class="ibtn" name="bulk" value="restore:${p.id}" aria-label="ফেরান">${ic('refresh')}</button>` : html`<button class="ibtn dan" name="bulk" value="delete:${p.id}" data-confirm="বিনে পাঠাবেন?" aria-label="মুছুন">${ic('trash')}</button>`}</div></td></tr>`)
  : html`<tr><td colspan="7" style="text-align:center;padding:30px" class="sub">কোনো পোস্ট পাওয়া যায়নি।</td></tr>`}
</tbody></table></div></form>
${adminPager(page, pages, (i) => qs({ page: i }))}</div>`);
  },
};
function back(c) { return c.au('posts') + (c.req.url.includes('?') ? c.req.url.slice(c.req.url.indexOf('?')) : ''); }
