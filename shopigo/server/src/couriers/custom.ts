import { CourierError, http, mapCommonStatus, requireCreds, type CourierAdapter, type ShipmentOrder } from './types.js';

/**
 * Generic JSON courier. The admin configures URLs, headers and a body template
 * with {{placeholders}}; response fields are read with dot paths.
 */
function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    if (v === undefined) return '';
    return typeof v === 'number' ? String(v) : JSON.stringify(String(v)).slice(1, -1);
  });
}

function pick(obj: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function varsFor(o: ShipmentOrder): Record<string, string | number> {
  return { order_no: o.orderNo, name: o.customerName, phone: o.phone, district: o.district, upazila: o.upazila, address: o.address, note: o.note ?? '', cod_amount: Math.round(o.codAmount), item_count: o.itemCount, items: o.itemDescription, weight: o.weightKg, value: o.value };
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, string>; } catch { throw new CourierError('Custom headers must be valid JSON'); }
}

function ensureHttps(url: string) {
  if (!/^https:\/\//i.test(url)) throw new CourierError('Custom courier URLs must use HTTPS');
}

export const custom: CourierAdapter = {
  driver: 'custom',
  label: 'Custom Courier API',
  description: 'Connect any JSON courier API using a request template — no code changes needed.',
  capabilities: { shipments: true, tracking: true, customerHistory: false },
  fields: [
    { key: 'create_url', label: 'Create parcel URL (HTTPS)', required: true },
    { key: 'headers', label: 'Headers (JSON)', type: 'textarea', secret: true, placeholder: '{"Authorization":"Bearer xxx"}' },
    { key: 'body_template', label: 'Body template (JSON)', type: 'textarea', required: true, placeholder: '{"invoice":"{{order_no}}","name":"{{name}}","phone":"{{phone}}","address":"{{address}}, {{upazila}}, {{district}}","cod":{{cod_amount}}}' },
    { key: 'consignment_path', label: 'Response path — consignment ID', placeholder: 'data.consignment_id', required: true },
    { key: 'tracking_path', label: 'Response path — tracking code', placeholder: 'data.tracking_code' },
    { key: 'status_url', label: 'Status URL template', placeholder: 'https://api.example.com/status/{{consignment_id}}' },
    { key: 'status_path', label: 'Response path — status', placeholder: 'data.status' },
  ],
  async test(c) {
    requireCreds(c, ['create_url', 'body_template']);
    ensureHttps(c.create_url!);
    JSON.parse(render(c.body_template!, varsFor({ orderNo: 'TEST', customerName: 'Test', phone: '01700000000', district: 'Dhaka', upazila: 'Dhanmondi', address: 'Road 1', note: '', codAmount: 100, itemCount: 1, itemDescription: 'Test', weightKg: 0.5, value: 100 })));
    return { ok: true, message: 'Configuration is valid (template renders to valid JSON)' };
  },
  async createShipment(o, c) {
    requireCreds(c, ['create_url', 'body_template', 'consignment_path']);
    ensureHttps(c.create_url!);
    let payload: unknown;
    try { payload = JSON.parse(render(c.body_template!, varsFor(o))); } catch { throw new CourierError('Body template does not produce valid JSON'); }
    const r = await http(c.create_url!, { method: 'POST', headers: { 'Content-Type': 'application/json', ...parseHeaders(c.headers) }, body: JSON.stringify(payload) });
    const consignment = pick(r.body, c.consignment_path!);
    if (r.status >= 300 || consignment == null) throw new CourierError(`Custom courier HTTP ${r.status}`, r.body);
    const tracking = c.tracking_path ? pick(r.body, c.tracking_path) : consignment;
    return { consignmentId: String(consignment), trackingCode: tracking != null ? String(tracking) : null, status: 'created', raw: r.body, request: payload };
  },
  async getStatus(ref, c) {
    if (!c.status_url) throw new CourierError('Status URL is not configured');
    const url = render(c.status_url, { consignment_id: ref.consignmentId ?? '', tracking_code: ref.trackingCode ?? '' });
    ensureHttps(url);
    const r = await http(url, { headers: parseHeaders(c.headers) });
    const status = String(pick(r.body, c.status_path || 'status') ?? 'unknown');
    return { status, mappedStatus: mapCommonStatus(status), raw: r.body };
  },
};
