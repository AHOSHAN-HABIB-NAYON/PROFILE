import { z } from 'zod';
import { exec, query } from '../../db/pool';
import { notFound } from '../../lib/errors';

export const ourAppInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  subtitle: z.string().trim().max(120).default(''),
  logoUrl: z.string().trim().max(500).regex(/^(\/|https:\/\/)/, 'must be an uploaded image URL').nullable().optional(),
  linkUrl: z.string().trim().max(500).regex(/^(https?:\/\/[^\s]+|market:\/\/details\?id=[\w.]+)$/i, 'must start with https:// (or market://details?id=…)'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});
export type OurAppInput = z.infer<typeof ourAppInputSchema>;

const COLS = 'id, name, subtitle, logo_url AS logoUrl, link_url AS linkUrl, sort_order AS sortOrder';

/** The team's other apps, listed on Home to send players their way. */
export class OurAppsService {
  private cache: { at: number; data: any[] } | null = null;
  private clicks = new Map<number, number>();
  private timer: NodeJS.Timeout | null = null;

  async listPublic() {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.data;
    const data = await query<any>(`SELECT ${COLS} FROM our_apps WHERE is_active = 1 ORDER BY sort_order, id LIMIT 12`);
    this.cache = { at: Date.now(), data };
    return data;
  }

  async listAdmin() {
    const rows = await query<any>(`SELECT ${COLS}, is_active AS isActive, clicks FROM our_apps ORDER BY sort_order, id`);
    return rows.map((r) => ({ ...r, isActive: !!r.isActive, clicks: Number(r.clicks) + (this.clicks.get(r.id) ?? 0) }));
  }

  async create(b: OurAppInput) {
    const r = await exec('INSERT INTO our_apps (name, subtitle, logo_url, link_url, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)', [b.name, b.subtitle, b.logoUrl ?? null, b.linkUrl, b.sortOrder, b.isActive ? 1 : 0]);
    this.cache = null;
    return r.insertId;
  }

  async update(id: number, b: OurAppInput) {
    const r = await exec('UPDATE our_apps SET name = ?, subtitle = ?, logo_url = ?, link_url = ?, sort_order = ?, is_active = ? WHERE id = ?', [b.name, b.subtitle, b.logoUrl ?? null, b.linkUrl, b.sortOrder, b.isActive ? 1 : 0, id]);
    if (!r.affectedRows) throw notFound('App not found');
    this.cache = null;
  }

  async remove(id: number) {
    await exec('DELETE FROM our_apps WHERE id = ?', [id]);
    this.cache = null;
  }

  async click(id: number) {
    if (!(await this.listPublic()).some((a) => a.id === id)) return;
    this.clicks.set(id, (this.clicks.get(id) ?? 0) + 1);
    this.timer ??= setTimeout(() => void this.flush(), 30_000).unref();
  }

  async flush() {
    this.timer = null;
    const batch = [...this.clicks];
    this.clicks.clear();
    for (const [id, n] of batch) await exec('UPDATE our_apps SET clicks = clicks + ? WHERE id = ?', [n, id]).catch(() => undefined);
  }
}
