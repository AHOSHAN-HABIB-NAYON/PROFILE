// Idempotent seed: safe to run repeatedly. Upserts plans, prices, emergency numbers and app settings.
// Existing app_settings values are NOT overwritten (admin edits win).
import { plans, planPrices, emergencyNumbers, appSettings } from './seed-data.js';

export async function seed(db, { allLanguages = false } = {}) {
  for (const p of plans) {
    await db('plans')
      .insert({ ...p, features: JSON.stringify(p.features) })
      .onConflict('code')
      .ignore();
  }
  const planIds = Object.fromEntries((await db('plans').select('id', 'code')).map((r) => [r.code, r.id]));

  const existingPrices = await db('plan_prices').count({ n: '*' }).first();
  if (Number(existingPrices.n) === 0) {
    await db('plan_prices').insert(
      planPrices.map(({ plan, ...rest }) => ({ ...rest, plan_id: planIds[plan] })),
    );
  }

  for (const e of emergencyNumbers) {
    await db('emergency_numbers').insert(e).onConflict(['country_iso2', 'service']).ignore();
  }

  for (const [key, value] of Object.entries(appSettings({ allLanguages }))) {
    await db('app_settings').insert({ key, value: JSON.stringify(value) }).onConflict('key').ignore();
  }

  const ai = await db('ai_settings').first();
  if (!ai) await db('ai_settings').insert({ provider: 'openai', enabled: false });
}
