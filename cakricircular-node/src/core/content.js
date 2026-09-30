/* ─────────────────────────────────────────────
   পোস্টের কনটেন্ট: সাদা লেখা → সুন্দর HTML, আর হাতে-লেখা HTML → নিরাপদ HTML
   ───────────────────────────────────────────── */
import sanitizeHtml from 'sanitize-html';
import { esc } from './html.js';

const POST_SCOPE = '.pd-body';

/* পোস্টের নিজস্ব CSS যেন সাইটের বাকি অংশে প্রভাব না ফেলে — প্রতিটি সিলেক্টরের আগে .pd-body বসাই */
export function scopeCss(cssIn, prefix = POST_SCOPE) {
  let css = String(cssIn).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<\/?style[^>]*>/gi, '').replace(/[<>]/g, '');
  let out = ''; let i = 0; const len = css.length;
  while (i < len) {
    const at = /^\s*@([a-z-]+)([^{;]*)([{;])/i.exec(css.slice(i));
    if (at) {
      const name = at[1].toLowerCase(); i += at[0].length;
      if (at[3] === ';') { if (!['import', 'charset', 'namespace'].includes(name)) out += `@${at[1]}${at[2]};`; continue; }
      let depth = 1; const start = i;
      while (i < len && depth > 0) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
      const inner = css.slice(start, Math.max(start, i - 1));
      out += `@${at[1]}${at[2]}{${['keyframes', '-webkit-keyframes', 'font-face'].includes(name) ? inner : scopeCss(inner, prefix)}}`;
      continue;
    }
    const rule = /^([^{}]+)\{([^{}]*)\}/.exec(css.slice(i));
    if (rule) {
      i += rule[0].length;
      const sels = rule[1].split(',').map((s) => s.trim()).filter(Boolean);
      const nw = sels.map((s) => (/^(html|body|:root)\b/i.test(s) ? prefix : `${prefix} ${s}`));
      if (nw.length) out += `${nw.join(',')}{${rule[2].trim()}}`;
      continue;
    }
    i++;
  }
  return out;
}

const ALLOWED_TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col', 'a', 'img', 'hr',
  'span', 'div', 'section', 'article', 'header', 'footer', 'aside', 'figure', 'figcaption', 'small', 'sub', 'sup',
  'mark', 'code', 'pre', 'dl', 'dt', 'dd', 'center', 'iframe', 'video', 'source', 'audio'];

export function sanitizePostHtml(input) {
  let src = String(input || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  let css = '';
  src = src.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, c) => { css += `\n${c}`; return ''; });
  src = src.replace(/<link\b[^>]*>/gi, '');
  let clean = sanitizeHtml(src, {
    allowedTags: ALLOWED_TAGS,
    disallowedTagsMode: 'discard',
    allowedAttributes: {
      '*': ['style', 'class', 'id', 'title', 'align', 'dir', 'lang'],
      a: ['href', 'target', 'rel', 'name', 'style', 'class', 'title'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'style', 'class', 'srcset', 'sizes'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'loading', 'style', 'class', 'title', 'frameborder'],
      video: ['src', 'controls', 'poster', 'width', 'height', 'style', 'class'],
      audio: ['src', 'controls', 'style', 'class'],
      source: ['src', 'type'],
      td: ['colspan', 'rowspan', 'style', 'class', 'align'],
      th: ['colspan', 'rowspan', 'style', 'class', 'align'],
      col: ['span', 'style'],
      colgroup: ['span', 'style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'], iframe: ['https'], video: ['https'], audio: ['https'], source: ['https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tag, attribs) => {
        const a = { ...attribs };
        if (a.href && /^https?:/i.test(a.href)) { a.rel = 'nofollow noopener'; if (!a.target) a.target = '_blank'; }
        return { tagName: 'a', attribs: a };
      },
      iframe: (tag, attribs) => ({ tagName: 'iframe', attribs: { ...attribs, loading: 'lazy' } }),
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy', decoding: 'async' } }),
    },
    /* style অ্যাট্রিবিউটে অন-স্ক্রিন ওভারলে আটকাতে position:fixed/absolute সরাই */
    exclusiveFilter: null,
  });
  clean = clean.replace(/style="([^"]*)"/gi, (m, s) => {
    const n = s.replace(/position\s*:\s*(fixed|sticky)\s*;?/gi, '').replace(/expression\s*\(/gi, '').replace(/url\s*\(\s*['"]?\s*javascript:/gi, 'url(');
    return `style="${n}"`;
  });
  if (css.trim()) clean = `<style>${scopeCss(css)}</style>${clean}`;
  return clean;
}

/** `https://…` লিংক অটো ক্লিকযোগ্য, বাকি লেখা এস্কেপ */
export function nlLinks(rawText) {
  /* **মোটা** লেখাকে বোল্ড করি (AI বা কপি করা লেখায় প্রায়ই থাকে) */
  const bold = (x) => esc(x).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  let out = ''; let last = 0;
  const re = /https?:\/\/[^\s<]+/g; let m;
  while ((m = re.exec(rawText))) {
    out += bold(rawText.slice(last, m.index));
    const hit = m[0]; const url = hit.replace(/[.,;)।]+$/, ''); const tail = hit.slice(url.length);
    const shown = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    out += `<a href="${esc(url)}" target="_blank" rel="nofollow noopener">${esc(shown)}</a>${esc(tail)}`;
    last = m.index + hit.length;
  }
  return out + bold(rawText.slice(last));
}

export function formatContent(rawIn) {
  const raw = String(rawIn || '').trim();
  if (!raw) return '';
  if (/<(style|[a-z][a-z0-9]*)(\s|>|\/)/i.test(raw)) return sanitizePostHtml(raw);
  let out = ''; let list = false;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) { if (list) { out += '</ul>'; list = false; } continue; }
    let m = /^(?:[*-]\s+|[•·]\s*)(.+)$/u.exec(t);
    if (m) { if (!list) { out += '<ul class="c-list">'; list = true; } out += `<li>${nlLinks(m[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    m = /^(#{1,3})\s*(.+)$/u.exec(t);
    if (m) { const lv = m[1].length + 1; out += `<h${lv}>${esc(m[2].replace(/\*\*/g, ''))}</h${lv}>`; }
    else if (Array.from(t).length < 60 && /[:ঃ]$/u.test(t)) out += `<h3>${esc(t.replace(/\*\*/g, '').replace(/[: ]+$/, ''))}</h3>`;
    else out += `<p>${nlLinks(t)}</p>`;
  }
  if (list) out += '</ul>';
  return out;
}

/* পোস্টের ভেতরে পুরোনো Font Awesome (fa-…) থাকলে শুধু তখনই FA লোড করাই */
export const usesFontAwesome = (html) => /class\s*=\s*["'][^"']*\bfa[\s-]/i.test(String(html || ''));

export function excerpt(htmlStr, len = 160) {
  const t = String(htmlStr || '').replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim();
  const a = Array.from(t);
  return a.length > len ? `${a.slice(0, len).join('')}…` : t;
}

/* গুগলের স্কিমার জন্য পরিষ্কার বর্ণনা (ডিজাইনের কোড বাদ) */
export function schemaDescription(htmlStr, limit = 2200) {
  let t = String(htmlStr || '').replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const a = Array.from(t);
  if (a.length > limit) t = `${a.slice(0, limit).join('')}…`;
  return t;
}
