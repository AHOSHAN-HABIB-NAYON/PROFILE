// shared/i18n/en.json (canonical keys) + the screen namespace map below -> docs/CONTRACTS/i18n-keys.json
import { emit, done, readJson } from './lib.mjs';

const RULES = [
  "Keys are 'namespace.key'. English (en.json) is the canonical key list and must contain every key below.",
  'en and bn must be 100% complete. hi, ur, ar, es, id, ms may be partial.',
  'NO MIXING: a screen declares its namespaces (screens map). If the selected language is missing ANY key in those namespaces, the whole screen renders in English (layout direction still follows the selected language).',
  'Placeholders ({name}) must match exactly across all languages.',
  'Malay (ms) and Indonesian (id) are separate files and must never be copied from each other.',
  'Edit shared/i18n/*.json and SCREENS in tools/gen-i18n-contract.mjs, then run npm run i18n. CI checks drift.',
];

// Screen id (or group) -> namespaces it uses.
export const SCREENS = {
  _default: ['common', 'nav', 'state', 'trust', 'err', 'a11y', 'lang', 'permneed'],
  splash: ['common'],
  welcome: ['common', 'welcome', 'lang', 'a11y'],
  permissions: ['common', 'perm'],
  role: ['common', 'role'],
  login: ['common', 'auth', 'lang', 'err', 'a11y'],
  register: ['common', 'auth', 'lang', 'err', 'a11y'],
  verify_email: ['common', 'verify', 'lang', 'err', 'a11y'],
  forgot: ['common', 'forgot', 'auth', 'verify', 'lang', 'err', 'a11y'],
  google_terms: ['common', 'google', 'auth'],
  child_code: ['common', 'child', 'verify', 'lang', 'err', 'a11y'],
  profile_setup: ['common', 'profile', 'state', 'err', 'a11y'],
  child_onboarding: ['common', 'childperm', 'perm'],
  child_code_generate: ['common', 'code', 'state', 'err'],
  sessions: ['common', 'sessions', 'state', 'err'],
  legal: ['common', 'legal', 'state', 'err'],
  home: ['common', 'nav', 'state', 'trust', 'err', 'a11y', 'lang', 'greeting', 'time', 'dialog', 'home', 'permneed'],
  member: ['common', 'state', 'trust', 'err', 'a11y', 'member', 'home', 'time'],
  family: ['common', 'state', 'err', 'a11y', 'family', 'home', 'dialog'],
  map: ['common', 'state', 'trust', 'err', 'a11y', 'map', 'home', 'permneed'],
  me: ['common', 'state', 'err', 'a11y', 'me', 'dialog'],
  history: ['common', 'state', 'err', 'a11y', 'history', 'home', 'trust', 'map'],
  tracking: ['tracking'],
  child_home: ['common', 'state', 'trust', 'err', 'a11y', 'lang', 'greeting', 'time', 'dialog', 'notif', 'kid', 'sos', 'walk', 'places', 'home', 'permneed'],
  places: ['common', 'state', 'err', 'a11y', 'places', 'dialog', 'map', 'home'],
  sos: ['common', 'state', 'err', 'a11y', 'sos', 'time', 'trust'],
  safe_walk: ['common', 'state', 'err', 'a11y', 'walk', 'time', 'trust', 'home'],
  emergency_contacts: ['common', 'state', 'err', 'a11y', 'econ', 'dialog'],
  premium: ['common', 'state', 'err', 'a11y', 'prem'],
  notifications: ['common', 'state', 'err', 'a11y', 'alerts', 'notif', 'notifset', 'history', 'time', 'permneed'],
  settings: ['common', 'state', 'err', 'a11y', 'set', 'me', 'dialog'],
  data_export: ['common', 'state', 'err', 'a11y', 'export'],
  delete_account: ['common', 'state', 'err', 'a11y', 'delacc', 'dialog', 'export', 'auth'],
  help: ['common', 'state', 'err', 'a11y', 'help', 'faq'],
  update: ['common', 'upd'],
  chat: ['common', 'state', 'err', 'a11y', 'chat', 'time'],
  placeholder: ['common', 'nav'],
  language_sheet: ['lang'],
};

const en = readJson('shared/i18n/en.json');
const keys = Object.fromEntries(
  Object.entries(en).map(([k, v]) => [k, { placeholders: [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]), en: v }]),
);
emit('docs/CONTRACTS/i18n-keys.json', JSON.stringify({ _rules: RULES, screens: SCREENS, keys }, null, 2));
done(`i18n contract (${Object.keys(keys).length} keys)`);
