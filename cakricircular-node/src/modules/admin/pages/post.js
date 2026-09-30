/* পোস্ট যোগ / এডিট — ছবি, পিডিএফ, গ্যালারি, লিংক, প্রিমিয়াম, SEO */
import { all, one, col, run } from '../../../db.js';
import { html, raw, esc } from '../../../core/html.js';
import { ic } from '../../../ui/icons.js';
import { card, field, input, sel, swRow, csrfField } from '../layout.js';
import { nextCatSlug, uniqueSlug } from '../../../core/slug.js';
import { categories, DIVISIONS, JOB_TYPES } from '../../site/data.js';
import { saveImage, savePdf, removeFile } from '../../../core/images.js';
import { enqueueNewPost } from '../../notify/jobs.js';
import { str, int, flag, arr, dateOrNull } from '../../../core/forms.js';
import { bn } from '../../../core/bn.js';
import { uploadUrl } from '../../../ui/components.js';

const LINK_TYPES = [['url', 'ওয়েবসাইট লিংক'], ['email', 'ইমেইল'], ['phone', 'ফোন'], ['whatsapp', 'হোয়াটসঅ্যাপ']];

function normalizeLink(type, raw) {
  let u = raw.trim(); if (!u) return null;
  if (type === 'email') { const m = u.replace(/^mailto:/i, ''); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) ? `mailto:${m}` : null; }
  if (type === 'phone') { const n = u.replace(/[^0-9+]/g, ''); return n.length >= 6 ? `tel:${n}` : null; }
  if (type === 'whatsapp') { let n = u.replace(/[^0-9]/g, ''); if (!n) return null; if (!n.startsWith('880')) n = `880${n.replace(/^0+/, '')}`; return `https://wa.me/${n}`; }
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try { return new URL(u).href; } catch { return null; }
}
const guessType = (u) => (/^mailto:/i.test(u) ? 'email' : /^tel:/i.test(u) ? 'phone' : /wa\.me\//i.test(u) ? 'whatsapp' : 'url');
const linkRow = (l = {}) => html`<div class="lnk-row">
  <div>${sel('link_type', l.url ? guessType(l.url) : 'url', LINK_TYPES)}</div><div><input type="text" name="link_url" value="${l.url ? String(l.url).replace(/^(mailto:|tel:|https:\/\/wa\.me\/)/i, '') : ''}" placeholder="লিংক / ইমেইল / নম্বর"></div>
  <div class="f-wide"><input type="text" name="link_label" value="${l.label || ''}" placeholder="বাটনের লেখা (ঐচ্ছিক)" style="flex:1;min-width:160px"><label style="display:flex;gap:7px;align-items:center;font-weight:700;font-size:.82rem;white-space:nowrap"><input type="checkbox" name="link_apply" value="1" ${raw(l.is_apply ? 'checked' : '')}>আবেদন বাটন</label><button type="button" class="ibtn dan" data-rm aria-label="মুছুন">${ic('trash')}</button></div></div>`;

export default {
  perm: 'posts',
  async post(c) {
    const f = c.fields; const id0 = int(c.query.id);
    const post = id0 ? await one('SELECT * FROM posts WHERE id = ?', [id0]) : null;
    if (f.do === 'delete' && post) { await run('UPDATE posts SET deleted_at = NOW(), status = 0 WHERE id = ?', [id0]); return c.go('posts', 'ok', 'পোস্টটি রিসাইকেল বিনে পাঠানো হয়েছে।'); }
    const title = str(f.title, 255);
    if (!title) return c.go(`post${id0 ? `?id=${id0}` : ''}`, 'err', 'শিরোনাম দিন।');
    let content = String(Array.isArray(f.content) ? f.content[0] : f.content || '');
    if (f.content_b64) { try { const raw = Buffer.from(String(f.content_b64), 'base64').toString('utf8'); if (raw.trim()) content = raw; } catch { /* */ } }
    const d = {
      cat_id: int(f.cat_id) || null, title, content, division: str(f.division, 60), district: str(f.district, 60), vacancy: str(f.vacancy, 30), salary: str(f.salary, 100),
      company: str(f.company, 160), employment_type: str(f.employment_type, 30) || 'FULL_TIME', deadline: dateOrNull(f.deadline), is_job: flag(f.is_job) ? 1 : 0,
      is_premium: flag(f.is_premium) ? 1 : 0, premium_until: dateOrNull(f.premium_until), keywords: str(f.keywords, 300), meta_title: str(f.meta_title, 190), meta_desc: str(f.meta_desc, 300), status: flag(f.status) ? 1 : 0,
    };
    let id = id0; let wasLive = post ? Number(post.status) === 1 && !post.review_pending : false;
    if (post) {
      let slug = post.slug; const wanted = str(f.slug, 190);
      if (wanted && wanted !== post.slug) slug = await uniqueSlug(wanted, 'posts', id);
      if (post.review_pending && d.status === 1) await run('UPDATE posts SET review_pending = 0, published_at = NOW() WHERE id = ?', [id]);
      if (slug !== post.slug) await run('INSERT IGNORE INTO slug_redirects (old_slug, post_id, created_at) VALUES (?,?,NOW())', [post.slug, id]);
      await run(`UPDATE posts SET cat_id=?, title=?, slug=?, content=?, division=?, district=?, vacancy=?, salary=?, company=?, employment_type=?, deadline=?, is_job=?, is_premium=?, premium_until=?, keywords=?, meta_title=?, meta_desc=?, status=?, updated_at=NOW() WHERE id=?`,
        [d.cat_id, d.title, slug, d.content, d.division, d.district, d.vacancy, d.salary, d.company, d.employment_type, d.deadline, d.is_job, d.is_premium, d.premium_until, d.keywords, d.meta_title, d.meta_desc, d.status, id]);
    } else {
      const wanted = str(f.slug, 190);
      const slug = wanted ? await uniqueSlug(wanted, 'posts') : await nextCatSlug(d.cat_id || 0, title);
      const r = await run(`INSERT INTO posts (cat_id,title,slug,content,division,district,vacancy,salary,company,employment_type,deadline,is_job,is_premium,premium_until,keywords,meta_title,meta_desc,status,published_at,updated_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),?)`,
        [d.cat_id, d.title, slug, d.content, d.division, d.district, d.vacancy, d.salary, d.company, d.employment_type, d.deadline, d.is_job, d.is_premium, d.premium_until, d.keywords, d.meta_title, d.meta_desc, d.status, c.me.id]);
      id = r.insertId;
    }
    const errs = [];
    const cur = await one('SELECT thumb, pdf FROM posts WHERE id = ?', [id]);
    if (flag(f.del_thumb) && cur.thumb) { removeFile('posts', cur.thumb); await run('UPDATE posts SET thumb = NULL WHERE id = ?', [id]); cur.thumb = null; }
    if (flag(f.del_pdf) && cur.pdf) { removeFile('pdf', cur.pdf); await run('UPDATE posts SET pdf = NULL WHERE id = ?', [id]); cur.pdf = null; }
    if (c.files.thumb?.[0]) { const r = await saveImage(c.files.thumb[0], { folder: 'posts', maxW: 900, square: true, targetKB: 140 }); if (r.file) { removeFile('posts', cur.thumb); await run('UPDATE posts SET thumb = ? WHERE id = ?', [r.file, id]); } else errs.push(r.err); }
    if (c.files.pdf?.[0]) { const r = savePdf(c.files.pdf[0]); if (r.file) { removeFile('pdf', cur.pdf); await run('UPDATE posts SET pdf = ? WHERE id = ?', [r.file, id]); } else errs.push(r.err); }
    let have = Number(await col('SELECT COUNT(*) FROM post_images WHERE post_id = ?', [id], 0));
    for (const g of c.files.gallery || []) { if (have >= 5) break; const r = await saveImage(g, { folder: 'posts', maxW: 1600 }); if (r.file) { await run('INSERT INTO post_images (post_id, image, sort_order) VALUES (?,?,?)', [id, r.file, have]); have += 1; } else errs.push(r.err); }
    for (const imgId of arr(f.del_img).map((x) => int(x)).filter(Boolean)) { const im = await one('SELECT * FROM post_images WHERE id = ? AND post_id = ?', [imgId, id]); if (im) { removeFile('posts', im.image); await run('DELETE FROM post_images WHERE id = ?', [im.id]); } }
    await run('DELETE FROM post_links WHERE post_id = ?', [id]);
    const us = arr(f.link_url); const ts = arr(f.link_type); const ls = arr(f.link_label); const applyIdx = arr(f.link_apply_idx);
    /* "আবেদন বাটন" চেকবক্স শুধু টিক দেওয়া সারির মান পাঠায় — তাই সারির ক্রম মিলিয়ে আলাদা করি */
    const applySet = new Set(arr(f.link_apply_rows).map((x) => int(x, -1)));
    for (let i = 0; i < us.length; i++) {
      const u = normalizeLink(str(ts[i]) || 'url', String(us[i] || '')); if (!u) continue;
      await run('INSERT INTO post_links (post_id, label, url, is_apply, sort_order) VALUES (?,?,?,?,?)', [id, str(ls[i], 120), u, applySet.has(i) ? 1 : 0, i]);
    }
    /* নতুন প্রকাশ হলে সাবস্ক্রাইবারদের জানাই (এডমিন টিক তুললে) */
    if (d.status === 1 && !wasLive && flag(f.notify)) await enqueueNewPost(id);
    return c.go(`post?id=${id}`, errs.length ? 'err' : 'ok', errs.length ? errs.join(' ') : 'সংরক্ষণ হয়েছে।');
  },

  async get(c) {
    const id = int(c.query.id); const au = c.au;
    const p = id ? await one('SELECT * FROM posts WHERE id = ?', [id]) : null;
    if (id && !p) return c.go('posts', 'err', 'পোস্টটি পাওয়া যায়নি।');
    const [cats, images, links] = await Promise.all([categories(), id ? all('SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order', [id]) : [], id ? all('SELECT * FROM post_links WHERE post_id = ? ORDER BY sort_order', [id]) : []]);
    const v = (k, d = '') => (p ? p[k] ?? d : d);
    const isNew = !p || !Number(p.status);
    return c.page(p ? 'পোস্ট এডিট' : 'নতুন পোস্ট', html`
<form method="post" enctype="multipart/form-data" id="postForm">${csrfField(c.csrf)}<input type="hidden" name="content_b64" id="contentB64">
${p?.review_pending ? html`<div class="msg info" style="display:block"><b>${ic('bot')} AI দিয়ে তৈরি — রিভিউর অপেক্ষায়</b><br>তথ্যগুলো (তারিখ, পদ সংখ্যা, লিংক) মূল বিজ্ঞপ্তির সাথে মিলিয়ে নিন। ঠিক থাকলে নিচে “প্রকাশ” চালু করে সেভ করুন।
  ${p.source_url ? html`<div style="margin-top:6px;font-size:.82rem">উৎস: <a href="${p.source_url}" target="_blank" rel="noopener"><u>${new URL(p.source_url).host}</u> ${ic('external')}</a></div>` : ''}${p.auto_note ? html`<div style="margin-top:8px;background:var(--surface);padding:8px 12px;border-radius:10px;white-space:pre-line;color:var(--warn)">⚠️ ${p.auto_note}</div>` : ''}</div>` : ''}
${card('মূল তথ্য', 'file-text', html`<div class="grid">
  ${field('শিরোনাম *', input('title', v('title'), { req: true, max: 255 }))}
  <div class="grid g2">${field('ক্যাটাগরি', sel('cat_id', v('cat_id'), cats.map((x) => [x.id, x.name]), { empty: '— বাছাই করুন —' }))}${field('প্রতিষ্ঠান / কোম্পানি', input('company', v('company'), { max: 160 }))}</div>
  <div class="grid g3">${field('বিভাগ', sel('division', v('division'), [...DIVISIONS, 'সারাদেশ'].map((x) => [x, x]), { empty: '—' }))}${field('জেলা / এলাকা', input('district', v('district'), { max: 60 }))}${field('পদ সংখ্যা', input('vacancy', v('vacancy'), { max: 30 }))}</div>
  <div class="grid g3">${field('বেতন', input('salary', v('salary'), { max: 100, ph: 'যেমন ২০,০০০–৩০,০০০' }))}${field('চাকরির ধরন', sel('employment_type', v('employment_type', 'FULL_TIME'), Object.entries(JOB_TYPES)))}${field('আবেদনের শেষ তারিখ', input('deadline', v('deadline') ? String(v('deadline')).slice(0, 10) : '', { type: 'date' }))}</div>
  ${swRow('is_job', Number(v('is_job')) === 1, 'এটি চাকরির পোস্ট (JobPosting স্কিমা)', 'চাকরি ক্যাটাগরির বাইরের পোস্টেও গুগলের জব কার্ড চাইলে চালু করুন')}</div>`)}
${card('বিস্তারিত লেখা', 'edit', html`<div class="ed-tools" role="toolbar"><button type="button" data-tag="h2" title="বড় শিরোনাম">H২</button><button type="button" data-tag="h3" title="ছোট শিরোনাম">H৩</button><span class="sep"></span><button type="button" data-tag="b"><b>B</b></button><button type="button" data-tag="i"><i>I</i></button><span class="sep"></span><button type="button" data-tag="ul" title="বুলেট">• তালিকা</button><button type="button" data-tag="ol" title="নম্বর">১. তালিকা</button><button type="button" data-tag="a">লিংক</button><button type="button" data-tag="table">টেবিল</button><button type="button" data-tag="hr">—</button><span style="flex:1"></span><button type="button" id="edPreviewBtn" style="background:var(--brand-soft);color:var(--brand-ink)">প্রিভিউ</button></div>
<textarea id="content" name="content" style="min-height:340px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.88rem">${v('content')}</textarea><div class="ed-prev" id="edPrev"></div>
<div class="hint">সাদা লেখা লিখলেও চলবে (লাইন = অনুচ্ছেদ, “- ” = তালিকা, শেষে “:” থাকলে শিরোনাম)। HTML লিখলে সেটাই নিরাপদ করে দেখানো হবে।</div>`)}
${card('ছবি ও ফাইল', 'image', html`<div class="grid g2">
  <div>${field('থাম্বনেইল (স্কোয়ার, অটো ≈১৪০ কেবি)', html`<input type="file" name="thumb" accept="image/*">`)}${p?.thumb ? html`<div class="med sq" style="margin-top:8px;max-width:150px"><img src="${uploadUrl(p.thumb)}" alt=""><label class="x"><input type="checkbox" name="del_thumb" value="1" style="width:14px;height:14px">মুছুন</label></div>` : ''}</div>
  <div>${field('পিডিএফ (সর্বোচ্চ ১৫ এমবি)', html`<input type="file" name="pdf" accept="application/pdf">`)}${p?.pdf ? html`<div class="msg" style="margin:8px 0 0;background:var(--surface-2);justify-content:space-between"><a href="/uploads/pdf/${p.pdf}" target="_blank" rel="noopener" style="color:var(--bad)">${ic('file-down')} ${p.pdf}</a><label style="display:flex;gap:6px;align-items:center;font-size:.8rem;color:var(--bad)"><input type="checkbox" name="del_pdf" value="1">মুছুন</label></div>` : ''}</div></div>
<div style="margin-top:14px">${field(`গ্যালারি (সর্বোচ্চ ৫টি — এখন ${bn(images.length)}টি)`, html`<input type="file" name="gallery" accept="image/*" multiple>`)}
${images.length ? html`<div class="med-grid" style="margin-top:10px">${images.map((im) => html`<div class="med"><img src="${uploadUrl(im.image)}" alt=""><label class="x"><input type="checkbox" name="del_img" value="${im.id}" style="width:14px;height:14px">মুছুন</label></div>`)}</div>` : ''}</div>`)}
${card('আবেদন ও যোগাযোগের লিংক', 'link', html`<div id="linkBox">${links.map((l, i) => linkRow(l))}</div><button type="button" class="btn sec sm" id="addLink">${ic('plus')}লিংক যোগ করুন</button>
<template id="linkTpl">${linkRow()}</template><div class="hint">“আবেদন বাটন” টিক দিলে সেটি বড় সবুজ বাটনে দেখাবে। ইমেইল/ফোন/হোয়াটসঅ্যাপ নিজে থেকে সঠিক ফরম্যাটে বসবে।</div>`)}
${card('প্রিমিয়াম (বিজ্ঞাপন)', 'crown', html`${swRow('is_premium', Number(v('is_premium')) === 1, 'প্রিমিয়াম হিসেবে প্রচার করুন', 'হোমের তালিকায় সোনালি কার্ডে এবং “বিজ্ঞাপন” পেজে দেখাবে')}<div style="max-width:260px">${field('মেয়াদ শেষ (খালি = অনির্দিষ্ট)', input('premium_until', v('premium_until') ? String(v('premium_until')).slice(0, 10) : '', { type: 'date' }))}</div>`, 'gold')}
${card('SEO', 'globe', html`<div class="grid">${field('লিংকের নাম (স্লাগ) — খালি রাখলে অটো', input('slug', v('slug'), { max: 190 }), p ? 'বদলালে পুরোনো লিংক নতুনে অটো রিডাইরেক্ট হবে।' : '')}${field('কীওয়ার্ড (কমা দিয়ে)', input('keywords', v('keywords'), { max: 300 }))}${field('মেটা টাইটেল (খালি = শিরোনাম)', input('meta_title', v('meta_title'), { max: 190 }))}${field('মেটা বিবরণ', input('meta_desc', v('meta_desc'), { max: 300 }))}</div>`)}
${card('প্রকাশ', 'send', html`${swRow('status', p ? Number(p.status) === 1 : true, 'প্রকাশ করুন', 'বন্ধ থাকলে খসড়া হিসেবে থাকবে, সাইটে দেখাবে না')}${swRow('notify', isNew, 'সাবস্ক্রাইবারদের জানান', 'নতুন প্রকাশ হলে নোটিফিকেশন ও ইমেইলে খবর যাবে (পুরোনো পোস্ট এডিটে আবার যাবে না)')}`)}
<div class="save-bar">${p ? html`<button class="btn dan sec" type="submit" name="do" value="delete" data-confirm="রিসাইকেল বিনে পাঠাবেন?" style="margin-right:auto">${ic('trash')}বিনে</button><a class="btn sec" href="/post/${p.slug}" target="_blank" rel="noopener">${ic('eye')}দেখুন</a>` : ''}<button class="btn" type="submit">${ic('save')}সংরক্ষণ করুন</button></div></form>
<script>document.addEventListener('submit',function(e){var f=e.target;if(f.id!=='postForm')return;/* আবেদন বাটনের সারি-নম্বর */ [].slice.call(f.querySelectorAll('.lnk-row')).forEach(function(r,i){var cb=r.querySelector('[name=link_apply]');if(cb&&cb.checked){var h=document.createElement('input');h.type='hidden';h.name='link_apply_rows';h.value=i;f.appendChild(h);}});},true);</script>`);
  },
};
