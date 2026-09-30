'use strict';
/**
 * Buffered analytics. Beacons are aggregated in memory and flushed every 30s
 * with a handful of upserts — zero DB work on the request path.
 */
const http = require('http');
const db = require('./db');
const settings = require('./settings');

let buf = newBuf();
function newBuf() { return { visits: new Map(), devices: new Map(), pages: new Map(), geo: new Map(), views: new Map(), ips: new Map() }; }

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function inc(map, key, n = 1) { map.set(key, (map.get(key) || 0) + n); }

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|monitor|curl|wget|python|axios|node-fetch/i;

/** hit({ path, postId, device, newSession, country, ip, ua }) */
function hit({ path, postId, device, newSession, country, ip, ua }) {
  if (!settings.bool('analytics_enabled')) return;
  if (ua && BOT.test(ua)) return;
  const day = today();
  path = String(path || '/').split('?')[0].slice(0, 190) || '/';
  inc(buf.pages, `${day}|${path}`);
  if (newSession) inc(buf.visits, day);
  if (device && /^[a-z0-9]{8,24}$/i.test(device)) buf.devices.set(`${day}|${device}`, 1);
  if (postId) inc(buf.views, Number(postId));
  if (newSession && settings.bool('geo_lookup')) {
    if (country) inc(buf.geo, `${day}|${country}`);
    else if (ip) buf.ips.set(ip, day);
  }
}

const geoCache = new Map();
function lookupCountry(ip) {
  return new Promise((resolve) => {
    if (!ip || /^(127\.|10\.|192\.168\.|::1|::ffff:127|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return resolve('স্থানীয়');
    if (geoCache.has(ip)) return resolve(geoCache.get(ip));
    const req = http.get({ host: 'ip-api.com', path: `/json/${encodeURIComponent(ip)}?fields=status,country`, timeout: 4000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { const j = JSON.parse(body); const c = j.status === 'success' ? j.country : 'অজানা'; geoCache.set(ip, c); resolve(c); } catch (_) { resolve('অজানা'); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve('অজানা'); });
    req.on('error', () => resolve('অজানা'));
  });
}

const COUNTRY_BN = { Bangladesh: 'বাংলাদেশ', India: 'ভারত', 'United States': 'যুক্তরাষ্ট্র', 'Saudi Arabia': 'সৌদি আরব', 'United Arab Emirates': 'সংযুক্ত আরব আমিরাত', Malaysia: 'মালয়েশিয়া', Qatar: 'কাতার', Oman: 'ওমান', Kuwait: 'কুয়েত', 'United Kingdom': 'যুক্তরাজ্য', Singapore: 'সিঙ্গাপুর', Italy: 'ইতালি', Canada: 'কানাডা', Japan: 'জাপান', Germany: 'জার্মানি', BD: 'বাংলাদেশ', IN: 'ভারত', US: 'যুক্তরাষ্ট্র', SA: 'সৌদি আরব', AE: 'সংযুক্ত আরব আমিরাত', MY: 'মালয়েশিয়া', GB: 'যুক্তরাজ্য' };
function countryName(c) { return COUNTRY_BN[c] || c; }

let flushing = false;
async function flush() {
  if (flushing || !db.ready()) return;
  flushing = true;
  const b = buf; buf = newBuf();
  try {
    // geo lookups (max 40 per flush, ip-api free limit is 45/min)
    let n = 0;
    for (const [ip, day] of b.ips) {
      if (n++ >= 40) break;
      inc(b.geo, `${day}|${countryName(await lookupCountry(ip))}`);
    }
    for (const [day, v] of b.visits) {
      await db.query('INSERT INTO stats_daily (day, visits) VALUES (?, ?) ON DUPLICATE KEY UPDATE visits = visits + VALUES(visits)', [day, v]);
    }
    const pvByDay = new Map();
    for (const [key, v] of b.pages) {
      const [day, path] = key.split('|');
      inc(pvByDay, day, v);
      await db.query('INSERT INTO stats_pages (day, path, views) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE views = views + VALUES(views)', [day, path, v]);
    }
    for (const [day, v] of pvByDay) {
      await db.query('INSERT INTO stats_daily (day, pageviews) VALUES (?, ?) ON DUPLICATE KEY UPDATE pageviews = pageviews + VALUES(pageviews)', [day, v]);
    }
    if (b.devices.size) {
      const rows = [...b.devices.keys()].map((k) => k.split('|'));
      for (let i = 0; i < rows.length; i += 500) {
        await db.raw('INSERT IGNORE INTO stats_devices (day, device) VALUES ?', [rows.slice(i, i + 500)]);
      }
      const days = [...new Set(rows.map((r) => r[0]))];
      for (const day of days) {
        await db.query('INSERT INTO stats_daily (day, uniques) VALUES (?, (SELECT COUNT(*) FROM stats_devices WHERE day = ?)) ON DUPLICATE KEY UPDATE uniques = (SELECT COUNT(*) FROM stats_devices WHERE day = ?)', [day, day, day]);
      }
    }
    for (const [key, v] of b.geo) {
      const [day, country] = key.split('|');
      await db.query('INSERT INTO stats_geo (day, country, visits) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE visits = visits + VALUES(visits)', [day, String(country).slice(0, 64), v]);
    }
    for (const [id, v] of b.views) {
      await db.query('UPDATE posts SET views = views + ? WHERE id = ?', [v, id]);
    }
  } catch (e) {
    console.error('[analytics] flush failed:', e.message);
  } finally {
    flushing = false;
  }
}

async function purgeOld() {
  await db.query('DELETE FROM stats_devices WHERE day < DATE_SUB(CURDATE(), INTERVAL 60 DAY)');
  await db.query('DELETE FROM stats_pages WHERE day < DATE_SUB(CURDATE(), INTERVAL 180 DAY)');
}

module.exports = { hit, flush, purgeOld, countryName };
