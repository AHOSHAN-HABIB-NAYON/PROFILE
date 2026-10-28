// Optional country hint from a LOCAL GeoIP database (MaxMind GeoLite2-Country .mmdb via the `maxmind` reader).
// The IP is used only for this in-memory lookup: never stored, logged or sent to a third party.
// Lowest priority in detection (time zone > locale > IP).
import maxmind from 'maxmind';
import { Router } from 'express';
import { isValidIso2 } from '../tz/index.js';

export function createGeoLookup({ path, logger }) {
  if (!path) return async () => null;
  let reader;
  return async (ip) => {
    try {
      reader ??= maxmind.open(path);
      const rec = (await reader).get(ip);
      return rec?.country?.iso_code ?? rec?.registered_country?.iso_code ?? null;
    } catch {
      reader = undefined;
      logger.warn('GeoIP lookup unavailable');
      return null;
    }
  };
}

export function geoRouter({ geoLookup }) {
  const r = Router();
  r.get('/geo/hint', async (req, res) => {
    let cc = null;
    try {
      cc = await geoLookup(req.ip);
    } catch {
      cc = null;
    }
    res.set('cache-control', 'no-store').json({ country_iso2: cc && isValidIso2(cc) ? cc.toUpperCase() : null });
  });
  return r;
}
