import { cache } from '../core/cache.js';
import { sha256 } from '../core/crypto.js';
import { CourierError, http, mapCommonStatus, requireCreds, type CourierAdapter, type Credentials } from './types.js';

const BASE = 'https://api-hermes.pathao.com';

async function token(c: Credentials): Promise<string> {
  const base = c.base_url || BASE;
  const key = `pathao:token:${sha256(base + c.client_id + c.username)}`;
  const cached = await cache.get<string>(key);
  if (cached) return cached;
  const r = await http(`${base}/aladdin/api/v1/issue-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: c.client_id, client_secret: c.client_secret, grant_type: 'password', username: c.username, password: c.password }),
  });
  if (r.status !== 200 || !r.body?.access_token) throw new CourierError(r.body?.message || `Pathao authentication failed (HTTP ${r.status})`, r.body);
  const ttl = Math.max(60, Math.min(Number(r.body.expires_in ?? 3600) - 300, 7 * 24 * 3600));
  await cache.set(key, r.body.access_token, ttl);
  return r.body.access_token as string;
}

export const pathao: CourierAdapter = {
  driver: 'pathao',
  label: 'Pathao Courier',
  description: 'Pathao Merchant (Aladdin) API — OAuth password grant, order creation and status sync.',
  capabilities: { shipments: true, tracking: true, customerHistory: false },
  fields: [
    { key: 'base_url', label: 'API URL', placeholder: BASE, help: 'Sandbox: https://courier-api-sandbox.pathao.com' },
    { key: 'client_id', label: 'Client ID', required: true },
    { key: 'client_secret', label: 'Client Secret', secret: true, required: true },
    { key: 'username', label: 'Merchant email', required: true },
    { key: 'password', label: 'Merchant password', secret: true, required: true },
    { key: 'store_id', label: 'Store ID', required: true },
  ],
  async test(c) {
    requireCreds(c, ['client_id', 'client_secret', 'username', 'password']);
    const t = await token(c);
    const r = await http(`${c.base_url || BASE}/aladdin/api/v1/stores`, { headers: { Authorization: `Bearer ${t}` } });
    if (r.status === 200) return { ok: true, message: `Connected. ${r.body?.data?.data?.length ?? 0} store(s) found.` };
    return { ok: false, message: `Pathao responded with HTTP ${r.status}` };
  },
  async createShipment(o, c) {
    requireCreds(c, ['client_id', 'client_secret', 'username', 'password', 'store_id']);
    const t = await token(c);
    const payload = {
      store_id: Number(c.store_id),
      merchant_order_id: o.orderNo,
      recipient_name: o.customerName.slice(0, 100),
      recipient_phone: o.phone,
      recipient_address: `${o.address}, ${o.upazila}, ${o.district}`.slice(0, 220),
      delivery_type: 48,
      item_type: 2,
      special_instruction: (o.note ?? '').slice(0, 200),
      item_quantity: o.itemCount,
      item_weight: Math.max(0.5, Math.min(10, o.weightKg || 0.5)),
      item_description: o.itemDescription.slice(0, 200),
      amount_to_collect: Math.round(o.codAmount),
    };
    const r = await http(`${c.base_url || BASE}/aladdin/api/v1/orders`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = r.body?.data;
    if (r.status !== 200 || !data?.consignment_id) throw new CourierError(r.body?.message || (r.body?.errors ? JSON.stringify(r.body.errors) : `Pathao HTTP ${r.status}`), r.body);
    return { consignmentId: String(data.consignment_id), trackingCode: String(data.consignment_id), status: data.order_status ?? 'Pending', raw: r.body, request: payload };
  },
  async getStatus(ref, c) {
    const t = await token(c);
    const r = await http(`${c.base_url || BASE}/aladdin/api/v1/orders/${encodeURIComponent(ref.consignmentId ?? '')}/info`, { headers: { Authorization: `Bearer ${t}` } });
    if (r.status !== 200) throw new CourierError(`Pathao HTTP ${r.status}`, r.body);
    const status = String(r.body?.data?.order_status ?? 'unknown');
    return { status, mappedStatus: mapCommonStatus(status), raw: r.body };
  },
};
