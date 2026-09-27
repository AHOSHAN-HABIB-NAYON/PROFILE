/**
 * Tiny allow-list HTML sanitiser for admin-authored rich text (product
 * descriptions, pages). Admin input is still untrusted output-wise: an
 * admin account compromise must not become stored XSS for every customer.
 */
const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'img', 'div']);
const ATTRS: Record<string, Set<string>> = { a: new Set(['href', 'title']), img: new Set(['src', 'alt', 'width', 'height']), td: new Set(['colspan', 'rowspan']), th: new Set(['colspan', 'rowspan']) };

function safeUrl(u: string): boolean {
  const v = u.trim().toLowerCase();
  return v.startsWith('https://') || v.startsWith('http://') || v.startsWith('/') || v.startsWith('#') || v.startsWith('mailto:') || v.startsWith('tel:');
}

export function sanitizeHtml(input: string | null | undefined): string | null {
  if (!input) return input ?? null;
  let html = input.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)[\s\S]*?<\/\1\s*>/gi, '');
  return html.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED.has(tag)) return '';
    if (full.startsWith('</')) return `</${tag}>`;
    const allowed = ATTRS[tag];
    const kept: string[] = [];
    if (allowed) {
      const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(attrs))) {
        const name = m[1]!.toLowerCase();
        const value = (m[3] ?? m[4] ?? m[5] ?? '').replace(/"/g, '&quot;');
        if (!allowed.has(name)) continue;
        if ((name === 'href' || name === 'src') && !safeUrl(value)) continue;
        kept.push(`${name}="${value}"`);
      }
      if (tag === 'a') kept.push('rel="nofollow noopener"', 'target="_blank"');
    }
    const selfClose = tag === 'br' || tag === 'hr' || tag === 'img';
    return `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}${selfClose ? ' /' : ''}>`;
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
