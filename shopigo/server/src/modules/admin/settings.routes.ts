import { Router } from 'express';
import { z } from 'zod';
import { cache } from '../../core/cache.js';
import { badRequest } from '../../core/errors.js';
import { parse, zText } from '../../core/validate.js';
import { db } from '../../db/index.js';
import { requirePermission } from '../../middleware/auth.js';
import { audit } from '../../services/audit.js';
import { SETTING_GROUPS, settings } from '../../services/settings.js';

export const settingsRouter = Router();
settingsRouter.use(requirePermission('settings.manage'));

settingsRouter.get('/', async (_req, res) => {
  res.json({ groups: SETTING_GROUPS, definitions: settings.definitions().map(({ default: _d, ...def }) => def), values: await settings.adminView() });
});

settingsRouter.put('/', async (req, res) => {
  const { values } = parse(z.object({ values: z.record(z.unknown()) }), req.body);
  let changes;
  try { changes = await settings.update(values); } catch (err) { throw badRequest((err as Error).message); }
  if (Object.keys(changes).length) {
    await audit(req, { action: 'settings.updated', targetType: 'settings', oldValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v[0]])), newValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v[1]])) });
  }
  res.json({ ok: true, changed: Object.keys(changes) });
});

settingsRouter.get('/seo', async (_req, res) => {
  res.json(await db().selectFrom('seo_settings').selectAll().orderBy('id').execute());
});

settingsRouter.put('/seo', async (req, res) => {
  const { pages } = parse(z.object({ pages: z.array(z.object({ page_key: z.string().max(60), title: zText(255).nullable().optional(), description: zText(500).nullable().optional(), keywords: zText(500).nullable().optional(), og_image: z.string().max(255).nullable().optional() })).max(30) }), req.body);
  for (const p of pages) {
    await db().insertInto('seo_settings').values({ page_key: p.page_key, title: p.title ?? null, description: p.description ?? null, keywords: p.keywords ?? null, og_image: p.og_image ?? null })
      .onDuplicateKeyUpdate({ title: p.title ?? null, description: p.description ?? null, keywords: p.keywords ?? null, og_image: p.og_image ?? null }).execute();
  }
  await cache.del('seo:');
  await audit(req, { action: 'seo.updated', targetType: 'settings', newValue: pages });
  res.json({ ok: true });
});
