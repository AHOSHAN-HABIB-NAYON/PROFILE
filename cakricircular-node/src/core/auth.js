/* ─────────────────────────────────────────────
   এডমিন সেশন: সই করা কুকি (সার্ভারে কিছু জমা রাখতে হয় না, রিস্টার্টেও টিকে থাকে)
   ───────────────────────────────────────────── */
import crypto from 'node:crypto';
import { config } from '../config.js';

const b64 = (b) => Buffer.from(b).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
const COOKIE = 'ccadm';
const TTL = 7 * 24 * 3600; // ৭ দিন

export function makeSession(adminId) {
  const payload = b64(JSON.stringify({ id: adminId, exp: Math.floor(Date.now() / 1000) + TTL, n: crypto.randomBytes(6).toString('hex') }));
  return `${payload}.${sign(payload)}`;
}
export function readSession(token) {
  if (!token || typeof token !== 'string') return null;
  const [p, s] = token.split('.');
  if (!p || !s) return null;
  const good = sign(p);
  if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp > Date.now() / 1000 ? d : null;
  } catch { return null; }
}
/** ফর্ম CSRF টোকেন — সেশনের সাথে বাঁধা */
export const csrfFor = (token) => sign(`csrf:${token || 'anon'}`).slice(0, 32);
export const cookieName = COOKIE;
export const setAdminCookie = (req, reply, token) =>
  reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: req.protocol === 'https', maxAge: TTL });
export const clearAdminCookie = (reply) => reply.clearCookie(COOKIE, { path: '/' });
