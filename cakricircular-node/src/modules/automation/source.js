/* ─────────────────────────────────────────────
   সোর্স সাইট (WordPress REST API) থেকে আনা — AI ছাড়া, সস্তা ও দ্রুত
   ভদ্র গতি: একসাথে বেশি অনুরোধ নয়, অনুরোধের মাঝে ছোট বিরতি
   ───────────────────────────────────────────── */
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import { setting } from '../../core/settings.js';
import { en } from '../../core/bn.js';
import { plain, sleep } from './util.js';

export const UA = 'Mozilla/5.0 (compatible; CakriCircularBot/2.0; +https://cakricircular.com)';
export const PER_PAGE = 50;
export const sourceBase = () => setting('auto_source', 'https://bdgovtjob.net').replace(/\/+$/, '');
export let lastError = '';

/* ধারাবাহিক বিরতি: দুই অনুরোধের মাঝে অন্তত এতটা সময় */
let gate = Promise.resolve(); let lastAt = 0;
const GAP = () => (globalThis.__autoTest ? 0 : Number(setting('auto_gap_ms', '500')) || 500);
function throttle() {
  gate = gate.then(async () => { const w = lastAt + GAP() - Date.now(); if (w > 0) await sleep(w); lastAt = Date.now(); });
  return gate;
}

export async function http(url, { timeout = 25000, maxBytes = 8_000_000, binary = false } = {}) {
  if (globalThis.__autoMockHttp) return globalThis.__autoMockHttp(url);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: binary ? '*/*' : 'application/json, text/html;q=0.9,*/*;q=0.8', 'Accept-Language': 'bn,en;q=0.8' }, signal: ctl.signal, redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer()).subarray(0, maxBytes);
    const headers = {}; res.headers.forEach((v, k) => { headers[k] = v; });
    return { code: res.status, body: binary ? buf : buf.toString('utf8'), headers, err: '' };
  } catch (e) { return { code: 0, body: binary ? Buffer.alloc(0) : '', headers: {}, err: e.name === 'AbortError' ? 'সময় শেষ' : String(e.message || e) }; }
  finally { clearTimeout(t); }
}

async function get(url, timeout = 20000) {
  let last = { code: 0, body: '', headers: {}, err: '' };
  for (let i = 0; i < 3; i++) {
    await throttle();
    last = await http(url, { timeout });
    if (last.code === 200) return last;
    if (last.code >= 400 && last.code < 500 && last.code !== 429) break;
    await sleep(700 * (i + 1));
  }
  return last;
}
const dt = (v) => { const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(String(v || '').trim()); return m ? `${m[1]} ${m[2]}` : null; };
const nowStr = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');

/** পোস্টের তালিকা (শুধু ID/তারিখ/শিরোনাম) — ব্যর্থ হলে null */
export async function list(page, orderby = 'date') {
  const url = `${sourceBase()}/wp-json/wp/v2/posts?per_page=${PER_PAGE}&page=${page}&orderby=${orderby === 'modified' ? 'modified' : 'date'}&order=desc&_fields=id,date,modified,link,slug,title`;
  const r = await get(url);
  if (r.code === 400 && page > 1 && /invalid_page/i.test(r.body)) return { items: [], pages: page - 1, total: 0 };
  if (r.code !== 200) { lastError = `HTTP ${r.code}${r.err ? ` (${r.err})` : ''}`; return null; }
  let j; try { j = JSON.parse(r.body); } catch { lastError = 'উত্তর JSON নয় (সম্ভবত কোনো নিরাপত্তা-পাতা)'; return null; }
  if (!Array.isArray(j)) { lastError = 'অপ্রত্যাশিত উত্তর'; return null; }
  const items = j.filter((p) => p && p.id).map((p) => ({
    id: Number(p.id), date: dt(p.date) || nowStr(), modified: dt(p.modified) || dt(p.date) || nowStr(), link: String(p.link || ''),
    slug: (() => { try { return decodeURIComponent(String(p.slug || '')); } catch { return String(p.slug || ''); } })(), title: plain(p.title?.rendered || ''),
  }));
  const pages = Number(r.headers['x-wp-totalpages']) || 0;
  return { items, pages: pages > 0 ? pages : (items.length ? page + 1 : page), total: Number(r.headers['x-wp-total']) || 0 };
}

/** একটি পোস্টের পূর্ণ লেখা */
export async function detail(id) {
  const r = await get(`${sourceBase()}/wp-json/wp/v2/posts/${id}?_fields=id,title,content,date,modified,link,categories`, 25000);
  if (r.code !== 200) { lastError = `HTTP ${r.code}${r.err ? ` (${r.err})` : ''}`; return null; }
  let p; try { p = JSON.parse(r.body); } catch { lastError = 'উত্তর JSON নয়'; return null; }
  if (!p?.id) { lastError = 'উত্তর JSON নয়'; return null; }
  return { id: Number(p.id), title: plain(p.title?.rendered || ''), html: String(p.content?.rendered || ''), date: dt(p.date), modified: dt(p.modified), link: String(p.link || '') };
}

/* এগুলো সোর্স রোজ বদলায় — রাখলে একই লেখাকেও "বদলেছে" মনে হতো */
const DROP_CLASSES = ['kk-star', 'kksr', 'share', 'related', 'comment', 'adsbygoogle', 'sharedaddy', 'jc-trust-badge', 'jc-toc', 'jc-community', 'jc-category-hub', 'jc-smart-cat', 'ppv', 'rating', 'post-views', 'view-count', 'counter', 'social', 'telegram', 'whatsapp'];

/** HTML থেকে পরিষ্কার লেখা + লিংক + পিডিএফ + লেখার আঙুলের ছাপ (hash) */
export function parse(html, title) {
  if (!String(html).trim()) return null;
  const $ = cheerio.load(`<div id="__root">${html}</div>`, { decodeEntities: true });
  const root = $('#__root');
  let pdf = '';
  root.find('[data-url], a[href]').each((_, el) => { if (pdf) return; const u = ($(el).attr('data-url') || $(el).attr('href') || '').trim(); if (/^https?:\/\//i.test(u) && /\.pdf(\?|$)/i.test(u)) pdf = u; });
  root.find('script,style,noscript,iframe,form,nav,footer,aside,button,svg,img,input').remove();
  root.find('*').each((_, el) => { const c = ($(el).attr('class') || '').toLowerCase(); if (c && DROP_CLASSES.some((k) => c.includes(k))) $(el).remove(); });
  root.find('#related-categories, #table-of-contents').remove();
  const links = {}; const srcHost = new URL(sourceBase()).host;
  root.find('a[href]').each((_, a) => {
    if (Object.keys(links).length >= 15) return;
    const href = ($(a).attr('href') || '').trim(); if (!/^https?:\/\//i.test(href)) return;
    let host = ''; try { host = new URL(href).host; } catch { return; }
    if ((/bdgovtjob/i.test(host) || host.includes(srcHost)) && !/\.pdf(\?|$)/i.test(href)) return;
    links[href] = $(a).text().replace(/\s+/g, ' ').trim().slice(0, 80);
  });
  let inner = root.html() || '';
  inner = inner.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|table|ul|ol|section|details|summary)>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ');
  let text = cheerio.load(`<div>${inner}</div>`).text();
  text = text.replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
  const hash = crypto.createHash('md5').update(en(text).toLowerCase().replace(/\s+/g, ' ')).digest('hex');
  return { title, text: text.slice(0, 9000), full: text, links, pdf, hash, short: Array.from(text).length < 150 };
}
