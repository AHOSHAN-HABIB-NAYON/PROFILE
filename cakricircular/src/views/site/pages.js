'use strict';
const settings = require('../../settings');
const { html, raw, esc, truncate, safeUrl } = require('../../util/html');
const { icon } = require('../icons');
const { bnNum, bnCount, bnDate, timeAgo, daysLeft, bnCompact } = require('../../util/bn');
const uploads = require('../../util/uploads');
const C = require('./components');

const DIVISIONS = ['ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ'];

function heroTitle() {
  return String(settings.get('hero_title') || '').split('\n').map((l, i) => html`<span class="l${i}">${l}</span>`);
}

function heroImage() {
  const custom = settings.get('hero_image');
  if (custom) return html`<img src="${uploads.url(custom)}" alt="" fetchpriority="high" decoding="async" width="1672" height="940">`;
  const { asset } = require('../../assets');
  return html`<img src="${asset('img/hero-photo.webp')}" srcset="${asset('img/hero-photo-m.webp')} 900w, ${asset('img/hero-photo.webp')} 1672w" sizes="100vw" alt="" fetchpriority="high" decoding="async" width="1672" height="940">`;
}

function slider(banners) {
  if (!banners.length) return '';
  return html`<section class="slider" data-slider aria-roledescription="carousel" aria-label="ব্যানার">
  <div class="slides">${banners.map((b, i) => {
    const img = html`<img src="${uploads.url(b.image)}" alt="${b.title || 'ব্যানার'}" width="856" height="292" ${raw(i === 0 ? 'fetchpriority="high"' : 'loading="lazy"')} decoding="async">`;
    return html`<div class="slide" role="group" aria-label="${bnNum(i + 1)} / ${bnNum(banners.length)}">${b.link ? html`<a href="${safeUrl(b.link)}">${img}</a>` : img}</div>`;
  })}</div>
  ${banners.length > 1 ? html`<button class="sl-arrow sl-prev" type="button" aria-label="আগের">${raw(icon('left'))}</button>
  <button class="sl-arrow sl-next" type="button" aria-label="পরের">${raw(icon('right'))}</button>
  <div class="sl-dots">${banners.map((_, i) => html`<button type="button" aria-label="স্লাইড ${bnNum(i + 1)}" class="${i === 0 ? 'on' : ''}"></button>`)}</div>` : ''}
</section>`;
}

function catTiles(cats) {
  return html`<section class="cat-tiles">${cats.map((c) => html`<a class="cat-tile" href="${C.catUrl(c)}" style="--c:${c.color}">
    <span class="ct-ic">${raw(icon(c.icon))}</span><span class="ct-name">${c.name}</span></a>`)}</section>`;
}

function sidebar(ctx) {
  const notices = (ctx.notices || []).slice(0, 6);
  return html`<aside class="side">
  ${C.adSlot(ctx.ads, 'sidebar', 'side')}
  ${notices.length ? html`<div class="box"><div class="box-head"><h3>${raw(icon('bell'))}নোটিশ বোর্ড</h3><a href="/notices">সব ${raw(icon('right'))}</a></div>
    <ul class="notice-mini">${notices.map((n) => html`<li><a href="/notices#n${n.id}">${n.title}</a><small>${bnDate(n.created_at)}</small></li>`)}</ul></div>` : ''}
  ${(ctx.trending || []).length ? html`<div class="box"><div class="box-head"><h3>${raw(icon('flame'))}ট্রেন্ডিং</h3><a href="/trending">সব ${raw(icon('right'))}</a></div>
    <ol class="rank">${ctx.trending.slice(0, 6).map((p) => html`<li><a href="${C.postUrl(p)}">${p.title}</a><small>${raw(icon('eye'))}${bnCompact(p.views)} বার দেখা</small></li>`)}</ol></div>` : ''}
  <div class="box box-app"><b>${raw(icon('bell'))}নতুন চাকরির খবর সবার আগে</b><p>নোটিফিকেশন চালু করে রাখুন, নতুন সার্কুলার এলেই জানিয়ে দেব।</p><button class="btn btn-primary btn-sm" type="button" data-push-ask>নোটিফিকেশন চালু করুন</button></div>
</aside>`;
}

function home(ctx) {
  const { latest, banners, cats, total, today, ads } = ctx;
  const feedAds = (ads && ads.home_feed) || [];
  return html`<div class="home">
  <section class="hero">
    <div class="hero-scene">
      <div class="hero-bg" aria-hidden="true">${heroImage()}</div>
      <div class="wrap hero-in">
        <div class="hero-txt">
          <h1>${heroTitle()}</h1>
          <p>${settings.get('hero_subtitle')}</p>
        </div>
      </div>
    </div>
    <div class="hero-band">
      <div class="wrap">
        <form class="hero-search" action="/search" method="get" data-search-form>
          <span class="hs-ic">${raw(icon('search'))}</span>
          <input type="search" name="q" placeholder="চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড লিখুন…" aria-label="খুঁজুন" data-suggest-inline autocomplete="off" enterkeyhint="search">
          <button type="submit" class="hs-btn" aria-label="খুঁজুন">${raw(icon('search'))}</button>
        </form>
      </div>
    </div>
  </section>
  <div class="wrap">
    <div class="cat-panel">${catTiles(cats)}</div>
    ${slider(banners)}
    ${C.adSlot(ads, 'home_top', 'wide')}
    <div class="layout">
      <div class="main-col">
        <div class="sec-head">
          <div><h2>${raw(icon('flame', 'sec-ic'))}সর্বশেষ আপডেট</h2><p>আজ ${bnNum(today)} টি নতুন পোস্ট</p></div>
          <a class="total-btn" href="/posts">মোট ${bnCount(total)} টি পোস্ট ${raw(icon('right'))}</a>
        </div>
        <div class="cards" data-feed>${C.cardList(latest.rows, { ads: feedAds, adEvery: 6, eagerFirst: 2 })}</div>
        ${latest.hasMore ? html`<div class="more-wrap"><button class="btn btn-outline btn-more" type="button" data-more="/api/posts?page=2" >আরও দেখুন ${raw(icon('down'))}</button></div>` : ''}
      </div>
      ${sidebar(ctx)}
    </div>
  </div>
</div>`;
}

function categoriesPage(cats) {
  return html`<div class="wrap">
  <div class="page-banner"><h1>ক্যাটাগরি সমূহ</h1><p>আপনার পছন্দের ক্যাটাগরি বেছে নিন</p></div>
  <div class="cat-list">${cats.map((c) => html`<a class="cat-row" href="${C.catUrl(c)}" style="--c:${c.color}">
    <span class="cr-ic">${raw(icon(c.icon))}</span>
    <span class="cr-txt"><b>${c.name}</b><small>${bnCount(c.post_count)} টি পোস্ট</small></span>${raw(icon('right', 'cr-arrow'))}</a>`)}</div>
</div>`;
}

function listPage({ title, sub = '', rows, page, hasMore, base, extra = '', ctx, nav, emptyText, headIcon = 'grid', crumbs = null, total = null }) {
  return html`<div class="wrap">
  ${C.pageHead(title, { sub: sub || (total !== null ? `মোট ${bnCount(total)} টি পোস্ট` : '') })}
  ${crumbs ? C.crumbs(crumbs) : ''}
  <div class="layout">
    <div class="main-col">
      ${rows.length ? html`<div class="cards">${C.cardList(rows, { eagerFirst: 2, ads: (ctx.ads && ctx.ads.home_feed) || [], adEvery: 8 })}</div>${C.pager(base, page, hasMore, extra)}`
    : C.empty('কোনো পোস্ট পাওয়া যায়নি', emptyText || 'এই মুহূর্তে এখানে কোনো পোস্ট নেই। পরে আবার দেখুন।', raw('<a class="btn btn-primary" href="/">হোমে ফিরে যান</a>'))}
    </div>
    ${sidebar(ctx)}
  </div>
</div>`;
}

function infoRow(ic, label, value) {
  if (!value) return '';
  return html`<li><span class="ir-ic">${raw(icon(ic))}</span><span class="ir-l">${label}</span><span class="ir-v">${value}</span></li>`;
}

function postDetail(ctx) {
  const { post: p, related, ads } = ctx;
  const img = p.thumbnail ? uploads.url(p.thumbnail) : '';
  const left = daysLeft(p.deadline);
  const over = p.deadline && new Date(p.deadline) < new Date();
  const content = String(p.content || '');
  // put an in-content ad after the 3rd paragraph
  let body = content;
  const mid = C.adSlot(ads, 'post_content', 'inline');
  if (mid) {
    let count = 0;
    body = content.replace(/<\/p>/g, (m) => (++count === 3 ? m + String(mid) : m));
    if (count < 3) body += String(mid);
  }
  return html`<div class="wrap">
  <div class="page-head post-top only-m"><button class="icon-btn back-btn" type="button" data-back aria-label="ফিরে যান">${raw(icon('back'))}</button><div class="ph-text"><h1 class="ph-small">পোস্টের বিজ্ঞপ্তি</h1></div>
    <button class="icon-btn" type="button" data-share-open aria-label="শেয়ার">${raw(icon('share'))}</button></div>
  ${C.crumbs([{ name: 'হোম', url: '/' }, ...(p.cat_slug ? [{ name: p.cat_name, url: `/category/${encodeURIComponent(p.cat_slug)}` }] : []), { name: p.title }])}
  <div class="layout">
    <article class="post" data-post="${p.id}" data-title="${p.title}" data-img="${img}">
      ${C.adSlot(ads, 'post_top', 'wide')}
      <div class="post-hero${img ? '' : ' no-img'}" style="--c:${p.cat_color || '#16a34a'}">
        ${img ? html`<img src="${img}" alt="${p.title}" fetchpriority="high" width="800" height="420">` : raw(`<span class="ph big">${icon(p.cat_icon || 'briefcase')}</span>`)}
        <div class="post-hero-tags">${p.cat_name ? html`<a class="tag tag-solid" href="/category/${encodeURIComponent(p.cat_slug)}" style="--c:${p.cat_color}">${p.cat_name}</a>` : ''}${p.premium ? raw(`<span class="tag tag-prem">${icon('crown')}প্রিমিয়াম</span>`) : ''}</div>
      </div>
      <h1 class="post-title">${p.title}</h1>
      ${p.organization ? html`<div class="org">${raw(icon('building'))}<span>${p.organization}</span></div>` : ''}
      <div class="post-meta"><span>${raw(icon('clock'))}${bnDate(p.published_at, { time: true })}</span><span>${raw(icon('eye'))}<b data-views>${bnCount(p.views)}</b> বার দেখা হয়েছে</span>${p.updated_at && p.published_at && new Date(p.updated_at) - new Date(p.published_at) > 3600000 ? html`<span>${raw(icon('refresh'))}আপডেট: ${timeAgo(p.updated_at)}</span>` : ''}</div>
      <ul class="info-list">
        ${infoRow('building', 'প্রতিষ্ঠান', p.organization)}
        ${infoRow('users', 'পদসংখ্যা', p.vacancies ? bnNum(p.vacancies) : '')}
        ${infoRow('money', 'বেতন', p.salary ? bnNum(p.salary) : '')}
        ${infoRow('pin', 'জেলা/বিভাগ', [p.district, p.division].filter(Boolean).join(', '))}
        ${infoRow('briefcase', 'চাকরির ধরন', p.job_type)}
        ${infoRow('cap', 'শিক্ষাগত যোগ্যতা', p.education)}
        ${infoRow('calendar', 'আবেদন শুরু', p.start_date ? bnDate(p.start_date) : '')}
        ${infoRow('calendar', 'শেষ তারিখ', p.deadline ? bnDate(p.deadline) : '')}
      </ul>
      ${p.deadline ? html`<div class="countdown${over ? ' is-over' : left <= 3 ? ' is-soon' : ''}" data-countdown="${new Date(p.deadline).toISOString()}">
        <span class="cd-label">${over ? 'আবেদনের সময় শেষ' : 'আবেদনের বাকি সময়'}</span>
        <div class="cd-val" aria-live="off">${over ? 'সময় শেষ' : raw('<b data-d>--</b> দিন <b data-h>--</b> : <b data-m>--</b> : <b data-s>--</b>')}</div>
      </div>` : ''}
      <div class="post-actions">
        ${p.apply_url && !over ? html`<a class="btn btn-primary btn-lg" href="${safeUrl(p.apply_url)}" target="_blank" rel="noopener nofollow">${raw(icon('external'))}আবেদন করুন</a>` : ''}
        ${p.pdf ? html`<a class="btn btn-outline btn-lg" href="${uploads.url(p.pdf)}" target="_blank" rel="noopener">${raw(icon('pdf'))}PDF দেখুন</a>` : ''}
      </div>
      <div class="post-tools">
        <button type="button" data-share-open>${raw(icon('share'))}<span>শেয়ার</span></button>
        <button type="button" data-bm="${p.id}" data-bm-deadline="${p.deadline ? new Date(p.deadline).toISOString() : ''}">${raw(icon('bookmark'))}<span>সেভ</span></button>
        <a href="/report?post=${p.id}">${raw(icon('flag'))}<span>রিপোর্ট</span></a>
      </div>
      <div class="content">${raw(body)}</div>
      ${p.pdf ? html`<a class="pdf-card" href="${uploads.url(p.pdf)}" target="_blank" rel="noopener">${raw(icon('pdf'))}<span><b>মূল বিজ্ঞপ্তি (PDF)</b><small>ডাউনলোড বা দেখতে ট্যাপ করুন</small></span>${raw(icon('download'))}</a>` : ''}
      ${p.keywords ? html`<div class="kw">${String(p.keywords).split(',').map((k) => k.trim()).filter(Boolean).slice(0, 10).map((k) => html`<a class="chip" href="/search?q=${encodeURIComponent(k)}">#${k}</a>`)}</div>` : ''}
      ${C.adSlot(ads, 'post_bottom', 'wide')}
      <div class="report-hint">${raw(icon('info'))}<span>এই পোস্টে কোনো ভুল তথ্য দেখলে <a href="/report?post=${p.id}">আমাদের জানান</a>।</span></div>
    </article>
    ${sidebar(ctx)}
  </div>
  ${related.length ? html`<section class="related">${C.sectionHead('সম্পর্কিত পোস্ট', { iconName: 'layers' })}<div class="cards">${C.cardList(related)}</div></section>` : ''}
</div>`;
}

function searchPage({ q, rows, total, page, hasMore, cats, catId, division, top }) {
  const extra = [catId ? `cat=${catId}` : '', division ? `div=${encodeURIComponent(division)}` : '', q ? `q=${encodeURIComponent(q)}` : ''].filter(Boolean).join('&');
  const hasQuery = q || catId || division;
  return html`<div class="wrap narrow">
  ${C.pageHead('খুঁজুন')}
  <form class="search-page-form" action="/search" method="get" data-search-form data-live>
    <div class="search-box big">${raw(icon('search'))}<input type="search" name="q" value="${q}" placeholder="চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড লিখুন…" autocomplete="off" enterkeyhint="search" data-suggest-inline ${raw(hasQuery ? '' : 'data-autofocus')}>
      ${q ? html`<a class="sb-clear" href="/search" aria-label="মুছুন">${raw(icon('x'))}</a>` : ''}</div>
    <div class="filters">
      <label class="sel">${raw(icon('grid'))}<select name="cat" data-autosubmit><option value="">সব ক্যাটাগরি</option>${cats.map((c) => html`<option value="${c.id}" ${raw(Number(catId) === c.id ? 'selected' : '')}>${c.name}</option>`)}</select></label>
      <label class="sel">${raw(icon('pin'))}<select name="div" data-autosubmit><option value="">সব বিভাগ</option>${DIVISIONS.map((d) => html`<option ${raw(division === d ? 'selected' : '')}>${d}</option>`)}</select></label>
    </div>
  </form>
  ${hasQuery ? html`<div class="result-head"><b>${bnCount(total)}</b> টি ফলাফল ${q ? html`— “${q}”` : ''}</div>
    ${rows.length ? html`<div class="cards">${C.cardList(rows)}</div>${C.pager('/search', page, hasMore, extra.replace(/(^|&)page=\d+/, ''))}` : C.empty('কিছু পাওয়া যায়নি', 'অন্য কীওয়ার্ড দিয়ে চেষ্টা করুন বা ফিল্টার বদলান।')}`
    : html`<div class="search-home">
      <div class="mini-head"><b>জনপ্রিয় সার্চ</b></div>
      <div class="chips">${(top.length ? top.slice(0, 8).map((t) => t.q) : ['পুলিশ', 'ব্যাংক', 'প্রাথমিক বিদ্যালয়', 'বাংলাদেশ রেলওয়ে', 'বিমান', 'NTRCA']).map((t) => html`<a class="chip" href="/search?q=${encodeURIComponent(t)}">${t}</a>`)}</div>
      <div data-recent-wrap hidden><div class="mini-head"><b>সাম্প্রতিক অনুসন্ধান</b><button type="button" class="link-btn" data-recent-clear>মুছুন</button></div><div class="recent" data-recent></div></div>
      ${top.length ? html`<div class="mini-head"><b>সবাই যা খুঁজছে</b></div><ol class="top-list">${top.map((t, i) => html`<li><span class="n">${bnNum(i + 1)}</span><a href="/search?q=${encodeURIComponent(t.q)}">${t.q}</a><small>${bnCompact(t.hits)} বার</small></li>`)}</ol>` : ''}
    </div>`}
</div>`;
}

function noticesPage(notices) {
  const now = Date.now();
  const isNew = (n) => now - new Date(n.created_at).getTime() < 3 * 86400000;
  const fresh = notices.filter(isNew);
  const old = notices.filter((n) => !isNew(n));
  const item = (n) => html`<li class="notice" id="n${n.id}" data-notice="${n.id}">
    <div class="nt-top"><h3>${n.link ? html`<a href="${safeUrl(n.link)}">${n.title}</a>` : n.title}</h3>${isNew(n) ? raw('<span class="new-badge">নতুন</span>') : ''}${n.pinned ? raw(`<span class="pin-badge">${icon('pin')}</span>`) : ''}</div>
    ${n.body ? html`<div class="nt-body">${raw(n.body)}</div>` : ''}
    <small>${raw(icon('clock'))}${bnDate(n.created_at)} · ${timeAgo(n.created_at)}</small></li>`;
  return html`<div class="wrap narrow">
  ${C.pageHead('নোটিশ', { sub: 'গুরুত্বপূর্ণ ঘোষণা ও আপডেট' })}
  <div class="tabs" data-tabs><button type="button" class="on" data-tab="latest">সর্বশেষ <span class="cnt">${bnNum(fresh.length)}</span></button><button type="button" data-tab="old">পুরোনো <span class="cnt">${bnNum(old.length)}</span></button></div>
  <div data-pane="latest">${fresh.length ? html`<ul class="notice-list">${fresh.map(item)}</ul>` : C.empty('নতুন কোনো নোটিশ নেই', 'গত ৩ দিনে কোনো নতুন নোটিশ আসেনি।')}</div>
  <div data-pane="old" hidden>${old.length ? html`<ul class="notice-list">${old.map(item)}</ul>` : C.empty('কোনো পুরোনো নোটিশ নেই', '')}</div>
</div>`;
}

const REPORT_TYPES = ['ভুল তথ্য', 'ভুল লিংক', 'ভুল তারিখ', 'মেয়াদোত্তীর্ণ পোস্ট', 'স্প্যাম / আপত্তিকর', 'সাইটের সমস্যা', 'অন্যান্য'];

function reportPage({ post, csrf }) {
  return html`<div class="wrap narrow">
  ${C.pageHead('রিপোর্ট করুন')}
  <div class="report-card">
    <div class="report-art">${raw(icon('file'))}<span>${raw(icon('alert'))}</span></div>
    <h2>ভুল তথ্য / সমস্যা জানাতে রিপোর্ট করুন</h2>
    <p>কোনো তথ্য ভুল মনে হলে বা সাইটে সমস্যা পেলে আমাদের জানান। আপনার রিপোর্ট দ্রুত যাচাই করা হবে।</p>
    ${post ? html`<div class="report-post">${raw(icon('link'))}<span>${post.title}</span></div>` : ''}
    <form class="form" data-report method="post" action="/api/report">
      <input type="hidden" name="post_id" value="${post ? post.id : ''}">
      <input type="hidden" name="_t" value="${csrf}">
      <label class="field"><span>সমস্যার ধরন</span><select name="type" required><option value="">নির্বাচন করুন</option>${REPORT_TYPES.map((t) => html`<option>${t}</option>`)}</select></label>
      <label class="field"><span>বিস্তারিত</span><textarea name="message" rows="5" maxlength="2000" placeholder="বিস্তারিত লিখুন…" required></textarea></label>
      <label class="field"><span>যোগাযোগ (ঐচ্ছিক)</span><input name="contact" maxlength="150" placeholder="ইমেইল বা ফোন"></label>
      <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="hint">${raw(icon('shield'))}স্প্যাম রোধে প্রতি ঘণ্টায় সর্বোচ্চ ${bnNum(settings.int('report_limit_per_hour', 5))} টি রিপোর্ট পাঠানো যাবে।</p>
      <button class="btn btn-blue btn-block btn-lg" type="submit">${raw(icon('send'))}রিপোর্ট পাঠান</button>
    </form>
  </div>
</div>`;
}

function infoPage(pg) {
  const isAbout = /about|সম্পর্কে/.test(pg.slug);
  return html`<div class="wrap narrow">
  ${C.pageHead(pg.title)}
  <article class="info-page">
    ${isAbout ? html`<div class="about-brand"><img src="${require('./layout').logoUrl()}" alt="" width="64" height="64"><div><b>${settings.get('site_name')}</b><small>${settings.get('site_domain')}</small></div></div>` : ''}
    <div class="content">${raw(pg.content || '')}</div>
    ${isAbout ? html`<div class="about-actions"><a class="btn btn-blue" href="mailto:${settings.get('contact_email')}">${raw(icon('mail'))}যোগাযোগ করুন</a></div>` : ''}
  </article>
</div>`;
}

function savedPage() {
  return html`<div class="wrap narrow">
  ${C.pageHead('সেভড জব', { sub: 'আপনার সেভ করা পোস্ট ও ডেডলাইন রিমাইন্ডার' })}
  <div class="tabs" data-tabs><button type="button" class="on" data-tab="saved">সেভ করা</button><button type="button" data-tab="remind">রিমাইন্ডার</button></div>
  <div data-pane="saved"><div class="cards" data-saved-list><div class="skeleton"></div><div class="skeleton"></div></div></div>
  <div data-pane="remind" hidden>
    <div class="remind-box">${raw(icon('bell'))}<div><b>ডেডলাইন রিমাইন্ডার</b><p>নোটিফিকেশন চালু থাকলে সেভ করা জবের শেষ তারিখের ১ দিন আগে আমরা মনে করিয়ে দেব।</p>
      <button class="btn btn-primary btn-sm" type="button" data-push-ask>রিমাইন্ডার চালু করুন</button></div></div>
    <ul class="remind-list" data-remind-list></ul>
  </div>
</div>`;
}

function illus(kind) {
  if (kind === '404') {
    return raw(`<svg viewBox="0 0 240 180" class="illus" aria-hidden="true"><defs><linearGradient id="g4" x1="0" x2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
      <circle cx="120" cy="95" r="70" fill="var(--soft-blue)"/><g fill="#93c5fd" opacity=".7"><circle cx="40" cy="40" r="3"/><circle cx="205" cy="55" r="4"/><circle cx="60" cy="150" r="3"/><path d="M190 140l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/><path d="M50 70l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/></g>
      <circle cx="112" cy="86" r="44" fill="#fff" stroke="url(#g4)" stroke-width="10"/><path d="M143 118l30 30" stroke="#1e3a8a" stroke-width="14" stroke-linecap="round"/>
      <text x="112" y="98" text-anchor="middle" font-size="32" font-weight="800" fill="#1e40af" font-family="Arial">404</text></svg>`);
  }
  if (kind === 'offline') return raw(`<div class="illus-ic">${icon('wifiOff')}</div>`);
  return raw(`<svg viewBox="0 0 240 180" class="illus" aria-hidden="true"><rect x="70" y="30" width="100" height="120" rx="8" fill="var(--soft-blue)"/><g fill="#bfdbfe"><rect x="84" y="46" width="16" height="16" rx="2"/><rect x="112" y="46" width="16" height="16" rx="2"/><rect x="140" y="46" width="16" height="16" rx="2"/><rect x="84" y="74" width="16" height="16" rx="2"/><rect x="140" y="74" width="16" height="16" rx="2"/></g>
    <path d="M40 160h160" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/><path d="M58 158l10-30 10 30z" fill="#f97316"/><path d="M61 148h14" stroke="#fff" stroke-width="3"/><path d="M168 158l10-30 10 30z" fill="#f97316"/><path d="M171 148h14" stroke="#fff" stroke-width="3"/>
    <circle cx="120" cy="92" r="14" fill="#fcd34d"/><path d="M104 88a16 16 0 0 1 32 0z" fill="#ef4444"/><rect x="100" y="86" width="40" height="5" rx="2" fill="#dc2626"/>
    <path d="M100 160v-30a20 20 0 0 1 40 0v30z" fill="#2563eb"/><path d="M110 112l10 14 10-14" fill="#facc15"/><path d="M140 128l18-10" stroke="#475569" stroke-width="6" stroke-linecap="round"/></svg>`);
}

function notFound() {
  return html`<div class="wrap narrow state-page">
  ${illus('404')}
  <h1>পেজটি খুঁজে পাওয়া যায়নি</h1>
  <p>আপনি যে পৃষ্ঠাটি খুঁজছেন তা সম্ভবত সরিয়ে ফেলা হয়েছে, নাম পরিবর্তন করা হয়েছে অথবা ভুল লিংক।</p>
  <div class="state-actions"><a class="btn btn-blue" href="/">হোমে ফিরে যান</a><a class="btn btn-outline-blue" href="/categories">ক্যাটাগরিতে যান</a></div>
</div>`;
}

function offline() {
  return html`<div class="wrap narrow state-page">${illus('offline')}<h1>ইন্টারনেট সংযোগ নেই</h1><p>আপনি এখন অফলাইনে আছেন। আগে দেখা পেজগুলো দেখা যাবে, সংযোগ ফিরলে নতুন তথ্য লোড হবে।</p>
  <div class="state-actions"><a class="btn btn-blue" href="/">হোমে ফিরে যান</a><a class="btn btn-outline-blue" href="/saved">সেভড জব</a></div></div>`;
}

function maintenanceDoc() {
  const theme = settings.get('theme_color');
  return '<!doctype html>' + html`<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${settings.get('maintenance_title')} | ${settings.get('site_name')}</title><meta name="robots" content="noindex">
<meta name="theme-color" content="${theme}">

<link rel="stylesheet" href="${require('../../assets').asset('css/site.css')}">
<script>(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()</script></head>
<body class="maint"><main class="wrap narrow state-page">${illus('maint')}<h1>${settings.get('maintenance_title')}</h1><p>${settings.get('maintenance_text')}</p>
<div class="state-actions"><a class="btn btn-blue" href="/">আবার চেষ্টা করুন</a></div></main></body></html>`;
}

module.exports = {
  home, categoriesPage, listPage, postDetail, searchPage, noticesPage, reportPage, infoPage, savedPage,
  notFound, offline, maintenanceDoc, DIVISIONS, REPORT_TYPES,
};
