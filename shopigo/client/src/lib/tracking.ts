import { deviceId, sessionId } from './device';
import type { PublicSettings } from './types';

/**
 * Browser-side tracking. Meta Pixel / gtag are loaded only when their IDs are
 * configured in Admin → Settings. Each event is also beaconed to our own
 * analytics endpoint with the same event_id, which the server forwards to
 * the Conversions API (tokens never reach the browser).
 */
declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let cfg: PublicSettings | null = null;
let nonce = '';

function inject(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  if (nonce) s.nonce = nonce;
  document.head.appendChild(s);
}

export function initTracking(settings: PublicSettings) {
  if (cfg) return;
  cfg = settings;
  nonce = (document.querySelector('script[nonce]') as HTMLScriptElement | null)?.nonce ?? '';
  if (settings.meta_pixel_id) {
    const fbq = function (...args: unknown[]) {
      const f = window.fbq!;
      if (f.callMethod) (f.callMethod as (...a: unknown[]) => void)(...args);
      else f.queue!.push(args);
    } as NonNullable<Window['fbq']>;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.push = fbq;
    window.fbq = fbq;
    window._fbq = fbq;
    inject('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', settings.meta_pixel_id);
  }
  const gid = settings.ga4_measurement_id || settings.google_tag_id;
  if (gid) {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() { window.dataLayer!.push(arguments); };
    inject(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gid)}`);
    window.gtag('js', new Date());
    for (const id of [settings.ga4_measurement_id, settings.google_tag_id, settings.google_ads_conversion_id].filter(Boolean)) window.gtag('config', id, { send_page_view: false });
  }
}

function cookie(name: string) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]!) : undefined;
}

export function newEventId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type Ev = 'page_view' | 'view_item' | 'search' | 'add_to_cart' | 'begin_checkout' | 'view_category';
const META: Partial<Record<Ev, string>> = { page_view: 'PageView', view_item: 'ViewContent', search: 'Search', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout' };

export interface TrackData { productId?: number; categoryId?: number; value?: number; term?: string; qty?: number; name?: string; items?: Array<{ id: number | string; name?: string; price: number; qty: number }> }

export function track(event: Ev, data: TrackData = {}) {
  const eventId = newEventId(event);
  const currency = cfg?.currency || 'BDT';
  try {
    const meta = META[event];
    if (meta && window.fbq) {
      const custom: Record<string, unknown> = { currency };
      if (data.value !== undefined) custom.value = data.value;
      if (data.productId) { custom.content_ids = [String(data.productId)]; custom.content_type = 'product'; custom.content_name = data.name; }
      if (data.items) { custom.content_ids = data.items.map((i) => String(i.id)); custom.contents = data.items.map((i) => ({ id: String(i.id), quantity: i.qty })); custom.num_items = data.items.reduce((s, i) => s + i.qty, 0); }
      if (data.term) custom.search_string = data.term;
      window.fbq('track', meta, event === 'page_view' ? undefined : custom, { eventID: eventId });
    }
    if (window.gtag && event !== 'view_category') {
      const items = data.items?.map((i) => ({ item_id: String(i.id), item_name: i.name, price: i.price, quantity: i.qty })) ?? (data.productId ? [{ item_id: String(data.productId), item_name: data.name, price: data.value, quantity: data.qty ?? 1 }] : undefined);
      window.gtag('event', event === 'page_view' ? 'page_view' : event, { currency, value: data.value, items, search_term: data.term, page_path: location.pathname });
    }
  } catch { /* never break the shop for analytics */ }
  const payload = JSON.stringify({ event, sessionId: sessionId(), device: deviceId(), productId: data.productId, categoryId: data.categoryId, value: data.value, term: data.term, qty: data.qty, path: location.href.slice(0, 300), eventId, fbp: cookie('_fbp'), fbc: cookie('_fbc') });
  try {
    if (!navigator.sendBeacon?.('/api/public/events', new Blob([payload], { type: 'text/plain' }))) {
      void fetch('/api/public/events', { method: 'POST', body: payload, headers: { 'Content-Type': 'text/plain' }, keepalive: true });
    }
  } catch { /* ignore */ }
}

/** Browser Purchase event — deduplicated with the server CAPI event via eventId. */
export function trackPurchase(orderNo: string, value: number, items: Array<{ id: string; name: string; price: number; qty: number }>, eventId: string) {
  const currency = cfg?.currency || 'BDT';
  try {
    window.fbq?.('track', 'Purchase', { value, currency, content_ids: items.map((i) => i.id), contents: items.map((i) => ({ id: i.id, quantity: i.qty })), content_type: 'product', num_items: items.reduce((s, i) => s + i.qty, 0) }, { eventID: eventId });
    if (window.gtag) {
      window.gtag('event', 'purchase', { transaction_id: orderNo, value, currency, items: items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.qty })) });
      if (cfg?.google_ads_conversion_id && cfg.google_ads_conversion_label) window.gtag('event', 'conversion', { send_to: `${cfg.google_ads_conversion_id}/${cfg.google_ads_conversion_label}`, value, currency, transaction_id: orderNo });
    }
  } catch { /* ignore */ }
}

export function fbCookies() {
  return { fbp: cookie('_fbp') ?? null, fbc: cookie('_fbc') ?? (new URLSearchParams(location.search).get('fbclid') ? `fb.1.${Date.now()}.${new URLSearchParams(location.search).get('fbclid')}` : null) };
}
