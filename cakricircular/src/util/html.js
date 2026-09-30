'use strict';
const sanitizeHtml = require('sanitize-html');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}
/** Tagged template that escapes interpolations unless wrapped with raw(). */
class Raw { constructor(v) { this.v = v; } toString() { return this.v; } }
function raw(v) { return new Raw(v === null || v === undefined ? '' : String(v)); }
function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) {
    out += render(vals[i]) + strings[i + 1];
  }
  return new Raw(out);
}
function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.v;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

/** Safe rich-text for post content, pages, notices. */
function clean(dirty) {
  return sanitizeHtml(String(dirty || ''), {
    allowedTags: ['h2', 'h3', 'h4', 'h5', 'p', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's', 'mark', 'small', 'sub', 'sup',
      'ul', 'ol', 'li', 'blockquote', 'a', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      'img', 'figure', 'figcaption', 'span', 'div', 'code', 'pre', 'iframe'],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'loading', 'title'],
      '*': ['class'],
    },
    allowedClasses: { '*': ['note', 'warn', 'info', 'table-wrap', 'text-center', 'highlight'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'drive.google.com'],
    transformTags: {
      a: (tag, attribs) => {
        const href = attribs.href || '';
        const external = /^https?:\/\//i.test(href);
        return { tagName: 'a', attribs: { ...attribs, ...(external ? { target: '_blank', rel: 'noopener nofollow' } : {}) } };
      },
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } }),
      h1: 'h2',
    },
  });
}
function strip(s) {
  return sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}
function truncate(s, n) {
  const chars = [...String(s || '')];
  return chars.length > n ? chars.slice(0, n - 1).join('') + '…' : chars.join('');
}
function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^(https?:|mailto:|tel:)/i.test(u) || u.startsWith('/')) return u;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return 'https://' + u;
  return '';
}
/** JSON safe to embed inside <script>. */
function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

module.exports = { esc, html, raw, render, clean, strip, truncate, safeUrl, jsonForScript, Raw };
