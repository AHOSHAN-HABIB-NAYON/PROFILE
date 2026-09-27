import { CourierError, http, requireCreds, type CourierAdapter } from './types.js';

const BASE = 'https://bdcourier.com/api';

/**
 * BD Courier aggregates a customer's delivery history across Bangladeshi
 * couriers. It does not ship parcels — ShopiGo uses it for fraud scoring and
 * the customer's courier report.
 */
export const bdcourier: CourierAdapter = {
  driver: 'bdcourier',
  label: 'BD Courier',
  description: 'Customer courier history & success-ratio check (used by fraud protection). Does not create parcels.',
  capabilities: { shipments: false, tracking: false, customerHistory: true },
  fields: [
    { key: 'base_url', label: 'API URL', placeholder: BASE },
    { key: 'api_key', label: 'API key', secret: true, required: true, help: 'Can also be provided with the COURIER_BDCOURIER_API_KEY environment variable' },
  ],
  async test(c) {
    requireCreds(c, ['api_key']);
    const h = await this.customerHistory!('01700000000', c);
    return { ok: true, message: `Connected (sample lookup returned ${h.total} parcels)` };
  },
  async customerHistory(phone, c) {
    requireCreds(c, ['api_key']);
    const r = await http(`${c.base_url || BASE}/courier-check?phone=${encodeURIComponent(phone)}`, { method: 'POST', headers: { Authorization: `Bearer ${c.api_key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
    if (r.status !== 200 || r.body?.status === 'error') throw new CourierError(r.body?.message || `BD Courier HTTP ${r.status}`, r.body);
    const data = r.body?.courierData ?? r.body?.data ?? {};
    const byCourier: Record<string, { total: number; delivered: number; cancelled: number }> = {};
    for (const [name, v] of Object.entries<any>(data)) {
      if (name === 'summary' || !v || typeof v !== 'object') continue;
      byCourier[name] = { total: Number(v.total_parcel ?? 0), delivered: Number(v.success_parcel ?? 0), cancelled: Number(v.cancelled_parcel ?? 0) };
    }
    const s = data.summary ?? {};
    const total = Number(s.total_parcel ?? Object.values(byCourier).reduce((a, b) => a + b.total, 0));
    const delivered = Number(s.success_parcel ?? Object.values(byCourier).reduce((a, b) => a + b.delivered, 0));
    const cancelled = Number(s.cancelled_parcel ?? Object.values(byCourier).reduce((a, b) => a + b.cancelled, 0));
    return { total, delivered, cancelled, successRatio: total ? Math.round((delivered / total) * 100) : 100, byCourier, raw: r.body };
  },
};
