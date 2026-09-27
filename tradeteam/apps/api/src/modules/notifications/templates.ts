import { getSetting } from '../settings/settings.service';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal, inline-styled transactional email layout. All dynamic text is HTML-escaped. */
export function renderEmail(opts: {
  title: string;
  body: string;
  code?: string;
  cta?: { label: string; url: string };
}) {
  const site = escapeHtml(getSetting('site.name'));
  const title = escapeHtml(opts.title);
  const body = escapeHtml(opts.body).replace(/\n/g, '<br>');
  const code = opts.code
    ? `<div style="font:700 30px/1.2 ui-monospace,Menlo,monospace;letter-spacing:8px;background:#f1f5f9;border-radius:12px;padding:16px;text-align:center;margin:20px 0;color:#0f172a">${escapeHtml(opts.code)}</div>`
    : '';
  const cta = opts.cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.cta.url)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${escapeHtml(opts.cta.label)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(15,23,42,.08)"><tr><td style="padding:28px">
<div style="font-weight:800;font-size:18px;color:#4f46e5;margin-bottom:18px">${site}</div>
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
<p style="font-size:15px;line-height:1.6;color:#334155;margin:0">${body}</p>${code}${cta}
<p style="font-size:12px;color:#94a3b8;margin-top:28px">If you did not request this, you can ignore this email or contact support. Never share your codes with anyone — ${site} staff will never ask for them.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${opts.title}\n\n${opts.body}${opts.code ? `\n\nCode: ${opts.code}` : ''}${opts.cta ? `\n\n${opts.cta.label}: ${opts.cta.url}` : ''}`;
  return { html, text };
}
