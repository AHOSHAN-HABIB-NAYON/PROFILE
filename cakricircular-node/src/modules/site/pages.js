/* ─────────────────────────────────────────────
   পাবলিক পেজগুলোর কনটেন্ট তৈরি (প্রতিটি ফাংশন {…P, body} ফেরত দেয়)
   ───────────────────────────────────────────── */
import { html, raw } from '../../core/html.js';
import { setting } from '../../core/settings.js';
import { bn, bnDateTime, bnDate, dmy, timeAgo, deadlineInfo, ts, en, iso } from '../../core/bn.js';
import { formatContent, excerpt, schemaDescription, usesFontAwesome } from '../../core/content.js';
import { ic } from '../../ui/icons.js';
import { postCard, postList, pager, hero, secTitle, countBtn, emptyBox, uploadUrl, toneOf } from '../../ui/components.js';
import { teamCard, defaultOg } from '../../ui/layout.js';
import * as D from './data.js';
import { all, run } from '../../db.js';

const siteName = () => setting('site_name', 'চাকরি সার্কুলার');
const NF = Symbol('notfound');
export const notFound = () => ({ [NF]: true });
export const isNotFound = (x) => Boolean(x && x[NF]);

/* ───────── হোম ───────── */
export async function home(ctx, page = 1) {
  const per = D.perPage();
  const off = (page - 1) * per;
  const [total, totalOrd] = await Promise.all([D.countPosts(), D.countPosts(D.NOT_PREMIUM.replace(/^ AND /, ''))]);
  const pages = Math.max(1, Math.ceil(totalOrd / per));
  if (page > pages) return notFound();
  const rows = await D.listPosts({ where: D.NOT_PREMIUM.replace(/^ AND /, ''), limit: per, offset: off });
  const feed = await D.premiumFeed(rows, page);
  const banners = page === 1 ? await D.banners() : [];
  const slide = (b, i) => {
    const img = html`<img src="${uploadUrl(b.image, 'banners')}" alt="${b.title || ''}" width="856" height="292" ${raw(i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"')} decoding="async" draggable="false">`;
    return html`<div class="bnr-slide">${b.link ? html`<a href="${b.link}" target="_blank" rel="noopener sponsored">${img}</a>` : img}</div>`;
  };
  const body = html`
${banners.length ? html`<div class="bnr" aria-label="বিজ্ঞাপন"><div class="bnr-win"><div class="bnr-track">${banners.map(slide)}</div>
  ${banners.length > 1 ? html`<button class="bnr-arr prev" aria-label="আগের">${ic('chev-l')}</button><button class="bnr-arr next" aria-label="পরের">${ic('chev-r')}</button>` : ''}</div>
  ${banners.length > 1 ? html`<div class="bnr-dots">${banners.map((b, i) => html`<button class="bnr-dot${i === 0 ? ' on' : ''}" aria-label="স্লাইড ${bn(i + 1)}"></button>`)}</div>` : ''}</div>` : ''}
<h1 class="home-h1">${setting('home_h1', 'চাকরি সার্কুলার ও আজকের চাকরির খবর')}</h1>
<p class="home-sub">সরকারি-বেসরকারি চাকরি, ভর্তি, রেজাল্ট ও নোটিশ — এক জায়গায়।</p>
${secTitle({ icon: 'megaphone', title: 'সর্বশেষ আপডেট', sub: 'নতুন চাকরি ও নিয়োগ বিজ্ঞপ্তি', right: countBtn(total, '/search') })}
${rows.length ? html`${postList(feed)}${pager(page, pages, (i) => (i > 1 ? `/page/${i}` : '/'))}` : emptyBox('inbox', 'এখনো কোনো পোস্ট প্রকাশ করা হয়নি।')}`;
  return {
    title: setting('meta_title', 'চাকরি সার্কুলার | আজকের চাকরির খবর | সরকারি ও বেসরকারি চাকরি') + (page > 1 ? ` | পৃষ্ঠা ${bn(page)}` : ''),
    desc: setting('meta_description', 'চাকরি সার্কুলার — আজকের চাকরির খবর, সরকারি চাকরি, বেসরকারি চাকরি, ব্যাংক চাকরি, শিক্ষক নিয়োগ ও নিয়োগ বিজ্ঞপ্তি প্রতিদিন হালনাগাদ।'),
    canonical: page > 1 ? `/page/${page}` : '/', nav: 'home', page: 'home', body,
  };
}

/* ───────── ক্যাটাগরি ───────── */
export async function category(ctx, slug, page = 1) {
  const cat = await D.categoryBySlug(slug);
  if (!cat) return notFound();
  const per = D.perPage();
  const total = await D.countPosts('p.cat_id = ?', [cat.id]);
  const pages = Math.max(1, Math.ceil(total / per));
  if (page > pages) return notFound();
  const rows = await D.listPosts({ where: 'p.cat_id = ?', args: [cat.id], limit: per, offset: (page - 1) * per });
  const [todayN, openN] = await Promise.all([
    all('SELECT COUNT(*) n FROM posts p WHERE p.status=1 AND p.deleted_at IS NULL AND p.cat_id=? AND DATE(p.published_at)=CURDATE()', [cat.id]).then((r) => Number(r[0].n)),
    all('SELECT COUNT(*) n FROM posts p WHERE p.status=1 AND p.deleted_at IS NULL AND p.cat_id=? AND (p.deadline IS NULL OR p.deadline>=CURDATE())', [cat.id]).then((r) => Number(r[0].n)),
  ]);
  const chips = [['layers', `মোট ${bn(total)} টি`]]; if (todayN) chips.push(['zap', `আজ ${bn(todayN)} টি নতুন`]); chips.push(['check-circle', `চলমান ${bn(openN)} টি`]);
  const body = html`${hero({ icon: cat.icon || 'folder', title: cat.name, sub: `${cat.name} সংক্রান্ত সর্বশেষ বিজ্ঞপ্তি ও খবর`, chips })}
${rows.length ? html`${secTitle({ icon: 'list', title: `সর্বশেষ ${cat.name}`, sub: 'নতুন বিজ্ঞপ্তি আগে', right: countBtn(total, `/search?cat=${cat.id}`) })}${postList(rows)}${pager(page, pages, (i) => `/category/${cat.slug}${i > 1 ? `/page/${i}` : ''}`)}` : emptyBox('folder', 'এই ক্যাটাগরিতে এখনো কিছু যোগ করা হয়নি।')}`;
  return {
    title: (cat.meta_title || `${cat.name} — ${siteName()}`) + (page > 1 ? ` | পৃষ্ঠা ${bn(page)}` : ''),
    desc: cat.meta_desc || `${cat.name} সংক্রান্ত সর্বশেষ বিজ্ঞপ্তি ও খবর — প্রতিদিন হালনাগাদ। মোট ${bn(total)} টি প্রকাশিত।`,
    canonical: `/category/${cat.slug}${page > 1 ? `/page/${page}` : ''}`, nav: 'category', catSlug: cat.slug, page: 'category', body,
    schema: [{ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'হোম', item: `${ctx.base}/` }, { '@type': 'ListItem', position: 2, name: cat.name, item: `${ctx.base}/category/${cat.slug}` }] }],
  };
}

/* ───────── ট্রেন্ডিং ───────── */
export async function trending(ctx, page = 1) {
  const per = D.perPage();
  const total = await D.countPosts();
  const pages = Math.max(1, Math.ceil(total / per));
  if (page > pages) return notFound();
  const rows = await D.listPosts({
    order: 'hot DESC, p.views DESC, p.published_at DESC', limit: per, offset: (page - 1) * per,
    extraSelect: ', COALESCE(v.hot,0) AS hot',
    join: 'LEFT JOIN (SELECT post_id, COUNT(*) AS hot FROM post_views WHERE day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY post_id) v ON v.post_id = p.id',
  });
  const body = html`${hero({ icon: 'flame', cls: 'hot', title: 'ট্রেন্ডিং', sub: 'গত সাত দিনে সবচেয়ে বেশি পড়া বিজ্ঞপ্তিগুলো', chips: [['calendar', 'গত ৭ দিন'], ['trend', 'জনপ্রিয়তা অনুযায়ী সাজানো']] })}
${rows.length ? html`${secTitle({ icon: 'trend', cls: 'hot', title: 'সবচেয়ে আলোচিত', sub: 'সবচেয়ে বেশি পড়া হচ্ছে', right: countBtn(total, '/search?sort=popular') })}${postList(rows)}${pager(page, pages, (i) => `/trending${i > 1 ? `/page/${i}` : ''}`)}` : emptyBox('flame', 'এখনো ট্রেন্ডিং কিছু নেই।')}`;
  return { title: `ট্রেন্ডিং — এখন সবচেয়ে বেশি দেখা হচ্ছে | ${siteName()}`, desc: 'গত সাত দিনে সবচেয়ে বেশি পড়া চাকরি, ভর্তি ও রেজাল্টের বিজ্ঞপ্তি।', canonical: `/trending${page > 1 ? `/page/${page}` : ''}`, nav: 'trending', page: 'trending', body };
}

/* ───────── বিজ্ঞাপন (প্রিমিয়াম) ───────── */
export async function promoted(ctx, page = 1) {
  const per = D.perPage();
  const W = "(p.is_premium = 1 AND (p.premium_until IS NULL OR p.premium_until >= CURDATE()))";
  const total = await D.countPosts(W);
  const pages = Math.max(1, Math.ceil(total / per));
  if (page > pages) return notFound();
  const rows = await D.listPosts({ where: W, limit: per, offset: (page - 1) * per });
  const todayN = Number((await all(`SELECT COUNT(*) n FROM posts p WHERE ${D.ACTIVE} AND ${W} AND DATE(p.published_at)=CURDATE()`))[0].n);
  const chips = [['megaphone', `চলমান ${bn(total)} টি`]]; if (todayN) chips.push(['zap', `আজ ${bn(todayN)} টি নতুন`]);
  const body = html`${hero({ icon: 'crown', cls: 'gold', title: 'বিজ্ঞাপন', sub: 'প্রতিষ্ঠানের প্রচারমূলক ও স্পনসর করা পোস্ট', chips })}
${rows.length ? html`<div class="inf-note warn" style="margin-bottom:6px">${ic('crown')}<p>এই পোস্টগুলো প্রতিষ্ঠানের অনুরোধে প্রচারিত। তথ্য যাচাই করে নিজ দায়িত্বে আবেদন বা যোগাযোগ করুন।</p></div>
${secTitle({ icon: 'star', cls: 'gold', title: 'চলমান বিজ্ঞাপন', sub: 'নতুন আগে দেখানো হচ্ছে', right: countBtn(total, '/promoted') })}${postList(rows)}${pager(page, pages, (i) => `/promoted${i > 1 ? `/page/${i}` : ''}`)}` : emptyBox('megaphone', 'এই মুহূর্তে কোনো বিজ্ঞাপন চলছে না।')}`;
  return { title: `বিজ্ঞাপন ও প্রিমিয়াম পোস্ট | ${siteName()}`, desc: 'প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি, ভর্তি ও প্রশিক্ষণের প্রচারমূলক পোস্ট — এক জায়গায়।', canonical: `/promoted${page > 1 ? `/page/${page}` : ''}`, nav: 'promoted', page: 'promoted', body };
}

/* ───────── সার্চ ───────── */
const JOBTYPE_MAP = { 'ফুল টাইম': 'FULL_TIME', ফুলটাইম: 'FULL_TIME', স্থায়ী: 'FULL_TIME', 'পার্ট টাইম': 'PART_TIME', পার্টটাইম: 'PART_TIME', খণ্ডকালীন: 'PART_TIME', চুক্তি: 'CONTRACTOR', চুক্তিভিত্তিক: 'CONTRACTOR', অস্থায়ী: 'TEMPORARY', ইন্টার্ন: 'INTERN' };

export async function search(ctx, query) {
  const q = String(query.q || '').trim().slice(0, 100);
  const catId = Number(query.cat) || 0;
  const div = String(query.div || '').trim();
  const state = String(query.state || '');
  const sort = String(query.sort || 'new');
  const page = Math.max(1, Number(query.page) || 1);
  const per = D.perPage();
  const where = []; const args = [];
  if (q) {
    for (const w of q.split(/\s+/).filter(Boolean).slice(0, 5)) {
      const like = `%${w}%`;
      let cond = '(p.title LIKE ? OR p.content LIKE ? OR p.keywords LIKE ? OR p.company LIKE ? OR p.division LIKE ? OR p.district LIKE ? OR p.employment_type LIKE ? OR c.name LIKE ?)';
      args.push(like, like, like, like, like, like, like, like);
      for (const [b, code] of Object.entries(JOBTYPE_MAP)) {
        if (b.includes(w) || w.includes(b)) { cond = `${cond.slice(0, -1)} OR p.employment_type = ?)`; args.push(code); break; }
      }
      where.push(cond);
    }
  }
  if (catId) { where.push('p.cat_id = ?'); args.push(catId); }
  if (div) { where.push('(p.division = ? OR p.district = ?)'); args.push(div, div); }
  if (state === 'open') where.push('(p.deadline IS NULL OR p.deadline >= CURDATE())');
  if (state === 'over') where.push('(p.deadline IS NOT NULL AND p.deadline < CURDATE())');
  const w = where.join(' AND ');
  const order = sort === 'old' ? 'p.published_at ASC' : sort === 'popular' ? 'p.views DESC, p.published_at DESC' : 'p.published_at DESC';
  const total = await D.countPosts(w, args);
  const pages = Math.max(1, Math.ceil(total / per));
  const rows = await D.listPosts({ where: w, args, order, limit: per, offset: (page - 1) * per });
  const hasFilter = Boolean(q || catId || div || state);
  if (q && page === 1) { run('INSERT INTO searches (term, hits, last_at) VALUES (?,1,NOW()) ON DUPLICATE KEY UPDATE hits = hits + 1, last_at = NOW()', [q]).catch(() => {}); }
  const cats = await D.categories(); const tops = await D.topSearches(8);
  const qs = (o) => { const p = new URLSearchParams(); Object.entries({ q, cat: catId || '', div, state, sort: sort !== 'new' ? sort : '', ...o }).forEach(([k, v]) => { if (v !== '' && v !== undefined && v !== null) p.set(k, v); }); const s = p.toString(); return `/search${s ? `?${s}` : ''}`; };
  const sel = (name, val, opts, ph) => html`<select name="${name}" aria-label="${ph}"><option value="">${ph}</option>${opts.map(([v, l]) => html`<option value="${v}" ${raw(String(v) === String(val) ? 'selected' : '')}>${l}</option>`)}</select>`;
  const body = html`${hero({ icon: 'search', title: 'খুঁজুন', sub: 'চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড লিখে সরাসরি খুঁজে নিন' })}
<form class="srch-box" id="searchForm" action="/search" method="get">
  <div class="s-field">${ic('search')}<input type="search" name="q" id="sQ" value="${q}" placeholder="চাকরি, প্রতিষ্ঠান, জেলা…" autocomplete="off" aria-label="সার্চ"><button type="button" class="s-clear${q ? ' on' : ''}" id="sClear" aria-label="মুছুন">${ic('x')}</button></div>
  <div class="s-filters">
    ${sel('cat', catId, cats.map((c) => [c.id, c.name]), 'সব ক্যাটাগরি')}
    ${sel('div', div, D.DIVISIONS.map((d) => [d, d]), 'সব বিভাগ')}
    ${sel('state', state, [['open', 'চলমান'], ['over', 'মেয়াদ শেষ']], 'আবেদনের অবস্থা')}
    ${sel('sort', sort, [['new', 'নতুন আগে'], ['old', 'পুরোনো আগে'], ['popular', 'জনপ্রিয়']], 'সাজান')}
  </div>
  <button class="btn block s-go" type="submit">${ic('search')}খুঁজুন</button>
</form>
${hasFilter ? html`<div class="s-res"><span>${q ? html`“<b>${q}</b>” এর জন্য ` : ''}মোট <b>${bn(total)}</b> টি ফলাফল</span><a class="s-clearall" href="/search">সব মুছুন</a></div>` : ''}
${rows.length ? html`${postList(rows)}${pager(page, pages, (i) => qs({ page: i > 1 ? i : '' }))}` : hasFilter ? emptyBox('search', 'কোনো ফলাফল পাওয়া যায়নি। অন্য শব্দে খুঁজে দেখুন।') : html`
  ${tops.length ? html`<div class="s-lbl">${ic('trend')}সবাই যা খুঁজছে</div><div class="s-chips">${tops.map((t) => html`<a class="hs-chip" href="/search?q=${encodeURIComponent(t.term)}">${ic('search')}${t.term}</a>`)}</div>` : ''}
  <div class="s-lbl">${ic('folder')}ক্যাটাগরি</div><div class="s-chips">${cats.map((c) => html`<a class="hs-chip" href="/category/${c.slug}">${ic(c.icon)}${c.name}</a>`)}</div>
  <div class="s-lbl">${ic('pin')}বিভাগ অনুযায়ী</div><div class="s-chips">${D.DIVISIONS.map((d) => html`<a class="hs-chip" href="/search?div=${encodeURIComponent(d)}">${ic('map')}${d}</a>`)}</div>`}`;
  return {
    title: `${q ? `“${q}” — সার্চ ফলাফল | ` : 'খুঁজুন | '}${siteName()}`,
    desc: 'চাকরি, ভর্তি, রেজাল্ট ও নোটিশ — কিওয়ার্ড, ক্যাটাগরি, বিভাগ ও আবেদনের অবস্থা দিয়ে খুঁজুন।',
    robots: 'noindex, follow', canonical: `/search${q ? `?q=${encodeURIComponent(q)}` : ''}`, nav: 'search', page: 'search', body,
  };
}

/* ───────── নোটিশ ───────── */
export async function notices() {
  await D.pruneNotices();
  const rows = await D.latestNotices(D.noticeLimit());
  const newN = rows.filter((n) => Date.now() - ts(n.created_at) < 86400000).length;
  const day = (dt) => { const d = Math.floor((Date.parse(new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10)) - Date.parse(new Date(ts(dt) + 6 * 3600e3).toISOString().slice(0, 10))) / 86400000); return d <= 0 ? 'আজ' : d === 1 ? 'গতকাল' : `${bn(d)} দিন আগে`; };
  const chips = [['inbox', `মোট ${bn(rows.length)} টি`]]; if (newN) chips.push(['bell', `নতুন ${bn(newN)} টি`]);
  const body = html`${hero({ icon: 'megaphone', title: 'নোটিশ বোর্ড', sub: 'সর্বশেষ ঘোষণা ও জরুরি তথ্য', chips })}
${rows.length ? html`<div class="nt-list" data-latest="${rows[0] ? Math.floor(ts(rows[0].created_at) / 1000) : 0}">${rows.map((n, i) => { const isNew = Date.now() - ts(n.created_at) < 86400000; return html`
<div class="nt ${isNew ? 'new' : ''}" style="--i:${Math.min(i, 10)}"><span class="nic">${ic(isNew ? 'bell' : 'info')}</span><div class="nt-body">
<div class="nt-top"><b>${n.title}</b><span class="nt-day">${day(n.created_at)}</span></div>
${n.body ? html`<p>${raw(String(html`${n.body}`).replace(/\n/g, '<br>'))}</p>` : ''}
${n.link ? html`<a class="go" href="${n.link}">বিস্তারিত দেখুন ${ic('chev-r')}</a>` : ''}
<time>${ic('clock')}${bnDateTime(n.created_at)}</time></div></div>`; })}</div>` : emptyBox('bell-off', 'এখন কোনো নোটিশ নেই।')}`;
  return { title: `নোটিশ বোর্ড | ${siteName()}`, desc: 'সর্বশেষ ঘোষণা ও জরুরি নোটিশ — চাকরি, ভর্তি ও পরীক্ষা সংক্রান্ত।', canonical: '/notices', nav: 'notices', page: 'notices', body };
}

/* ───────── রিপোর্ট ───────── */
export function report() {
  const body = html`${hero({ icon: 'flag', title: 'রিপোর্ট বা প্রমোশন', sub: 'ভুল তথ্য জানান, অথবা আপনার প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি আমাদের মাধ্যমে প্রকাশ করুন', chips: [['shield', 'আপনার তথ্য গোপন থাকবে']] })}
<form class="form-card" id="reportForm" data-mode="report" novalidate>
  <div class="rp-tabs"><button type="button" class="rp-tab active" data-mode="report">${ic('flag')}ভুল রিপোর্ট</button><button type="button" class="rp-tab" data-mode="promo">${ic('crown')}প্রমোশন</button></div>
  <p id="rpLead" style="color:var(--text-2);font-size:.92rem"></p>
  <div class="rp-info" id="rpPromoInfo">${ic('info')}<span>প্রিমিয়াম পোস্টে আপনার বিজ্ঞপ্তি হোম পেজের তালিকায় আলাদা করে দেখানো হয়। যোগাযোগ করলে আমরা বিস্তারিত জানাব।</span></div>
  <div class="f-row"><label id="rpTitleLabel" for="rp-title"></label><input class="f-in" id="rp-title" name="title" maxlength="190" required></div>
  <div class="f-row"><label id="rpDetLabel" for="rp-det"></label><textarea class="f-in" id="rp-det" name="details" maxlength="2000" required></textarea></div>
  <div class="f-row"><label id="rpEmailLabel" for="rp-email"></label><input class="f-in" id="rp-email" name="email" type="text" inputmode="email" maxlength="150" required></div>
  <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
  <div class="rp-msg" id="rpMsg"></div>
  <button class="btn block" type="submit" id="rpSubmit">${ic('send')}<span id="rpSubBtnTxt">পাঠান</span></button>
</form>`;
  return { title: `রিপোর্ট বা প্রমোশন | ${siteName()}`, desc: 'কোনো বিজ্ঞপ্তিতে ভুল তথ্য পেলে জানান, অথবা আপনার প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি আমাদের মাধ্যমে প্রকাশ করুন।', canonical: '/report', nav: '', page: 'report', body };
}

/* ───────── আমাদের সম্পর্কে / গোপনীয়তা ───────── */
export function info(key) {
  const name = siteName();
  const email = setting('contact_email', 'cakricircular.support@gmail.com');
  const today = bnDate(Date.now());
  const emBox = html`<div class="em-box"><div class="em-addr">${ic('mail')}${email}</div><small>সাধারণত ২৪–৪৮ ঘণ্টার মধ্যে উত্তর দেওয়া হয়</small><a class="btn sm" href="mailto:${email}">${ic('send')}মেইল করুন</a></div>`;
  const custom = setting(key === 'privacy' ? 'page_privacy' : 'page_about');
  let inner;
  if (custom && custom.trim()) inner = html`<div class="inf-card pd-body" style="border:0;border-top:0;margin:0;padding:16px">${raw(formatContent(custom))}</div>${emBox}`;
  else if (key === 'about') {
    inner = html`
<div class="inf-card"><h3>${ic('info')}আমরা কারা</h3><p>${name} বাংলাদেশের সরকারি ও বেসরকারি প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি, ভর্তি তথ্য, পরীক্ষার ফলাফল ও গুরুত্বপূর্ণ নোটিশ একসাথে সহজভাবে উপস্থাপন করে। প্রতিটি তথ্য মূল সার্কুলার বা প্রতিষ্ঠানের ওয়েবসাইট থেকে যাচাই করে প্রকাশ করা হয়, যাতে আপনি নির্ভরযোগ্য তথ্য দ্রুত পেতে পারেন।</p></div>
<div class="inf-card"><h3>${ic('list-check')}আমরা যা করি</h3><ul><li>প্রতিদিন নতুন নিয়োগ ও ভর্তি বিজ্ঞপ্তি প্রকাশ করি</li><li>আবেদনের শেষ তারিখ ও হাতে থাকা সময় স্পষ্টভাবে দেখাই</li><li>মূল বিজ্ঞপ্তির পিডিএফ ও আবেদনের সরাসরি লিংক সংযুক্ত করি</li><li>পরীক্ষার ফলাফল ও গুরুত্বপূর্ণ নোটিশ সময়মতো জানাই</li></ul></div>
<div class="inf-card"><h3>${ic('headset')}যোগাযোগ করুন</h3><p>কোনো বিজ্ঞপ্তিতে ভুল তথ্য চোখে পড়লে, পরামর্শ থাকলে বা সহযোগিতার প্রস্তাব থাকলে সরাসরি ইমেইলে যোগাযোগ করুন — আমরা মনোযোগ দিয়ে পড়ি ও উত্তর দেওয়ার চেষ্টা করি।</p>${emBox}</div>`;
  } else {
    inner = html`
<div class="inf-note warn">${ic('alert')}<p>${name} কোনো সরকারি প্রতিষ্ঠান নয় — এটি একটি স্বাধীন, বেসরকারি প্ল্যাটফর্ম যা বিভিন্ন সরকারি-বেসরকারি প্রতিষ্ঠানের নিয়োগ সার্কুলার একত্র করে সহজভাবে উপস্থাপন করে। বিস্তারিত জানতে নিচের তথ্যগুলো পড়ুন।</p></div>
<div class="inf-card"><h3>${ic('link')}বাইরের লিংক</h3><p>আবেদনের লিংকগুলো সংশ্লিষ্ট প্রতিষ্ঠানের নিজস্ব ওয়েবসাইট বা পোর্টালে নিয়ে যায়। সেসব ওয়েবসাইটের তথ্য, নিরাপত্তা বা গোপনীয়তা নীতির জন্য আমরা দায়ী নই।</p></div>
<div class="inf-note danger">${ic('alert')}<p><b>নিয়োগ প্রতারণা থেকে সতর্ক থাকুন —</b> সরকারি বা বেসরকারি কোনো চাকরির আবেদন, পরীক্ষা বা নিয়োগ প্রক্রিয়ার কোনো ধাপেই টাকা-পয়সা বা উপহার চাওয়া হয় না। আবেদন গ্রহণ বা নিয়োগ নিশ্চিত করার নামে কেউ অর্থ দাবি করলে বুঝবেন এটি প্রতারণা — কোনোভাবেই টাকা দেবেন না। এমন কারো সাথে ব্যক্তিগতভাবে লেনদেন করলে তার সম্পূর্ণ দায়ভার সংশ্লিষ্ট ব্যক্তির নিজের; এ ধরনের কোনো ক্ষতির জন্য ${name} দায়ী থাকবে না।</p></div>
<div class="inf-card"><h3>${ic('bell')}নোটিফিকেশন ও ইমেইল</h3><p>আপনি নতুন চাকরির খবর পেতে চাইলে ব্রাউজারের নোটিফিকেশন বা ইমেইল বেছে নিতে পারেন। নোটিফিকেশনের জন্য আপনার ডিভাইসের একটি প্রযুক্তিগত সাবস্ক্রিপশন কোড সংরক্ষিত হয় — কোনো নাম, ফোন নম্বর বা ব্যক্তিগত তথ্য নয়। ইমেইল দিলে শুধু ঠিকানা ও পছন্দ সংরক্ষিত হয় এবং আপনার নিশ্চিতকরণের পরই মেইল যায়। প্রতিটি ইমেইলে এক ক্লিকে বন্ধ করার লিংক থাকে; নোটিফিকেশন ব্রাউজারের সেটিংস থেকে যেকোনো সময় বন্ধ করা যায়। সেভ করা পোস্টের তালিকা আপনার ডিভাইসেই থাকে; রিমাইন্ডার চালু করলে শুধু পোস্টের আইডি সার্ভারে যায়।</p></div>
<div class="inf-card"><h3>${ic('copyright')}কপিরাইট ও ব্যবহারের শর্ত</h3><p>এই ওয়েবসাইটের সকল কনটেন্ট, ডিজাইন, লোগো, লেখা ও কাঠামোর সর্বস্বত্ব ${name}-এর সংরক্ষিত। পূর্বানুমতি ছাড়া এই সাইটের কোনো অংশ কপি, পুনঃপ্রকাশ, পুনঃবিতরণ বা বাণিজ্যিকভাবে ব্যবহার করা সম্পূর্ণ নিষিদ্ধ। মূল পোস্টের লিংকসহ শেয়ার করতে আমরা সবসময় স্বাগত জানাই।</p></div>
<div class="inf-card"><h3>${ic('headset')}কোনো সমস্যা বা প্রশ্ন থাকলে</h3><p>এই নীতিমালা সম্পর্কে কোনো প্রশ্ন থাকলে, কোনো তথ্য ভুল মনে হলে বা অন্য কোনো সমস্যা থাকলে সরাসরি ইমেইলে যোগাযোগ করুন —</p>${emBox}</div>`;
  }
  const meta = key === 'about' ? { t: 'আমাদের সম্পর্কে', i: 'info' } : { t: 'গোপনীয়তা ও নিরাপত্তা', i: 'shield' };
  const body = html`<div class="inf-wrap"><div class="inf-head">${ic(meta.i)}<h1>${meta.t}</h1></div>${inner}<p class="inf-updated">সর্বশেষ হালনাগাদ: ${today}</p></div>`;
  return {
    title: `${meta.t} | ${name}`,
    desc: key === 'about' ? `${name} সম্পর্কে জানুন — আমরা কারা, কী করি এবং কীভাবে যোগাযোগ করবেন।` : `${name}-এর গোপনীয়তা নীতি, বাইরের লিংক ও নিয়োগ প্রতারণা থেকে সতর্ক থাকার তথ্য।`,
    canonical: `/${key}`, nav: '', page: 'info', body,
  };
}

/* ───────── টিম ───────── */
export async function team() {
  const list = await D.teamMembers();
  const body = html`${hero({ icon: 'users', title: setting('team_title', 'আমাদের টিম'), sub: setting('team_sub', 'যাদের পরিশ্রমে প্রতিদিন নতুন তথ্য আপনার কাছে পৌঁছায়') })}
${list.length ? html`<div class="team-grid">${list.map(teamCard)}</div>` : emptyBox('users', 'টিমের তথ্য শীঘ্রই যোগ করা হবে।')}`;
  return { title: `${setting('team_title', 'আমাদের টিম')} | ${siteName()}`, desc: `${siteName()}-এর টিম — যাদের পরিশ্রমে প্রতিদিন নতুন চাকরির তথ্য প্রকাশিত হয়।`, canonical: '/team', nav: '', page: 'team', body };
}

/* ───────── সেভ করা পোস্ট (তালিকা ব্রাউজারে থাকে; কার্ড ক্লায়েন্ট ভরে) ───────── */
export function saved() {
  const body = html`${hero({ icon: 'bookmark', title: 'সেভ করা পোস্ট', sub: 'যেগুলো পরে দেখতে চান — আপনার ডিভাইসেই জমা থাকে, ইন্টারনেট ছাড়াও খোলা যায়', chips: [['lock', 'লগইন লাগে না']] })}
<div id="savedBox" data-saved><div class="plist">${[1, 2, 3].map(() => html`<div class="sk-card"><div class="skel"></div><div><span class="skel"></span><span class="skel"></span><span class="skel"></span></div></div>`)}</div></div>`;
  return { title: `সেভ করা পোস্ট | ${siteName()}`, desc: 'আপনার সেভ করা চাকরি ও বিজ্ঞপ্তির তালিকা।', robots: 'noindex, follow', canonical: '/saved', nav: 'saved', page: 'saved', body };
}

export function notFoundPage() {
  const body = html`<div class="card empty" style="padding:50px 20px">${ic('search')}<h1 style="font-size:1.3rem">পেজটি পাওয়া যায়নি</h1><p style="color:var(--muted)">আপনি যে লিংকটি খুঁজছেন সেটি সরানো হয়েছে বা ভুল।</p><a class="btn" href="/">${ic('home')}হোমে ফিরুন</a></div>`;
  return { title: `পেজটি পাওয়া যায়নি | ${siteName()}`, desc: 'পেজটি পাওয়া যায়নি।', robots: 'noindex, follow', nav: '', page: '404', body, status: 404 };
}

/* ───────── পোস্ট ডিটেইল ───────── */
export async function post(ctx, slug) {
  const p = await D.getPostBySlug(slug);
  if (!p) {
    const rd = await D.slugRedirect(slug);
    return rd ? { redirect: `/post/${rd.slug}` } : notFound();
  }
  const [images, links, related] = await Promise.all([D.postImages(p.id), D.postLinks(p.id), D.relatedPosts(p)]);
  const dl = deadlineInfo(p.deadline);
  const canonical = `${ctx.base}/post/${p.slug}`;
  const content = formatContent(p.content);
  const ogImg = p.thumb ? ctx.base + uploadUrl(p.thumb) : images[0] ? ctx.base + uploadUrl(images[0].image) : defaultOg(ctx.base);
  const metaTitle = p.meta_title || `${p.title} | ${siteName()}`;
  const metaDesc = p.meta_desc || excerpt(p.content, 160);
  const isJob = D.JOB_CATS.includes(p.cat_slug) || Number(p.is_job) === 1;
  const prem = D.isPremium(p);

  /* স্কিমা */
  const schema = [{ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'হোম', item: `${ctx.base}/` },
    { '@type': 'ListItem', position: 2, name: p.cat_name || 'পোস্ট', item: `${ctx.base}/category/${p.cat_slug || ''}` },
    { '@type': 'ListItem', position: 3, name: p.title, item: canonical }] }];
  if (isJob) {
    const wide = ['সারাদেশ', 'সারা দেশ', 'সারা-দেশ', 'একাধিক', 'সব জেলা', 'সকল জেলা', 'দেশব্যাপী', 'anywhere', 'all'];
    const norm = (v) => { v = String(v || '').trim(); return !v || wide.includes(v.toLowerCase()) ? null : v; };
    const loc = norm(p.district); const reg = norm(p.division);
    const addr = { '@type': 'PostalAddress', addressCountry: 'BD' }; if (loc) addr.addressLocality = loc; if (reg) addr.addressRegion = reg;
    let baseSalary;
    const rawSal = String(p.salary || '').trim();
    if (rawSal) {
      const nums = (en(rawSal).match(/\d[\d,]*/g) || []).map((x) => parseFloat(x.replace(/,/g, ''))).filter((n) => n > 0);
      if (nums.length) baseSalary = { '@type': 'MonetaryAmount', currency: 'BDT', value: nums.length >= 2 ? { '@type': 'QuantitativeValue', minValue: Math.min(...nums), maxValue: Math.max(...nums), unitText: 'MONTH' } : { '@type': 'QuantitativeValue', value: nums[0], unitText: 'MONTH' } };
    }
    const dd = String(p.district || '').trim(); const dv = String(p.division || '').trim();
    const isWide = (!dd && !dv) || wide.includes(dd.toLowerCase()) || wide.includes(dv.toLowerCase());
    const job = { '@type': 'JobPosting', title: p.title, description: schemaDescription(content) || p.title, datePosted: iso(p.published_at).slice(0, 10),
      employmentType: p.employment_type || 'FULL_TIME', hiringOrganization: { '@type': 'Organization', name: p.company || 'চাকরি সার্কুলার', sameAs: `${ctx.base}/` },
      jobLocation: { '@type': 'Place', address: addr }, directApply: true, identifier: { '@type': 'PropertyValue', name: siteName(), value: String(p.id) } };
    if (p.deadline) job.validThrough = `${String(p.deadline).slice(0, 10)}T23:59:59+06:00`;
    if (baseSalary) job.baseSalary = baseSalary;
    if (isWide) job.applicantLocationRequirements = { '@type': 'Country', name: 'Bangladesh' };
    schema.push(job);
  } else {
    schema.push({ '@type': 'NewsArticle', headline: Array.from(p.title).slice(0, 110).join(''), image: [ogImg], datePublished: iso(p.published_at), dateModified: iso(p.updated_at || p.published_at),
      author: { '@type': 'Organization', name: siteName() }, publisher: { '@id': `${ctx.base}/#organization` }, mainEntityOfPage: canonical });
  }

  const jType = p.employment_type ? (D.JOB_TYPES[p.employment_type] || p.employment_type) : '';
  const row1 = p.division || p.district || p.vacancy;
  const salaryTxt = isJob ? (String(p.salary || '').trim() || 'আলোচনা সাপেক্ষে') : '';
  const row2 = (p.deadline && dl.state !== 'none') || jType || p.company || salaryTxt;
  const enc = encodeURIComponent(canonical); const enct = encodeURIComponent(p.title);
  const pdfOk = p.pdf && ctx.hasFile ? ctx.hasFile('pdf', p.pdf) : Boolean(p.pdf);
  const linkKind = (u) => {
    if (/^mailto:/i.test(u)) return ['mail', 'mail', 'ইমেইল করুন', 'মেইল', u.slice(7)];
    if (/^tel:/i.test(u)) return ['tel', 'phone', 'ফোন করুন', 'কল', u.slice(4)];
    if (/wa\.me\//i.test(u)) return ['wa', 'chat', 'হোয়াটসঅ্যাপ', 'চ্যাট', `+${u.replace(/^.*wa\.me\//i, '')}`];
    return ['web', 'link', 'লিংক', 'ওপেন', ''];
  };
  const applyLinks = links.filter((l) => Number(l.is_apply) === 1);
  const infoLinks = links.filter((l) => Number(l.is_apply) !== 1);

  const tone = toneOf(p);
  const applyMain = applyLinks[0];
  const pct = (() => { if (!p.deadline) return null; const a = ts(p.published_at); const b = ts(`${String(p.deadline).slice(0, 10)} 23:59:59`); return Math.max(4, Math.min(100, Math.round(((Date.now() - a) / Math.max(1, b - a)) * 100))); })();
  const loc = [p.district, p.division && (D.DIVISIONS.includes(p.division) ? `${p.division} বিভাগ` : p.division)].filter(Boolean).join(', ');
  const tiles = [
    ['calendar', 'প্রকাশের তারিখ', bnDate(p.published_at), ''],
    p.deadline && dl.state !== 'none' ? ['calendar-check', 'আবেদনের শেষ তারিখ', bnDate(p.deadline), dl.state === 'over' ? 'bad' : dl.state === 'urgent' ? 'warn' : 'red'] : null,
    p.vacancy ? ['users', 'পদ সংখ্যা', `${bn(p.vacancy)} টি`, ''] : null,
    salaryTxt ? ['money', 'বেতন', salaryTxt, 'ok'] : null,
    loc ? ['pin', 'কর্মস্থল', loc, ''] : null,
    jType ? ['briefcase', 'চাকরির ধরন', jType, ''] : null,
  ].filter(Boolean);
  const panelLinks = links.length ? html`${infoLinks.map((l) => { const [kind, icon, def, go, shown] = linkKind(String(l.url)); return html`<a class="lnk ${kind}" href="${l.url}" ${raw(kind === 'web' || kind === 'wa' ? 'target="_blank" rel="noopener"' : '')} data-no-spa><span class="lnk-ic">${ic(icon)}</span><span class="lnk-t"><b>${l.label || def}</b>${shown ? html`<small>${shown}</small>` : ''}</span><span class="go">${go}${ic(kind === 'web' ? 'external' : 'chev-r')}</span></a>`; })}
    ${applyLinks.length ? html`<div class="apply-row ${applyLinks.length === 2 ? 'two' : ''}">${applyLinks.map((l) => html`<a class="apply" href="${l.url}" target="_blank" rel="noopener" data-no-spa>${ic('send')}${l.label || 'আবেদন করুন'}</a>`)}</div>` : ''}` : '';
  const hasPanel2 = Boolean(links.length);

  const body = html`
<div class="pd-bar hide-d">
  <button class="ico-btn" type="button" data-back aria-label="পেছনে যান">${ic('arrow-l')}</button>
  <b>${isJob ? 'চাকরির বিবরণ' : 'বিস্তারিত'}</b><span class="sp"></span>
  <button class="ico-btn" type="button" data-share-title="${p.title}" data-share-url="/post/${p.slug}" aria-label="শেয়ার">${ic('share')}</button>
  <button class="ico-btn bk" type="button" data-bk="${p.id}" aria-pressed="false" aria-label="সেভ করুন">${ic('bookmark')}</button>
</div>
<article class="pd" data-post-id="${p.id}" data-deadline="${p.deadline || ''}">
  <p class="crumb hide-m"><a href="/">হোম</a>${ic('chev-r')}${p.cat_name ? html`<a href="/category/${p.cat_slug}">${p.cat_name}</a>` : ''}${ic('chev-r')}<span>বিস্তারিত</span></p>
  <header class="pd-head">
    <span class="pd-logo tile ${tone}">${p.thumb ? html`<img src="${uploadUrl(p.thumb)}" alt="" width="84" height="84">` : ic(p.cat_icon || 'briefcase')}</span>
    <div class="pd-ht">
      ${p.company && !String(p.title).includes(Array.from(p.company).slice(0, 14).join('')) ? html`<span class="pd-co">${ic('building')}${p.company}</span>` : ''}
      <h1>${p.title}</h1>
    </div>
  </header>
  <div class="pd-tags">
    ${p.cat_name ? html`<a class="pill dark" href="/category/${p.cat_slug}">${p.cat_name}</a>` : ''}
    ${jType ? html`<span class="pill violet">${jType}</span>` : ''}
    ${prem ? html`<span class="pill gold">${ic('crown')}প্রিমিয়াম</span>` : ''}
    ${p.deadline && dl.state !== 'none' ? html`<span class="pill ${dl.state}">${dl.text}</span>` : ''}
  </div>
  ${tiles.length ? html`<div class="pd-grid">${tiles.map(([i, l, v, t]) => html`<div class="pg-it"><span class="pg-ic ${t}">${ic(i)}</span><span class="pg-tx"><small>${l}</small><b>${v}</b></span></div>`)}</div>` : ''}
  ${pct !== null && dl.state !== 'none' ? html`<div class="pd-prog ${dl.state}" aria-label="${dl.text}"><div class="pp-top"><span>${ic('clock')}${dl.text}</span><span>${bn(dmy(p.deadline))}</span></div><div class="pp-bar"><i style="width:${dl.state === 'over' ? 100 : pct}%"></i></div></div>` : ''}
  ${applyMain || pdfOk ? html`<div class="pd-cta">
    ${applyMain ? html`<a class="apply big" href="${applyMain.url}" target="_blank" rel="noopener" data-no-spa>${ic('send')}${applyMain.label || 'অনলাইনে আবেদন করুন'}${ic('external')}</a>` : ''}
    ${pdfOk ? html`<a class="pdf-dl${applyMain ? ' alt' : ' big'}" href="/uploads/pdf/${p.pdf}" download data-no-spa aria-label="পিডিএফ ডাউনলোড করুন">${ic('file-down')}<span>মূল বিজ্ঞপ্তি (পিডিএফ)</span></a>` : ''}
  </div>` : ''}
  ${hasPanel2 ? html`<div class="pd-tabs" role="tablist"><button class="pd-tab on" role="tab" data-tab="1" type="button">বিস্তারিত</button><button class="pd-tab" role="tab" data-tab="2" type="button">আবেদন ও যোগাযোগ</button></div>` : ''}
  <section class="pd-panel on" data-panel="1">
    ${images.length ? html`<div class="gal" id="postGal"><div class="gal-main" data-zoom="${uploadUrl(images[0].image)}" id="galMain"><img src="${uploadUrl(images[0].image)}" alt="${p.title}" width="856" height="292" decoding="async" fetchpriority="high">
      ${images.length > 1 ? html`<span class="gal-count"><span id="galIdx">১</span>/${bn(images.length)}</span>` : ''}</div>
      ${images.length > 1 ? html`<div class="gal-thumbs">${images.map((im, i) => html`<button type="button" class="gal-th${i === 0 ? ' on' : ''}" data-gal="${uploadUrl(im.image)}" data-i="${bn(i + 1)}" aria-label="ছবি ${bn(i + 1)}"><img src="${uploadUrl(im.image)}" alt="" loading="lazy" decoding="async"></button>`)}</div>` : ''}</div>` : ''}
    <div class="pd-body">${raw(content)}</div>
  </section>
  ${hasPanel2 ? html`<section class="pd-panel" data-panel="2"><div class="lnk-box" style="border:0;margin:0;padding:0">${panelLinks}</div></section>` : ''}
  <div class="pd-actions">
    <button class="btn ghost bk-lg" type="button" data-bk="${p.id}" aria-pressed="false">${ic('bookmark')}<span>সেভ করুন</span></button>
    <button class="btn" type="button" data-share-title="${p.title}" data-share-url="/post/${p.slug}">${ic('share')}শেয়ার</button>
  </div>
  <div class="sh-row"><b>শেয়ার করুন:</b>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${enc}" target="_blank" rel="noopener" class="fb" aria-label="Facebook" data-no-spa>${ic('facebook')}</a>
    <a href="https://wa.me/?text=${enct}%20${enc}" target="_blank" rel="noopener" class="wa" aria-label="WhatsApp" data-no-spa>${ic('chat')}</a>
    <a href="https://t.me/share/url?url=${enc}&text=${enct}" target="_blank" rel="noopener" class="tg" aria-label="Telegram" data-no-spa>${ic('send')}</a>
    <a href="https://twitter.com/intent/tweet?url=${enc}&text=${enct}" target="_blank" rel="noopener" class="tw" aria-label="X" data-no-spa>${ic('twitter')}</a>
    <button type="button" class="cp" data-copy="${canonical}" aria-label="লিংক কপি">${ic('copy')}</button>
  </div>
</article>
${applyMain && dl.state !== 'over' ? html`<div class="pd-stick hide-d"><div class="ps-info"><small>${dl.state === 'none' ? 'আবেদন করুন' : 'আবেদনের শেষ'}</small><b>${dl.state === 'none' ? '' : dl.text.replace('আবেদনের ', '')}</b></div><a class="apply" href="${applyMain.url}" target="_blank" rel="noopener" data-no-spa>${ic('send')}আবেদন করুন</a></div>` : ''}
${related.length ? html`<h2 class="rel-h">${ic('layers')}আরও দেখুন</h2>${postList(related)}` : ''}`;

  return { title: metaTitle, desc: metaDesc, canonical, og: ogImg, ogType: 'article', nav: 'category', catSlug: p.cat_slug, page: 'post', body, schema, fa: usesFontAwesome(p.content), postId: p.id };
}
