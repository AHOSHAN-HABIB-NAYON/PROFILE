/**
 * Courier adapter contract. Order logic only ever talks to this interface —
 * adding a courier means adding one adapter file and registering it.
 * Credentials are resolved server-side (env vars or encrypted DB rows) and
 * are never serialised to any client.
 */
export interface CredentialField { key: string; label: string; secret?: boolean; required?: boolean; placeholder?: string; help?: string; type?: 'text' | 'textarea' | 'select'; options?: string[] }

export interface ShipmentOrder {
  orderNo: string;
  customerName: string;
  phone: string;
  district: string;
  upazila: string;
  address: string;
  note: string | null;
  codAmount: number;
  itemCount: number;
  itemDescription: string;
  weightKg: number;
  value: number;
}

export interface ShipmentResult { consignmentId: string | null; trackingCode: string | null; status: string; raw: unknown; request?: unknown }
export interface StatusResult { status: string; mappedStatus: 'in_transit' | 'delivered' | 'cancelled' | 'returned' | 'courier_sent' | null; raw: unknown }
export interface CustomerHistory { total: number; delivered: number; cancelled: number; successRatio: number; byCourier: Record<string, { total: number; delivered: number; cancelled: number }>; raw: unknown }

export type Credentials = Record<string, string>;

export interface CourierAdapter {
  driver: string;
  label: string;
  description: string;
  capabilities: { shipments: boolean; tracking: boolean; customerHistory: boolean };
  fields: CredentialField[];
  test(creds: Credentials): Promise<{ ok: boolean; message: string }>;
  createShipment?(order: ShipmentOrder, creds: Credentials): Promise<ShipmentResult>;
  getStatus?(ref: { consignmentId: string | null; trackingCode: string | null }, creds: Credentials): Promise<StatusResult>;
  customerHistory?(phone: string, creds: Credentials): Promise<CustomerHistory>;
}

export class CourierError extends Error {
  constructor(message: string, public raw?: unknown) { super(message); }
}

export async function http<T = any>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 20_000), headers: { Accept: 'application/json', ...(init.headers ?? {}) } });
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, body: body as T };
}

export function requireCreds(creds: Credentials, keys: string[]): void {
  const missing = keys.filter((k) => !creds[k]);
  if (missing.length) throw new CourierError(`Missing courier credentials: ${missing.join(', ')}`);
}

export function mapCommonStatus(s: string): StatusResult['mappedStatus'] {
  const v = s.toLowerCase().replace(/[\s-]+/g, '_');
  if (/partial/.test(v)) return null;
  if (/^(delivered|delivery_complete|completed|delivered_approval_pending)$/.test(v) || v === 'delivered') return 'delivered';
  if (/return/.test(v)) return 'returned';
  if (/cancel/.test(v)) return 'cancelled';
  if (/(transit|picked|hub|shipped|out_for_delivery|on_the_way|in_review|assigned|pickup)/.test(v)) return 'in_transit';
  if (/(pending|created|accepted|request)/.test(v)) return 'courier_sent';
  return null;
}
