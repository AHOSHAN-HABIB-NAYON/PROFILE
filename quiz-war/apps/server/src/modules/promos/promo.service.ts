import { z } from 'zod';
import { exec, query } from '../../db/pool';
import { notFound } from '../../lib/errors';

export const PROMO_PLACEMENTS = ['home', 'result'] as const;

const dateField = z
  .string()
  .trim()
  .max(30)
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), 'invalid date');

export const promoInputSchema = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().max(300).default(''),
  ctaLabel: z.string().trim().max(30).default(''),
  /** Website or Play Store link; market:// links open the Play Store app directly. */
  linkUrl: z.string().trim().max(500).regex(/^(https?:\/\/[^\s]+|market:\/\/details\?id=[\w.]+)$/i, 'must start with https:// (or market://details?id=…)'),
  logoUrl: z.string().trim().max(500).regex(/^(\/|https:\/\/)/, 'must be an uploaded image URL').nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  placements: z.array(z.enum(PROMO_PLACEMENTS)).min(1).default(['home', 'result']),
  weight: z.coerce.number().int().min(1).max(10).default(1),
  isActive: z.boolean().default(true),
  startsAt: dateField,
  endsAt: dateField,
});
export type PromoInput = z.infer<typeof promoInputSchema>;

const COLS = `id, title, body, cta_label AS ctaLabel, link_url AS linkUrl, logo_url AS logoUrl, color, placements, weight`;
const toPromo = (r: any) => ({ ...r, weight: Number(r.weight), placements: String(r.placements || '').split(',').filter(Boolean) });

/** Admin promotions shown as pop-up cards at natural breaks (home, after a match). */
export class PromoService {
  private cache: { at: number; data: any[] } | null = null;
  private counts = new Map<number, { v: number; c: number }>();
  private timer: NodeJS.Timeout | null = null;

  /** Live promos (active and inside their date window), cached for a minute. */
  async listPublic() {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.data;
    const rows = await query<any>(
      `SELECT ${COLS} FROM promos
       WHERE is_active = 1 AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())
       ORDER BY id DESC LIMIT 20`,
    );
    const data = rows.map(toPromo);
    this.cache = { at: Date.now(), data };
    return data;
  }

  async listAdmin() {
    const rows = await query<any>(
      `SELECT ${COLS}, is_active AS isActive, starts_at AS startsAt, ends_at AS endsAt, impressions, clicks, created_at AS createdAt FROM promos ORDER BY id DESC`,
    );
    return rows.map((r) => {
      const p = toPromo(r);
      const pending = this.counts.get(p.id);
      return { ...p, isActive: !!r.isActive, impressions: Number(r.impressions) + (pending?.v ?? 0), clicks: Number(r.clicks) + (pending?.c ?? 0) };
    });
  }

  private params(b: PromoInput) {
    return [b.title, b.body, b.ctaLabel, b.linkUrl, b.logoUrl ?? null, b.color ?? null, [...new Set(b.placements)].join(','), b.weight, b.isActive ? 1 : 0, b.startsAt, b.endsAt];
  }

  async create(b: PromoInput) {
    const r = await exec(
      `INSERT INTO promos (title, body, cta_label, link_url, logo_url, color, placements, weight, is_active, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      this.params(b),
    );
    this.cache = null;
    return r.insertId;
  }

  async update(id: number, b: PromoInput) {
    const r = await exec(
      `UPDATE promos SET title = ?, body = ?, cta_label = ?, link_url = ?, logo_url = ?, color = ?, placements = ?, weight = ?, is_active = ?, starts_at = ?, ends_at = ? WHERE id = ?`,
      [...this.params(b), id],
    );
    if (!r.affectedRows) throw notFound('Promotion not found');
    this.cache = null;
  }

  async remove(id: number) {
    await exec('DELETE FROM promos WHERE id = ?', [id]);
    this.counts.delete(id);
    this.cache = null;
  }

  /** Views/clicks are counted in memory and written in one batch, never one query per tap. */
  async track(id: number, kind: 'view' | 'click') {
    if (!(await this.listPublic()).some((p) => p.id === id)) return;
    const c = this.counts.get(id) ?? { v: 0, c: 0 };
    if (kind === 'view') c.v++;
    else c.c++;
    this.counts.set(id, c);
    this.timer ??= setTimeout(() => void this.flush(), 30_000).unref();
  }

  async flush() {
    this.timer = null;
    const batch = [...this.counts];
    this.counts.clear();
    for (const [id, c] of batch) await exec('UPDATE promos SET impressions = impressions + ?, clicks = clicks + ? WHERE id = ?', [c.v, c.c, id]).catch(() => undefined);
  }
}
