import type { Request } from 'express';
import { cache } from '../core/cache.js';
import { badRequest, notFound } from '../core/errors.js';
import { db, json } from '../db/index.js';
import { audit } from './audit.js';
import { deleteImageSet } from './images.js';

/**
 * Soft delete → Trash → Restore / Permanent delete.
 * Nothing an admin deletes disappears immediately.
 */
export const TRASHABLE = {
  product: { table: 'products', title: 'name' },
  order: { table: 'orders', title: 'order_no' },
  category: { table: 'categories', title: 'name' },
  brand: { table: 'brands', title: 'name' },
  banner: { table: 'banners', title: 'title' },
  coupon: { table: 'coupons', title: 'code' },
  combo: { table: 'combo_offers', title: 'name' },
} as const;

export type TrashEntity = keyof typeof TRASHABLE;

export function isTrashEntity(v: string): v is TrashEntity {
  return v in TRASHABLE;
}

export async function moveToTrash(req: Request, entity: TrashEntity, id: number): Promise<void> {
  const { table, title } = TRASHABLE[entity];
  const row = await db().selectFrom(table as 'products').selectAll().where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
  if (!row) throw notFound();
  const now = new Date();
  await db().transaction().execute(async (trx) => {
    await trx.updateTable(table as 'products').set({ deleted_at: now }).where('id', '=', id).execute();
    const label = String((row as Record<string, unknown>)[title] ?? `${entity} #${id}`) || `${entity} #${id}`;
    await trx.insertInto('trash').values({ entity_type: entity, entity_id: id, title: label.slice(0, 255), snapshot: json.stringify(row), deleted_by: req.admin?.id ?? null })
      .onDuplicateKeyUpdate({ deleted_at: now, snapshot: json.stringify(row), deleted_by: req.admin?.id ?? null }).execute();
  });
  await audit(req, { action: `${entity}.trashed`, targetType: entity, targetId: id, oldValue: { title: (row as Record<string, unknown>)[title] } });
  await cache.del('public:');
  await cache.del('home:');
}

export async function restoreFromTrash(req: Request, trashId: number): Promise<void> {
  const t = await db().selectFrom('trash').selectAll().where('id', '=', trashId).executeTakeFirst();
  if (!t || !isTrashEntity(t.entity_type)) throw notFound();
  const { table } = TRASHABLE[t.entity_type];
  await db().transaction().execute(async (trx) => {
    await trx.updateTable(table as 'products').set({ deleted_at: null }).where('id', '=', t.entity_id).execute();
    await trx.deleteFrom('trash').where('id', '=', trashId).execute();
  });
  await audit(req, { action: `${t.entity_type}.restored`, targetType: t.entity_type, targetId: t.entity_id, newValue: { title: t.title } });
  await cache.del('public:');
  await cache.del('home:');
}

export async function purgeFromTrash(req: Request, trashId: number): Promise<void> {
  const t = await db().selectFrom('trash').selectAll().where('id', '=', trashId).executeTakeFirst();
  if (!t || !isTrashEntity(t.entity_type)) throw notFound();
  const { table } = TRASHABLE[t.entity_type];
  const images: string[] = [];
  if (t.entity_type === 'product') {
    const imgs = await db().selectFrom('product_images').select('path').where('product_id', '=', t.entity_id).execute();
    images.push(...imgs.map((i) => i.path));
    // Order history keeps its own copy of name/price; order_items.product_id is SET NULL on delete.
  }
  try {
    await db().transaction().execute(async (trx) => {
      await trx.deleteFrom(table as 'products').where('id', '=', t.entity_id).where('deleted_at', 'is not', null).execute();
      await trx.deleteFrom('trash').where('id', '=', trashId).execute();
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_ROW_IS_REFERENCED_2') throw badRequest('This item is still referenced by other records and cannot be permanently deleted. Keep it in trash or restore it.');
    throw err;
  }
  for (const img of images) await deleteImageSet(img);
  await audit(req, { action: `${t.entity_type}.purged`, targetType: t.entity_type, targetId: t.entity_id, oldValue: json.parse(t.snapshot, {}) });
}
