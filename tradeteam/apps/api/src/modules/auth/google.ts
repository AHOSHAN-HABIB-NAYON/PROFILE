import { OAuth2Client } from 'google-auth-library';
import { getSetting } from '../settings/settings.service';
import { loadEnv } from '../../config/env';
import { redis } from '../../infrastructure/redis';
import { randomToken, sha256 } from '../../infrastructure/crypto';
import crypto from 'node:crypto';

/**
 * Google OAuth 2.0 / OpenID Connect.
 *  - Redirect flow: /api/auth/google/start → Google → /api/auth/google/callback (state + PKCE + nonce)
 *  - Credential flow: POST /api/auth/google with a Google Identity Services ID token
 * In both cases the ID token signature, audience, issuer and expiry are verified server-side.
 */
export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

function redirectUri() {
  return `${loadEnv().APP_URL}/api/auth/google/callback`;
}

function client() {
  const id = getSetting('google.client_id');
  const secret = getSetting('google.client_secret');
  if (!getSetting('auth.google_enabled') || !id) throw new Error('Google sign-in is not enabled');
  return new OAuth2Client({ clientId: id, clientSecret: secret || undefined, redirectUri: redirectUri() });
}

export async function googleAuthUrl(intent: 'login' | 'link', linkUserId?: number) {
  const c = client();
  const state = randomToken(24);
  const verifier = randomToken(48);
  const nonce = randomToken(16);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  await redis().set(
    `goog:${sha256(state)}`,
    JSON.stringify({ verifier, nonce, intent, linkUserId: linkUserId ?? null }),
    'EX',
    600,
  );
  const url = c.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    nonce,
    prompt: 'select_account',
    code_challenge: challenge,
    code_challenge_method: 'S256' as never,
  });
  return url;
}

export async function googleCallback(code: string, state: string) {
  const raw = await redis().getdel(`goog:${sha256(state)}`);
  if (!raw) throw new Error('Google sign-in expired. Please try again.');
  const st = JSON.parse(raw) as {
    verifier: string;
    nonce: string;
    intent: 'login' | 'link';
    linkUserId: number | null;
  };
  const c = client();
  const { tokens } = await c.getToken({ code, codeVerifier: st.verifier, redirect_uri: redirectUri() });
  if (!tokens.id_token) throw new Error('Google did not return an ID token');
  const identity = await verifyIdToken(tokens.id_token, st.nonce);
  return { identity, intent: st.intent, linkUserId: st.linkUserId };
}

export async function verifyIdToken(idToken: string, nonce?: string): Promise<GoogleIdentity> {
  const c = client();
  const ticket = await c.verifyIdToken({ idToken, audience: getSetting('google.client_id') });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw new Error('Invalid Google token');
  if (nonce && p.nonce !== nonce) throw new Error('Invalid Google token nonce');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(p.iss))
    throw new Error('Invalid token issuer');
  return {
    sub: p.sub,
    email: p.email.toLowerCase(),
    emailVerified: Boolean(p.email_verified),
    name: p.name ?? p.email.split('@')[0]!,
    picture: p.picture ?? null,
  };
}
