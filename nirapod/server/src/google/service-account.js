// OAuth access tokens for a Google service account (FCM, Play Developer API). The JSON key is stored
// encrypted in app_settings (set in admin) or read from an env path. Tokens are cached until near expiry.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getSecret } from '../settings.js';

const b64url = (b) => Buffer.from(b).toString('base64url');

export async function defaultHttp(url, { method = 'POST', headers = {}, body } = {}) {
  const r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(10_000) });
  let json = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
}

export function serviceAccountAuth({ db, cfg, clock, secretKey, envPath, scope, transport = defaultHttp }) {
  let token = null;
  async function account() {
    let raw = await getSecret(db, cfg, secretKey);
    if (!raw && envPath) {
      try { raw = fs.readFileSync(envPath, 'utf8'); } catch { raw = null; }
    }
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      return j.client_email && j.private_key ? j : null;
    } catch {
      return null;
    }
  }
  return {
    account,
    async token() {
      const now = Math.floor(clock.now().getTime() / 1000);
      if (token && token.exp - 60 > now) return token;
      const sa = await account();
      if (!sa) return null;
      const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
      const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
      const r = await transport('https://oauth2.googleapis.com/token', {
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}` }).toString(),
      });
      if (r.status !== 200 || !r.json?.access_token) return null;
      token = { access: r.json.access_token, exp: now + (r.json.expires_in || 3600), project: sa.project_id };
      return token;
    },
  };
}
