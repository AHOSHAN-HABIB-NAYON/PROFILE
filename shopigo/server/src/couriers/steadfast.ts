import { CourierError, http, mapCommonStatus, requireCreds, type CourierAdapter } from './types.js';

const BASE = 'https://portal.packzy.com/api/v1';

function headers(c: Record<string, string>) {
  return { 'Api-Key': c.api_key!, 'Secret-Key': c.secret_key!, 'Content-Type': 'application/json' };
}

export const steadfast: CourierAdapter = {
  driver: 'steadfast',
  label: 'Steadfast Courier',
  description: 'Creates parcels via the Steadfast (Packzy) merchant API and syncs delivery status.',
  capabilities: { shipments: true, tracking: true, customerHistory: false },
  fields: [
    { key: 'base_url', label: 'API URL', placeholder: BASE },
    { key: 'api_key', label: 'API Key', secret: true, required: true },
    { key: 'secret_key', label: 'Secret Key', secret: true, required: true },
  ],
  async test(c) {
    requireCreds(c, ['api_key', 'secret_key']);
    const r = await http(`${c.base_url || BASE}/get_balance`, { headers: headers(c) });
    if (r.status === 200 && r.body?.status === 200) return { ok: true, message: `Connected. Balance: ৳${r.body.current_balance}` };
    return { ok: false, message: `Steadfast responded with HTTP ${r.status}` };
  },
  async createShipment(o, c) {
    requireCreds(c, ['api_key', 'secret_key']);
    const payload = {
      invoice: o.orderNo,
      recipient_name: o.customerName.slice(0, 100),
      recipient_phone: o.phone,
      recipient_address: `${o.address}, ${o.upazila}, ${o.district}`.slice(0, 250),
      cod_amount: Math.round(o.codAmount),
      note: (o.note ?? '').slice(0, 250),
      item_description: o.itemDescription.slice(0, 250),
    };
    const r = await http(`${c.base_url || BASE}/create_order`, { method: 'POST', headers: headers(c), body: JSON.stringify(payload) });
    const cons = r.body?.consignment;
    if (r.status !== 200 || r.body?.status !== 200 || !cons) {
      throw new CourierError(r.body?.message || (r.body?.errors ? JSON.stringify(r.body.errors) : `Steadfast HTTP ${r.status}`), r.body);
    }
    return { consignmentId: String(cons.consignment_id), trackingCode: cons.tracking_code ?? null, status: cons.status ?? 'in_review', raw: r.body, request: payload };
  },
  async getStatus(ref, c) {
    requireCreds(c, ['api_key', 'secret_key']);
    const url = ref.consignmentId ? `${c.base_url || BASE}/status_by_cid/${encodeURIComponent(ref.consignmentId)}` : `${c.base_url || BASE}/status_by_trackingcode/${encodeURIComponent(ref.trackingCode ?? '')}`;
    const r = await http(url, { headers: headers(c) });
    if (r.status !== 200) throw new CourierError(`Steadfast HTTP ${r.status}`, r.body);
    const status = String(r.body?.delivery_status ?? 'unknown');
    return { status, mappedStatus: mapCommonStatus(status), raw: r.body };
  },
};
