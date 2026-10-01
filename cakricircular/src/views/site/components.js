'use strict';
const { html, raw, esc, truncate } = require('../../util/html');
const { icon } = require('../icons');
const { bnDate, timeAgo, daysLeft, bnNum } = require('../../util/bn');
const uploads = require('../../util/uploads');

function postUrl(p) { return `/post/${encodeURIComponent(p.slug)}`; }
function catUrl(c) { return `/category/${encodeURIComponent(c.slug || c.cat_slug)}`; }

function deadlineBadge(deadline, { long = false } = {}) {
  if (!deadline) return '';
  const left = daysLeft(deadline);
  if (left < 0 || (left === 0 && new Date(deadline) < new Date())) return html`<span class="dl dl-over">${raw(icon('clock'))}সময় শেষ</span>`;
  if (left <= 3) {
    const txt = left <= 0 ? 'আজই শেষ' : left === 1 ? 'আগামীকাল শেষ' : `আর ${bnNum(left)} দিন`;
    return html`<span class="dl dl-soon">${raw(icon('clock'))}${txt}</span>`;
  }
  return html`<span class="dl dl-ok">${raw(icon('clock'))}শেষ: ${bnDate(deadline, { short: !long })}</span>`;
}

function thumb(p, { eager = false, cls = '' } = {}) {
  const src = p.thumbnail || p.gallery_thumb;
  if (src) {
    return html`<img class="${cls}" src="${uploads.url(src)}" alt="${p.title}" ${raw(eager ? 'fetchpriority="high"' : 'loading="lazy"')} decoding="async" width="160" height="160">`;
  }
  return html`<span class="ph ${cls}" style="--c:${p.cat_color || '#16a34a'}">${raw(icon(p.cat_icon || 'briefcase'))}</span>`;
}

function postCard(p, { eager = false } = {}) {
  const loc = p.district || p.division || '';
  return html`<article class="card${p.premium ? ' is-prem' : ''}" data-id="${p.id}">
  <div class="card-media">${thumb(p, { eager })}${p.premium ? raw(`<span class="prem-under">${icon('crown')}প্রিমিয়াম</span>`) : ''}</div>
  <div class="card-body">
    <div class="card-tags">${p.cat_name ? html`<span class="tag" style="--c:${p.cat_color || '#16a34a'}">${p.cat_name}</span>` : ''}${p.premium ? raw(`<span class="tag tag-prem">${icon('crown')}প্রিমিয়াম</span>`) : ''}</div>
    <h3 class="card-title"><a href="${postUrl(p)}" class="stretch">${p.title}</a></h3>
    <div class="card-meta">${loc ? html`<span>${raw(icon('pin'))}${loc}</span>` : ''}<span>${raw(icon('clock'))}${timeAgo(p.published_at)}</span></div>
    <div class="card-foot">${deadlineBadge(p.deadline)}<button class="bm" type="button" data-bm="${p.id}" aria-label="সেভ করুন">${raw(icon('bookmark'))}</button></div>
  </div>
</article>`;
}

function cardList(rows, { ads = [], adEvery = 0, eagerFirst = 0 } = {}) {
  const out = [];
  let ai = 0;
  rows.forEach((p, i) => {
    out.push(postCard(p, { eager: i < eagerFirst }));
    if (adEvery && ads.length && (i + 1) % adEvery === 0 && ai < ads.length) out.push(adBox(ads[ai++], 'feed'));
  });
  return html`${out}`;
}

function sectionHead(title, { iconName = 'flame', sub = '', link = '', linkText = 'আরও দেখুন' } = {}) {
  return html`<div class="sec-head">
  <div><h2>${raw(icon(iconName, 'sec-ic'))}${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div>
  ${link ? html`<a class="more-link" href="${link}">${linkText} ${raw(icon('next'))}</a>` : ''}
</div>`;
}

function adBox(ad, variant = '') {
  if (!ad) return '';
  const inner = ad.type === 'html'
    ? raw(ad.html || '')
    : html`<a href="${ad.link || '#'}" target="_blank" rel="sponsored noopener" class="ad-link">${ad.image ? html`<img src="${uploads.url(ad.image)}" alt="${ad.title || 'বিজ্ঞাপন'}" loading="lazy">` : html`<span class="ad-text">${ad.title}</span>`}</a>`;
  return html`<aside class="ad ad-${variant}" aria-label="বিজ্ঞাপন"><span class="ad-label">বিজ্ঞাপন</span><div class="ad-in">${inner}</div></aside>`;
}
function adSlot(adsBySlot, slot, variant) {
  const list = (adsBySlot && adsBySlot[slot]) || [];
  if (!list.length) return '';
  // rotate between ads of the same slot
  const ad = list[Math.floor(Math.random() * list.length)];
  return adBox(ad, variant || slot);
}

function empty(title, text, action = '') {
  return html`<div class="empty">${raw(icon('search', 'empty-ic'))}<h3>${title}</h3><p>${text}</p>${action}</div>`;
}

function pager(base, page, hasMore, extra = '') {
  if (page <= 1 && !hasMore) return '';
  const u = (n) => {
    const qs = [n > 1 ? `page=${n}` : '', extra].filter(Boolean).join('&');
    return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
  };
  return html`<nav class="pager">
  ${page > 1 ? html`<a class="btn btn-ghost" href="${u(page - 1)}">${raw(icon('left'))} আগের পাতা</a>` : raw('<span></span>')}
  <span class="pager-n">পৃষ্ঠা ${bnNum(page)}</span>
  ${hasMore ? html`<a class="btn btn-ghost" href="${u(page + 1)}">পরের পাতা ${raw(icon('right'))}</a>` : raw('<span></span>')}
</nav>`;
}

function crumbs(items) {
  return html`<nav class="crumbs" aria-label="breadcrumb">${items.map((it, i) => (i < items.length - 1
    ? html`<a href="${it.url}">${it.name}</a>${raw(icon('right'))}`
    : html`<span>${truncate(it.name, 60)}</span>`))}</nav>`;
}

function pageHead(title, { back = true, sub = '', actions = '' } = {}) {
  return html`<div class="page-head">
  ${back ? html`<button class="icon-btn back-btn" type="button" data-back aria-label="ফিরে যান">${raw(icon('back'))}</button>` : ''}
  <div class="ph-text"><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>${actions}
</div>`;
}

module.exports = { postCard, cardList, sectionHead, adBox, adSlot, empty, pager, crumbs, pageHead, deadlineBadge, thumb, postUrl, catUrl, esc };
