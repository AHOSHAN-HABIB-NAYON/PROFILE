// Seed data. Everything here is editable later in the admin panel without an app update.
// Prices are PLACEHOLDERS (ASSUMPTIONS A-020). Emergency numbers must be verified before release
// (verified_at stays NULL until someone checks them; ASSUMPTIONS A-021).

export const plans = [
  {
    code: 'free', name: 'Free', is_free: true, sort_order: 1, trial_days: 0,
    max_children: 1, max_members: 2, max_places: 2, history_days: 3,
    priority_support: false, email_reports: false, is_popular: false,
    features: ['live_map', 'sos', 'places', 'history', 'faq_support', 'email_support'],
  },
  {
    code: 'premium', name: 'Premium', is_free: false, sort_order: 2, trial_days: 7,
    max_children: 3, max_members: 6, max_places: 10, history_days: 30,
    priority_support: true, email_reports: true, is_popular: true,
    features: ['live_map', 'sos', 'places', 'history', 'safe_walk', 'priority_support', 'email_reports'],
  },
  {
    code: 'family_plus', name: 'Family Plus', is_free: false, sort_order: 3, trial_days: 7,
    // "6+ children, 10+ members": stored as the floor; admin can raise. null = unlimited places.
    max_children: 6, max_members: 10, max_places: null, history_days: 90,
    priority_support: true, email_reports: true, is_popular: false,
    features: ['live_map', 'sos', 'places', 'history', 'safe_walk', 'priority_support', 'email_reports'],
  },
];

// amount_minor = smallest currency unit (cents, poisha, halalas, sen).
export const planPrices = [
  ['premium', 'monthly', 1, 'USD', null, 299, 'nirapod_premium', 'monthly'],
  ['premium', 'yearly', 12, 'USD', null, 2499, 'nirapod_premium', 'yearly'],
  ['family_plus', 'monthly', 1, 'USD', null, 499, 'nirapod_family_plus', 'monthly'],
  ['family_plus', 'yearly', 12, 'USD', null, 3999, 'nirapod_family_plus', 'yearly'],
  ['premium', 'monthly', 1, 'BDT', 'BD', 29900, 'nirapod_premium', 'monthly'],
  ['premium', 'yearly', 12, 'BDT', 'BD', 249900, 'nirapod_premium', 'yearly'],
  ['family_plus', 'monthly', 1, 'BDT', 'BD', 49900, 'nirapod_family_plus', 'monthly'],
  ['family_plus', 'yearly', 12, 'BDT', 'BD', 399900, 'nirapod_family_plus', 'yearly'],
  ['premium', 'monthly', 1, 'SAR', 'SA', 1199, 'nirapod_premium', 'monthly'],
  ['premium', 'yearly', 12, 'SAR', 'SA', 9499, 'nirapod_premium', 'yearly'],
  ['premium', 'monthly', 1, 'MYR', 'MY', 1290, 'nirapod_premium', 'monthly'],
  ['premium', 'yearly', 12, 'MYR', 'MY', 9990, 'nirapod_premium', 'yearly'],
].map(([plan, period, duration_months, currency, country_iso2, amount_minor, play_product_id, play_base_plan_id]) => ({
  plan, period, duration_months, currency, country_iso2, amount_minor, play_product_id, play_base_plan_id,
}));

// country, service, number, note
export const emergencyNumbers = [
  ['BD', 'general', '999', 'National emergency service (police, fire, ambulance)'],
  ['SA', 'general', '911', 'Unified emergency number (major regions)'],
  ['SA', 'police', '999', null],
  ['SA', 'ambulance', '997', null],
  ['SA', 'fire', '998', null],
  ['AE', 'police', '999', null],
  ['AE', 'ambulance', '998', null],
  ['AE', 'fire', '997', null],
  ['QA', 'general', '999', null],
  ['KW', 'general', '112', null],
  ['OM', 'general', '9999', null],
  ['BH', 'general', '999', null],
  ['MY', 'general', '999', 'Police and ambulance; 112 from mobile phones'],
  ['MY', 'fire', '994', null],
  ['SG', 'police', '999', null],
  ['SG', 'ambulance', '995', 'Ambulance and fire'],
  ['GB', 'general', '999', '112 also works'],
  ['IE', 'general', '112', '999 also works'],
  ['US', 'general', '911', null],
  ['CA', 'general', '911', null],
  ['AU', 'general', '000', null],
  ['IN', 'general', '112', null],
  ['IN', 'ambulance', '108', null],
  ['IN', 'fire', '101', null],
  ['NP', 'police', '100', null],
  ['NP', 'ambulance', '102', null],
  ['NP', 'fire', '101', null],
  ['PK', 'police', '15', null],
  ['PK', 'ambulance', '1122', 'Rescue 1122 (most provinces)'],
  ['IT', 'general', '112', null],
  ['ES', 'general', '112', null],
  ['FR', 'general', '112', null],
  ['DE', 'general', '112', null],
  ['ID', 'general', '112', null],
  ['JP', 'police', '110', null],
  ['JP', 'ambulance', '119', 'Ambulance and fire'],
  ['KR', 'police', '112', null],
  ['KR', 'ambulance', '119', 'Ambulance and fire'],
].map(([country_iso2, service, number, note]) => ({ country_iso2, service, number, note }));

export function appSettings({ allLanguages = false } = {}) {
  return {
    free_plan_enabled: true,
    free_limits: { max_children: 1, max_members: 2, max_places: 2, history_days: 3 },
    trial_days: 7,
    country_overrides: {},
    min_version: '0.1.0',
    latest_version: '0.1.0',
    update_message: { en: 'A new version of Nirapod is available.' },
    play_store_url: 'https://play.google.com/store/apps/details?id=app.nirapod.family',
    // Languages other than en/bn stay off until a native speaker reviews them (DECISIONS D-006).
    languages_enabled: {
      en: true, bn: true,
      hi: allLanguages, ur: allLanguages, ar: allLanguages, es: allLanguages, id: allLanguages, ms: allLanguages,
    },
    whatsapp_number: '',
    payment_banner_enabled: false,
    payment_banner_show_logos: false,
    payment_banner_countries: [],
    payment_banner_text: { en: 'Pay locally with bKash or Nagad on WhatsApp', bn: 'বিকাশ বা নগদে WhatsApp-এ পেমেন্ট করুন' },
    nearby_places_enabled: true,
    nearby_places_daily_cap: 1000,
    nearby_places_per_user_daily: 30,
    live_chat_human_for: 'all',
    chat_inactivity_warn_minutes: 5,
    chat_autoclose_minutes: 5,
    landing_ai_chat_enabled: false,
    legal_request_email: '',
    support_emails: [],
  };
}
