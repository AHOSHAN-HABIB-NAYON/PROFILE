import { Router } from 'express';
import { fromJson } from '../db/json.js';

// Public, non-secret settings the app reads at start (force update, feature switches, languages).
// Full shape is in docs/CONTRACTS/openapi.yaml (AppConfig). Never put secrets here.
export const PUBLIC_SETTING_KEYS = [
  'min_version', 'latest_version', 'update_message', 'play_store_url', 'languages_enabled',
  'free_plan_enabled', 'trial_days', 'whatsapp_number', 'payment_banner_enabled', 'payment_banner_show_logos',
  'payment_banner_countries', 'payment_banner_text', 'payment_banner_logos', 'nearby_places_enabled', 'live_chat_human_for', 'landing_ai_chat_enabled',
  // Firebase client config (public identifiers, not secrets); set in admin.
  'firebase_android',
];

export function appConfigRouter({ db }) {
  const r = Router();
  r.get('/app-config', async (req, res, next) => {
    try {
      const rows = await db('app_settings').whereIn('key', PUBLIC_SETTING_KEYS).select('key', 'value');
      const out = {};
      for (const { key, value } of rows) out[key] = fromJson(value);
      res.set('cache-control', 'public, max-age=300').json(out);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
