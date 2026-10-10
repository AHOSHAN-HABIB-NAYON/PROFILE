import { z } from 'zod';
import { exec, query, queryOne } from '../../db/pool';
import { conflict, notFound } from '../../lib/errors';

export const categoryInputSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'lowercase letters, numbers and dashes'),
  name: z.string().trim().min(2).max(80),
  nameBn: z.string().trim().max(80).nullable().optional(),
  icon: z.string().trim().min(1).max(16),
  /** Custom uploaded icon; falls back to the built-in SVG `icon` when empty. */
  iconUrl: z.string().trim().max(500).regex(/^(\/|https:\/\/)/, 'must be an uploaded image URL').nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  isActive: z.boolean().default(true),
});

export class CategoryService {
  private cache: { at: number; data: any[] } | null = null;

  /** Public list (cached 60s) with active question counts. */
  async listPublic() {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.data;
    const rows = await query<any>(
      `SELECT c.id, c.slug, c.name, c.name_bn AS nameBn, c.icon, c.icon_url AS iconUrl, c.description, c.color,
              (SELECT COUNT(*) FROM questions q WHERE q.category_id = c.id AND q.is_active = 1 AND q.review_status = 'approved' AND q.deleted_at IS NULL) AS questionCount
       FROM categories c WHERE c.is_active = 1 AND c.deleted_at IS NULL ORDER BY c.sort_order, c.id`,
    );
    const data = rows.map((r) => ({ ...r, questionCount: Number(r.questionCount) }));
    this.cache = { at: Date.now(), data };
    return data;
  }

  invalidate() {
    this.cache = null;
  }

  async listAdmin() {
    const rows = await query<any>(
      `SELECT c.id, c.slug, c.name, c.name_bn AS nameBn, c.icon, c.icon_url AS iconUrl, c.description, c.color, c.sort_order AS sortOrder, c.is_active AS isActive,
              (SELECT COUNT(*) FROM questions q WHERE q.category_id = c.id AND q.review_status = 'approved' AND q.deleted_at IS NULL) AS questionCount,
              (SELECT COUNT(*) FROM questions q WHERE q.category_id = c.id AND q.review_status = 'pending' AND q.deleted_at IS NULL) AS pendingCount
       FROM categories c WHERE c.deleted_at IS NULL ORDER BY c.sort_order, c.id`,
    );
    return rows.map((r) => ({ ...r, isActive: !!r.isActive, questionCount: Number(r.questionCount) }));
  }

  async get(id: number) {
    const c = await queryOne<any>('SELECT id, slug, name, icon FROM categories WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!c) throw notFound('Category not found');
    return c as { id: number; slug: string; name: string; icon: string };
  }

  async create(input: z.infer<typeof categoryInputSchema>) {
    const max = await queryOne<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) m FROM categories');
    try {
      const r = await exec('INSERT INTO categories (slug, name, name_bn, icon, icon_url, description, color, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        input.slug,
        input.name,
        input.nameBn ?? null,
        input.icon,
        input.iconUrl ?? null,
        input.description ?? null,
        input.color ?? null,
        input.isActive ? 1 : 0,
        Number(max?.m ?? 0) + 1,
      ]);
      this.invalidate();
      return r.insertId;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw conflict('Slug already exists');
      throw err;
    }
  }

  async update(id: number, input: z.infer<typeof categoryInputSchema>) {
    await exec('UPDATE categories SET slug = ?, name = ?, name_bn = ?, icon = ?, icon_url = ?, description = ?, color = ?, is_active = ? WHERE id = ? AND deleted_at IS NULL', [
      input.slug,
      input.name,
      input.nameBn ?? null,
      input.icon,
      input.iconUrl ?? null,
      input.description ?? null,
      input.color ?? null,
      input.isActive ? 1 : 0,
      id,
    ]);
    this.invalidate();
  }

  async remove(id: number) {
    // Soft delete keeps historical matches intact; its questions stop being served.
    await exec(`UPDATE categories SET deleted_at = UTC_TIMESTAMP(), is_active = 0, slug = CONCAT(slug, '-deleted-', id) WHERE id = ?`, [id]);
    this.invalidate();
  }

  async reorder(ids: number[]) {
    for (let i = 0; i < ids.length; i++) await exec('UPDATE categories SET sort_order = ? WHERE id = ?', [i + 1, ids[i]]);
    this.invalidate();
  }
}
