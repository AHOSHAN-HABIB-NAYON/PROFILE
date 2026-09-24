'use strict';
/** Self-contained branded error page (no external assets, safe to render anywhere). */
const esc = require('./escape');

const TITLES = {
  400: ['Bad request', 'The request could not be understood.'],
  401: ['Sign in required', 'Please sign in to continue.'],
  403: ['Access denied', 'You do not have permission to view this page.'],
  404: ['Page not found', 'The page you are looking for does not exist or was moved.'],
  429: ['Slow down', 'Too many requests. Please wait a moment and try again.'],
  500: ['Something went wrong', 'An unexpected error occurred. Our team has been notified.'],
  503: ['Temporarily unavailable', 'We are performing maintenance. Please check back shortly.'],
};

function render(status, { title, message, siteName = 'Premium Aura', extra = '' } = {}) {
  const [t, m] = TITLES[status] || TITLES[500];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(status)} · ${esc(title || t)} · ${esc(siteName)}</title>
<style>
:root{--bg:#f4f7fe;--card:#fff;--text:#0f172a;--muted:#64748b;--p:#2563eb;--a:#7c3aed}
@media (prefers-color-scheme:dark){:root{--bg:#070b1a;--card:#101732;--text:#e2e8f0;--muted:#94a3b8}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);
font-family:Poppins,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
.card{background:var(--card);border-radius:24px;padding:40px 28px;max-width:440px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(37,99,235,.15)}
.code{font-size:64px;font-weight:800;margin:0;background:linear-gradient(135deg,var(--p),var(--a));-webkit-background-clip:text;background-clip:text;color:transparent}
h1{font-size:22px;margin:8px 0}p{color:var(--muted);line-height:1.6;margin:0 0 24px}
a{display:inline-block;padding:14px 28px;border-radius:14px;background:linear-gradient(135deg,var(--p),var(--a));color:#fff;text-decoration:none;font-weight:600}
.extra{margin-top:16px;font-size:14px;color:var(--muted)}
</style></head><body><main class="card"><p class="code">${esc(status)}</p><h1>${esc(title || t)}</h1>
<p>${esc(message || m)}</p><a href="/">Back to ${esc(siteName)}</a>${extra ? `<div class="extra">${extra}</div>` : ''}</main></body></html>`;
}

module.exports = { render, TITLES };
