/* ─────────────────────────────────────────────
   পুনর্ব্যবহারযোগ্য UI অংশ: পোস্ট কার্ড, পেজিনেশন, হিরো, সেকশন টাইটেল …
   ───────────────────────────────────────────── */
import { html, raw, esc } from '../core/html.js';
import { bn, timeAgo, deadlineInfo } from '../core/bn.js';
import { ic } from './icons.js';
import { isPremium } from '../modules/site/data.js';
import { config } from '../config.js';

const TONES = { chakri: 't1', job: 't1', bhorti: 't2', result: 't3', protisthan: 't4', notice: 't5', scholarship: 't6' };
export const toneOf = (p) => TONES[p.cat_slug] || `t${((Number(p.cat_id) || 1) % 6) + 1}`;

export const uploadUrl = (file, folder = 'posts') => {
  if (!file) return '';
  if (/^https?:\/\//i.test(file)) return file;
  return `/uploads/${folder}/${file}`;
};

function deadlineBadge(p) {
  const d = deadlineInfo(p.deadline);
  if (d.state === 'none') return '';
  let text = d.text; let icon = 'clock';
  if (d.state === 'over') { text = 'সময় শেষ'; icon = 'x-circle'; }
  else if (d.days === 0) { text = 'আজ শেষ দিন'; }
  else { text = `আর ${bn(d.days)} দিন বাকি`; icon = 'calendar'; }
  return html`<span class="pdead ${d.state}"><span class="dic">${ic(icon)}</span>${text}</span>`;
}

export function postCard(p, i = 0) {
  const url = `/post/${p.slug}`;
  const loc = (p.district || '').trim() || (p.division || '').trim();
  const prem = isPremium(p);
  const tone = toneOf(p);
  const thumb = p.thumb
    ? html`<a class="pthumb-a" href="${url}" aria-hidden="true" tabindex="-1"><img src="${uploadUrl(p.thumb)}" alt="" loading="lazy" decoding="async" width="84" height="84"></a>`
    : html`<a href="${url}" class="pthumb-a tile ${tone}" aria-hidden="true" tabindex="-1">${ic(p.cat_icon || 'briefcase')}</a>`;
  return html`<article class="pitem${prem ? ' prem' : ''}" style="--i:${Math.min(i, 12)}" data-href="${url}" data-id="${p.id}">
    <div class="pside">${thumb}${prem ? html`<span class="prem-under">${ic('crown')}প্রিমিয়াম</span>` : ''}</div>
    <div class="pbody">
      <div class="ptop">${deadlineBadge(p)}<span class="pact"><button type="button" class="pbtn bk" data-bk="${p.id}" aria-label="সেভ করুন" aria-pressed="false">${ic('bookmark')}</button><button type="button" class="pbtn" data-share-title="${p.title}" data-share-url="${url}" aria-label="শেয়ার করুন">${ic('share')}</button></span></div>
      <a href="${url}"><h3 class="ptitle">${p.title}</h3></a>
      <div class="pmeta">
        ${loc ? html`<span>${ic('pin')}${loc}</span>` : ''}
        <span>${ic('clock')}${timeAgo(p.published_at)}</span>
      </div>
      <div class="ptags">
        ${p.cat_name ? html`<span class="ptag">${p.cat_name}</span>` : ''}
        ${p.company && !String(p.title).includes(Array.from(p.company).slice(0, 14).join('')) ? html`<span class="ptag soft">${p.company}</span>` : ''}
      </div>
    </div>
  </article>`;
}

export const postList = (rows, extra = '') => html`<div class="plist" id="postList">${rows.map((p, i) => postCard(p, i))}</div>${extra}`;

export function pager(page, totalPages, linkFn) {
  if (totalPages < 2) return '';
  const win = totalPages <= 10 ? totalPages : 2;
  const shown = [];
  for (let i = 1; i <= totalPages; i++) if (i === 1 || i === totalPages || Math.abs(i - page) <= win) shown.push(i);
  let prev = 0; const parts = [];
  for (const i of shown) {
    if (prev && i - prev > 1) parts.push(html`<span class="pg dots">…</span>`);
    parts.push(i === page ? html`<span class="pg active" aria-current="page">${bn(i)}</span>` : html`<a class="pg" href="${linkFn(i)}">${bn(i)}</a>`);
    prev = i;
  }
  return html`<nav class="pager" aria-label="পেজ নেভিগেশন" data-pager data-next="${page < totalPages ? linkFn(page + 1) : ''}">
    ${page > 1 ? html`<a class="pg" href="${linkFn(page - 1)}">${ic('chev-l')}আগের</a>` : html`<span class="pg disabled">${ic('chev-l')}আগের</span>`}
    ${parts}
    ${page < totalPages ? html`<a class="pg" href="${linkFn(page + 1)}">পরের${ic('chev-r')}</a>` : html`<span class="pg disabled">পরের${ic('chev-r')}</span>`}
  </nav>`;
}

export const hero = ({ icon, title, sub, chips = [], cls = '', raw: iconRaw }) => html`
<div class="hero ${cls}"><div class="hero-in"><span class="hero-ic">${iconRaw || ic(icon)}</span><div><h1>${title}</h1><p>${sub}</p></div></div>
${chips.length ? html`<div class="hero-chips">${chips.map(([i, t]) => html`<span>${ic(i)}${t}</span>`)}</div>` : ''}</div>`;

export const secTitle = ({ icon, title, sub, cls = '', right = '' }) => html`
<div class="sec-title"><div class="sec-l"><span class="sec-ic ${cls}">${ic(icon)}</span><h2>${title}<small>${sub}</small></h2></div>${right}</div>`;

export const countBtn = (total, href) => html`<a class="cnt-pill" href="${href}">মোট ${bn(total)}টি পোস্ট${ic('chev-r')}</a>`;
export const emptyBox = (icon, text) => html`<div class="card empty">${ic(icon)}<span>${text}</span></div>`;

export const assetV = () => config.appVersion;
export { esc, raw };
