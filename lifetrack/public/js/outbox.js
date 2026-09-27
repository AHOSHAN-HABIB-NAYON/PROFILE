/* Offline outbox for new transactions. Items are clearly shown as "Pending sync" and are NEVER
   reported as saved until the server confirms. Each item carries an idempotency key, so retries
   can never create duplicates. */
import { api, toast, t, emit } from './core.js';
const KEY = 'lt-outbox';
export const list = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch {} };
export function add(item) { const l = list(); l.push(item); save(l); emit('outbox', l.length); }
let flushing = false;
export async function flush() {
  if (flushing || !navigator.onLine) return;
  const items = list(); if (!items.length) return;
  flushing = true; let synced = 0; const keep = [];
  for (const it of items) {
    try { await api.post('/api/transactions', it.body, { idem: it.key }); synced++; }
    catch (e) { if (e.status === 0) keep.push(it); else { toast(t('outbox.rejected', { reason: e.message }), { type: 'error', timeout: 6000 }); } }
  }
  save(keep); flushing = false; emit('outbox', keep.length);
  if (synced) { toast(t('outbox.synced', { n: synced })); emit('data:changed'); }
}
