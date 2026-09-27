import { sha256 } from '../core/crypto.js';
import { logger } from '../core/logger.js';
import { settings } from './settings.js';

/**
 * Server-side conversion tracking. Access tokens / API secrets stay on the
 * server; the browser pixel sends the same event_id so Meta deduplicates.
 */
export interface ServerEvent {
  name: 'PageView' | 'ViewContent' | 'Search' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';
  eventId: string;
  url?: string;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  gaClientId?: string | null;
  phone?: string | null;
  customerName?: string | null;
  city?: string | null;
  value?: number;
  currency?: string;
  orderId?: string;
  contents?: Array<{ id: string; quantity: number; price?: number; name?: string }>;
  searchTerm?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

export async function sendMetaEvent(e: ServerEvent): Promise<void> {
  const pixel = await settings.str('meta_pixel_id');
  const token = await settings.str('meta_access_token');
  if (!pixel || !token) return;
  const testCode = await settings.str('meta_test_event_code');
  const userData: Record<string, unknown> = {
    client_ip_address: e.ip ?? undefined,
    client_user_agent: e.userAgent ?? undefined,
    fbp: e.fbp ?? undefined,
    fbc: e.fbc ?? undefined,
  };
  if (e.phone) {
    const intl = e.phone.replace(/^0/, '880');
    userData.ph = [sha256(intl)];
    userData.external_id = [sha256(intl)];
  }
  if (e.customerName) {
    const [fn, ...rest] = norm(e.customerName).split(/\s+/);
    if (fn) userData.fn = [sha256(fn)];
    if (rest.length) userData.ln = [sha256(rest.join(' '))];
  }
  if (e.city) userData.ct = [sha256(norm(e.city).replace(/\s+/g, ''))];
  userData.country = [sha256('bd')];
  const customData: Record<string, unknown> = {};
  if (e.value !== undefined) { customData.value = e.value; customData.currency = e.currency ?? 'BDT'; }
  if (e.contents?.length) {
    customData.content_ids = e.contents.map((c) => c.id);
    customData.contents = e.contents.map((c) => ({ id: c.id, quantity: c.quantity, item_price: c.price }));
    customData.content_type = 'product';
    customData.num_items = e.contents.reduce((s, c) => s + c.quantity, 0);
  }
  if (e.orderId) customData.order_id = e.orderId;
  if (e.searchTerm) customData.search_string = e.searchTerm;
  const body: Record<string, unknown> = {
    data: [{ event_name: e.name, event_time: Math.floor(Date.now() / 1000), event_id: e.eventId, action_source: 'website', event_source_url: e.url, user_data: userData, custom_data: customData }],
  };
  if (testCode) body.test_event_code = testCode;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) logger.warn({ status: res.status, body: (await res.text()).slice(0, 300) }, 'Meta CAPI rejected event');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Meta CAPI request failed');
  }
}

const GA_EVENT: Record<ServerEvent['name'], string> = { PageView: 'page_view', ViewContent: 'view_item', Search: 'search', AddToCart: 'add_to_cart', InitiateCheckout: 'begin_checkout', Purchase: 'purchase' };

export async function sendGa4Event(e: ServerEvent): Promise<void> {
  const id = await settings.str('ga4_measurement_id');
  const secret = await settings.str('ga4_api_secret');
  if (!id || !secret || e.name !== 'Purchase') return; // other events are sent by gtag in the browser
  const params: Record<string, unknown> = {
    transaction_id: e.orderId, value: e.value, currency: e.currency ?? 'BDT',
    items: (e.contents ?? []).map((c) => ({ item_id: c.id, item_name: c.name, price: c.price, quantity: c.quantity })),
  };
  try {
    await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: e.gaClientId || `${Date.now()}.${Math.floor(Math.random() * 1e9)}`, events: [{ name: GA_EVENT[e.name], params }] }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'GA4 measurement protocol failed');
  }
}

export function trackServer(e: ServerEvent): void {
  void sendMetaEvent(e);
  void sendGa4Event(e);
}

/** Extracts the GA client id from the _ga cookie (GA1.1.<cid>). */
export function gaClientId(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const m = /^GA\d\.\d\.(.+)$/.exec(cookie);
  return m ? m[1]! : null;
}
