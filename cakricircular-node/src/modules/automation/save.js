/* ─────────────────────────────────────────────
   AI-এর উত্তর → পোস্টের ঘর, লিংক, পিডিএফ; খসড়া হিসেবে সেভ (কখনো নিজে প্রকাশ হয় না)
   ───────────────────────────────────────────── */
import { all, one, col, run } from '../../db.js';
import { bn, en, nowStr } from '../../core/bn.js';
import { nextCatSlug } from '../../core/slug.js';
import { savePdf } from '../../core/images.js';
import { http } from './source.js';
import { log } from './log.js';

const bnDigits = (s) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const dateOf = (s) => { const t = en(String(s || '')); const all_ = [...t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)].map((m) => m[0]).filter((d) => { const x = new Date(`${d}T00:00:00Z`); return !Number.isNaN(x.getTime()) && x.toISOString().slice(0, 10) === d; }); return all_.sort().pop() || null; };
const urlOf = (u) => { u = String(u || '').trim(); try { if (/^https?:\/\//i.test(u)) return new URL(u).href.slice(0, 500); } catch { /* */ } return ''; };
const cut = (s, n) => Array.from(String(s || '').trim()).slice(0, n).join('');
export const DIVISIONS = ['ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ', 'সারাদেশ'];

export function postFields(ai, cats, divisions = DIVISIONS) {
  let cat = cats.find((c) => c.name === String(ai.category || '').trim());
  if (!cat && ai.category) cat = cats.find((c) => String(ai.category).includes(c.name));
  if (!cat) cat = cats.find((c) => ['chakri', 'job'].includes(c.slug)) || cats[0];
  const title = cut(String(ai.title || '').replace(/<[^>]*>/g, ''), 250); if (!title) return null;
  let division = String(ai.division || '').trim(); if (!divisions.includes(division)) division = 'সারাদেশ';
  let vacancy = bnDigits(en(String(ai.vacancy || '').trim())); if (!vacancy || vacancy === '০' || vacancy.includes('অনির্দিষ্ট')) vacancy = 'একাধিক';
  let etype = String(ai.employment_type || 'FULL_TIME').toUpperCase().trim(); if (!['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN'].includes(etype)) etype = 'FULL_TIME';
  let content = String(ai.content_html || '').replace(/<(script|style|iframe)\b[\s\S]*?<\/\1>/gi, '');
  content = content.replace(/<a\b[^>]*href="[^"]*bdgovtjob[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1');
  content = content.replace(/<a\b([^>]*)>/gi, (m, a) => `<a${a.replace(/\s(target|rel)="[^"]*"/gi, '')} target="_blank" rel="nofollow noopener">`);
  return { cat_id: cat?.id || null, cat_slug: cat?.slug || '', title, content, division, district: cut(ai.district, 60) || null, vacancy: cut(vacancy, 30), salary: cut(ai.salary, 100) || null, company: cut(ai.company, 160) || null,
    employment_type: etype, deadline: dateOf(ai.deadline), application_start: dateOf(ai.application_start), is_job: ['chakri', 'job', 'chakri-circular', 'chakrir-khobor'].includes(cat?.slug) ? 1 : 0,
    keywords: cut(ai.keywords, 300) || null, meta_title: cut(ai.meta_title, 190) || null, meta_desc: cut(ai.meta_description, 300) || null, note: String(ai.confidence_note || '').trim() };
}

export async function saveLinks(id, ai, scr, replace = false) {
  if (replace) await run('DELETE FROM post_links WHERE post_id = ?', [id]).catch(() => {});
  let order = 0;
  const a = urlOf(ai.apply_url); if (a) await run('INSERT INTO post_links (post_id, label, url, is_apply, sort_order) VALUES (?,?,?,1,?)', [id, 'অনলাইনে আবেদন করুন', a, order++]);
  const o = urlOf(ai.official_url); if (o) await run('INSERT INTO post_links (post_id, label, url, is_apply, sort_order) VALUES (?,?,?,0,?)', [id, 'অফিসিয়াল ওয়েবসাইট', o, order++]);
  if (scr.pdf && !(await col('SELECT pdf FROM posts WHERE id = ?', [id]))) {
    const r = await http(scr.pdf, { timeout: 25000, maxBytes: 10 * 1024 * 1024, binary: true });
    if (r.code === 200 && Buffer.isBuffer(r.body) && r.body.slice(0, 4).toString() === '%PDF') {
      const name = `auto-${id}-${Math.random().toString(16).slice(2, 10)}.pdf`;
      const s = savePdf({ buffer: r.body }, name); if (s.file) await run('UPDATE posts SET pdf = ? WHERE id = ?', [name, id]);
    } else await log(`পিডিএফ নামানো যায়নি: ${scr.pdf}`, 'warn');
  }
}

/** নতুন খসড়া (রিভিউ বাকি) */
export async function autoSave(ai, scr, srcUrl, lastmod, cats, opt = {}) {
  const f = postFields(ai, cats); if (!f) return null;
  const notes = []; if (f.note) notes.push(f.note); if (opt.note) notes.push(String(opt.note));
  if (!opt.skipGuard) {
    const { matchMyPost } = await import('./engine.js');
    try { const m = await matchMyPost(f.title); if (m) notes.push(`সম্ভাব্য ডুপ্লিকেট: #${m.id} «${cut(m.title, 60)}» — প্রকাশের আগে মিলিয়ে দেখুন।`); } catch { /* */ }
  }
  const slug = await nextCatSlug(f.cat_id || 0, f.title);
  const r = await run(`INSERT INTO posts (cat_id,title,slug,content,division,district,vacancy,salary,company,employment_type,deadline,is_job,keywords,meta_title,meta_desc,status,is_auto,review_pending,source_url,source_lastmod,auto_note,application_start,published_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1,1,?,?,?,?,NOW(),NOW())`,
  [f.cat_id, f.title, slug, f.content, f.division, f.district, f.vacancy, f.salary, f.company, f.employment_type, f.deadline, f.is_job, f.keywords, f.meta_title, f.meta_desc, String(srcUrl).slice(0, 500), lastmod, notes.length ? notes.join('\n') : null, f.application_start]);
  if (!r.insertId) return null;
  await saveLinks(r.insertId, ai, scr);
  return r.insertId;
}

/** খসড়া পোস্টের লেখা নতুন করে বসানো (প্রকাশিত পোস্ট কখনো ছোঁয় না) */
export async function autoUpdatePost(postId, ai, scr, lastmod, cats) {
  const f = postFields(ai, cats); if (!f) return false;
  const t = new Date(Date.now() + 6 * 3600e3).toISOString();
  const note = `[${t.slice(8, 10)}/${t.slice(5, 7)} ${t.slice(11, 16)}] সোর্সে আপডেট হওয়ায় লেখা নতুন করে তৈরি হয়েছে — প্রকাশের আগে দেখুন।${f.note ? `\n${f.note}` : ''}`;
  const r = await run(`UPDATE posts SET title=?, content=?, division=?, district=?, vacancy=?, salary=?, company=?, employment_type=?, deadline=?, keywords=?, meta_title=?, meta_desc=?, updated_at=NOW(), review_pending=1, source_lastmod=?, auto_note=CONCAT(COALESCE(auto_note,''), ?), application_start=? WHERE id=? AND status=0 AND deleted_at IS NULL`,
    [f.title, f.content, f.division, f.district, f.vacancy, f.salary, f.company, f.employment_type, f.deadline, f.keywords, f.meta_title, f.meta_desc, lastmod, `\n${note}`, f.application_start, postId]);
  if (r.affectedRows < 1) return false;
  await saveLinks(postId, ai, scr, true);
  return true;
}
