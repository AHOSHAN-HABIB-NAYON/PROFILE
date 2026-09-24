'use strict';
/** Canonical application short codes and aliases used across the system. */
const APPS = {
  TG: { name: 'Telegram', aliases: ['telegram', 'tg', 'tlgrm'] },
  WS: { name: 'WhatsApp', aliases: ['whatsapp', 'wa', 'ws', 'whats app'] },
  FB: { name: 'Facebook', aliases: ['facebook', 'fb', 'meta'] },
  IG: { name: 'Instagram', aliases: ['instagram', 'ig', 'insta'] },
  TT: { name: 'TikTok', aliases: ['tiktok', 'tt', 'tik tok'] },
  IMO: { name: 'IMO', aliases: ['imo'] },
  GG: { name: 'Google', aliases: ['google', 'gg', 'gmail', 'youtube'] },
  MS: { name: 'Microsoft', aliases: ['microsoft', 'ms', 'outlook', 'hotmail'] },
  TW: { name: 'X / Twitter', aliases: ['twitter', 'x', 'tw'] },
  SC: { name: 'Snapchat', aliases: ['snapchat', 'sc'] },
  VB: { name: 'Viber', aliases: ['viber', 'vb'] },
  DC: { name: 'Discord', aliases: ['discord', 'dc'] },
  AP: { name: 'Apple', aliases: ['apple', 'icloud'] },
  AMZ: { name: 'Amazon', aliases: ['amazon', 'amz'] },
};

const ALIAS = new Map();
for (const [code, a] of Object.entries(APPS)) {
  ALIAS.set(code.toLowerCase(), code);
  for (const x of a.aliases) ALIAS.set(x, code);
}

function toAppCode(value) {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  if (ALIAS.has(s)) return ALIAS.get(s);
  for (const [alias, code] of ALIAS) if (alias.length > 2 && s.includes(alias)) return code;
  const clean = s.replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 12);
  return clean || null;
}

/** Detect the app from free text without retaining the text itself. */
function detectFromText(text) {
  if (!text) return null;
  const s = String(text).toLowerCase();
  for (const [alias, code] of ALIAS) if (alias.length > 2 && s.includes(alias)) return code;
  return null;
}

module.exports = { APPS, toAppCode, detectFromText };
