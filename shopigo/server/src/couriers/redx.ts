import { cache } from '../core/cache.js';
import { CourierError, http, mapCommonStatus, requireCreds, type CourierAdapter, type Credentials } from './types.js';

const BASE = 'https://openapi.redx.com.bd/v1.0.0-beta';

function headers(c: Credentials) {
  return { 'API-ACCESS-TOKEN': `Bearer ${c.api_token}`, 'Content-Type': 'application/json' };
}

async function findArea(district: string, upazila: string, c: Credentials): Promise<{ id: number; name: string } | null> {
  const key = `redx:areas:${district.toLowerCase()}`;
  let areas = await cache.get<Array<{ id: number; name: string }>>(key);
  if (!areas) {
    const r = await http(`${c.base_url || BASE}/areas?district_name=${encodeURIComponent(district)}`, { headers: headers(c) });
    areas = (r.body?.areas ?? []).map((a: { id: number; name: string }) => ({ id: a.id, name: a.name }));
    await cache.set(key, areas, 24 * 3600);
  }
  const list = areas ?? [];
  const u = upazila.toLowerCase();
  return list.find((a) => a.name.toLowerCase().includes(u)) ?? list[0] ?? null;
}

export const redx: CourierAdapter = {
  driver: 'redx',
  label: 'RedX',
  description: 'RedX Open API — parcel creation with automatic delivery-area lookup and tracking.',
  capabilities: { shipments: true, tracking: true, customerHistory: false },
  fields: [
    { key: 'base_url', label: 'API URL', placeholder: BASE, help: 'Sandbox: https://sandbox.redx.com.bd/v1.0.0-beta' },
    { key: 'api_token', label: 'API access token', secret: true, required: true },
    { key: 'pickup_store_id', label: 'Pickup store ID (optional)' },
  ],
  async test(c) {
    requireCreds(c, ['api_token']);
    const r = await http(`${c.base_url || BASE}/areas?district_name=Dhaka`, { headers: headers(c) });
    return r.status === 200 ? { ok: true, message: 'Connected to RedX' } : { ok: false, message: `RedX responded with HTTP ${r.status}` };
  },
  async createShipment(o, c) {
    requireCreds(c, ['api_token']);
    const area = await findArea(o.district, o.upazila, c);
    if (!area) throw new CourierError(`RedX has no delivery area for ${o.district}`);
    const payload: Record<string, unknown> = {
      customer_name: o.customerName.slice(0, 100),
      customer_phone: o.phone,
      delivery_area: area.name,
      delivery_area_id: area.id,
      customer_address: `${o.address}, ${o.upazila}, ${o.district}`.slice(0, 250),
      merchant_invoice_id: o.orderNo,
      cash_collection_amount: String(Math.round(o.codAmount)),
      parcel_weight: Math.max(500, Math.round((o.weightKg || 0.5) * 1000)),
      instruction: (o.note ?? '').slice(0, 200),
      value: Math.round(o.value),
    };
    if (c.pickup_store_id) payload.pickup_store_id = Number(c.pickup_store_id);
    const r = await http(`${c.base_url || BASE}/parcel`, { method: 'POST', headers: headers(c), body: JSON.stringify(payload) });
    if ((r.status !== 200 && r.status !== 201) || !r.body?.tracking_id) throw new CourierError(r.body?.message || `RedX HTTP ${r.status}`, r.body);
    return { consignmentId: String(r.body.tracking_id), trackingCode: String(r.body.tracking_id), status: 'pickup-pending', raw: r.body, request: payload };
  },
  async getStatus(ref, c) {
    const r = await http(`${c.base_url || BASE}/parcel/info/${encodeURIComponent(ref.trackingCode ?? ref.consignmentId ?? '')}`, { headers: headers(c) });
    if (r.status !== 200) throw new CourierError(`RedX HTTP ${r.status}`, r.body);
    const status = String(r.body?.parcel?.status ?? 'unknown');
    return { status, mappedStatus: mapCommonStatus(status), raw: r.body };
  },
};
