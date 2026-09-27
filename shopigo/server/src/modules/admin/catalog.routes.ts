import { Router } from 'express';
import { z } from 'zod';
import { cache } from '../../core/cache.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { parse, slugify, zBool, zText } from '../../core/validate.js';
import { db } from '../../db/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { imageUpload } from '../../middleware/upload.js';
import { audit, diff } from '../../services/audit.js';
import { processIcon, processImage, processLogo } from '../../services/images.js';
import { settings } from '../../services/settings.js';
import { moveToTrash } from '../../services/trash.js';

export const catalogRouter = Router();

async function invalidate() {
  await cache.del('public:');
  await cache.del('home:');
}

function dup(err: unknown): never {
  if ((err as { code?: string }).code === 'ER_DUP_ENTRY') throw conflict('That slug is already in use');
  throw err;
}

// ------------------------------------------------------------ uploads
const FOLDERS = ['products', 'banners', 'categories', 'brands', 'combos', 'media', 'branding'] as const;

/** Upload & optimise images. Returns storage paths the forms then save. */
catalogRouter.post('/uploads', requirePermission('products.manage', 'catalog.manage', 'marketing.manage', 'settings.manage'), imageUpload.array('files', 12), async (req, res) => {
  const folder = String(req.query.folder ?? 'media');
  const kind = String(req.query.kind ?? 'image');
  if (!(FOLDERS as readonly string[]).includes(folder)) throw badRequest('Invalid folder');
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest('No files uploaded');
  const quality = await settings.num('image_quality');
  const out = [];
  for (const f of files) {
    const processed = kind === 'icon' ? await processIcon(f.buffer, folder) : kind === 'logo' ? await processLogo(f.buffer) : await processImage(f.buffer, folder, quality);
    await db().insertInto('media').values({ path: processed.path, folder, original_name: f.originalname.slice(0, 255), mime: f.mimetype, size: processed.bytes, width: processed.width, height: processed.height }).execute();
    out.push({ ...processed, originalSize: f.size, kind });
  }
  res.status(201).json(out);
});

// ------------------------------------------------------------ categories
const categorySchema = z.object({
  name: zText(120).pipe(z.string().min(1)),
  slug: z.string().trim().max(160).optional().nullable(),
  parent_id: z.coerce.number().int().positive().nullable().optional(),
  description: zText(1000).nullable().optional(),
  icon_type: z.enum(['fa', 'image', 'none']).default('fa'),
  icon_value: z.string().trim().max(255).nullable().optional(),
  image: z.string().max(255).nullable().optional(),
  sort_order: z.coerce.number().int().default(0),
  is_active: zBool.default(true),
  show_on_home: zBool.default(true),
  seo_title: zText(255).nullable().optional(),
  seo_description: zText(500).nullable().optional(),
}).refine((v) => v.icon_type !== 'fa' || !v.icon_value || /^(fa-(solid|regular|brands)\s+)?fa-[a-z0-9-]+$/.test(v.icon_value), { message: 'Icon must be a Font Awesome class like "fa-solid fa-shirt"', path: ['icon_value'] });

catalogRouter.get('/categories', requirePermission('products.view', 'catalog.manage'), async (_req, res) => {
  const rows = await db().selectFrom('categories as c').selectAll('c')
    .select((eb) => eb.selectFrom('products as p').select((e) => e.fn.countAll<number>().as('n')).where('p.deleted_at', 'is', null).where((w) => w.or([w('p.category_id', '=', w.ref('c.id')), w('p.subcategory_id', '=', w.ref('c.id'))])).as('product_count'))
    .where('c.deleted_at', 'is', null).orderBy('c.sort_order').orderBy('c.name').execute();
  res.json(rows);
});

function categoryValues(v: z.infer<typeof categorySchema>, slug: string) {
  return {
    name: v.name, slug, parent_id: v.parent_id ?? null, description: v.description ?? null, icon_type: v.icon_type, icon_value: v.icon_value ?? null, image: v.image ?? null,
    sort_order: v.sort_order, is_active: v.is_active ? 1 : 0, show_on_home: v.show_on_home ? 1 : 0, seo_title: v.seo_title ?? null, seo_description: v.seo_description ?? null,
  };
}

catalogRouter.post('/categories', requirePermission('catalog.manage'), async (req, res) => {
  const v = parse(categorySchema, req.body);
  const r = await db().insertInto('categories').values(categoryValues(v, slugify(v.slug || v.name))).executeTakeFirstOrThrow().catch(dup);
  await audit(req, { action: 'category.created', targetType: 'category', targetId: Number(r.insertId), newValue: v });
  await invalidate();
  res.status(201).json({ id: Number(r.insertId) });
});

catalogRouter.put('/categories/:id', requirePermission('catalog.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const before = await db().selectFrom('categories').selectAll().where('id', '=', id).executeTakeFirst();
  if (!before) throw notFound();
  const v = parse(categorySchema, req.body);
  if (v.parent_id === id) throw badRequest('A category cannot be its own parent');
  const values = categoryValues(v, slugify(v.slug || v.name));
  await db().updateTable('categories').set(values).where('id', '=', id).execute().catch(dup);
  const d = diff(before as unknown as Record<string, unknown>, values);
  await audit(req, { action: 'category.updated', targetType: 'category', targetId: id, oldValue: d.oldValue, newValue: d.newValue });
  await invalidate();
  res.json({ ok: true });
});

catalogRouter.post('/categories/reorder', requirePermission('catalog.manage'), async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).max(500) }), req.body);
  for (const [i, id] of ids.entries()) await db().updateTable('categories').set({ sort_order: i }).where('id', '=', id).execute();
  await invalidate();
  res.json({ ok: true });
});

catalogRouter.delete('/categories/:id', requirePermission('catalog.manage'), async (req, res) => {
  await moveToTrash(req, 'category', Number(req.params.id));
  res.json({ ok: true });
});

// ------------------------------------------------------------ brands
const brandSchema = z.object({ name: zText(120).pipe(z.string().min(1)), slug: z.string().trim().max(160).optional().nullable(), logo: z.string().max(255).nullable().optional(), is_active: zBool.default(true), sort_order: z.coerce.number().int().default(0) });

catalogRouter.get('/brands', requirePermission('products.view', 'catalog.manage'), async (_req, res) => {
  res.json(await db().selectFrom('brands').selectAll().where('deleted_at', 'is', null).orderBy('sort_order').orderBy('name').execute());
});

catalogRouter.post('/brands', requirePermission('catalog.manage'), async (req, res) => {
  const v = parse(brandSchema, req.body);
  const r = await db().insertInto('brands').values({ name: v.name, slug: slugify(v.slug || v.name), logo: v.logo ?? null, is_active: v.is_active ? 1 : 0, sort_order: v.sort_order }).executeTakeFirstOrThrow().catch(dup);
  await audit(req, { action: 'brand.created', targetType: 'brand', targetId: Number(r.insertId), newValue: v });
  await invalidate();
  res.status(201).json({ id: Number(r.insertId) });
});

catalogRouter.put('/brands/:id', requirePermission('catalog.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const v = parse(brandSchema, req.body);
  await db().updateTable('brands').set({ name: v.name, slug: slugify(v.slug || v.name), logo: v.logo ?? null, is_active: v.is_active ? 1 : 0, sort_order: v.sort_order }).where('id', '=', id).execute().catch(dup);
  await audit(req, { action: 'brand.updated', targetType: 'brand', targetId: id, newValue: v });
  await invalidate();
  res.json({ ok: true });
});

catalogRouter.delete('/brands/:id', requirePermission('catalog.manage'), async (req, res) => {
  await moveToTrash(req, 'brand', Number(req.params.id));
  res.json({ ok: true });
});
