// Time zone utilities (IANA). Uses the ICU data built into Node (full-icu) for conversions and
// shared/tz/zone.tab (IANA tzdata) for zone -> country mapping. Mirrors app/lib/core/tz/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.resolve(here, '../../../shared/tz');

function readTab(file) {
  return fs
    .readFileSync(path.join(SHARED, file), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t'));
}

// zone -> ISO2 (zone.tab has one country per zone)
export const zoneTab = new Map(readTab('zone.tab').map(([cc, , zone]) => [zone, cc]));
// ISO2 -> English name (iso3166.tab); localized names come from CLDR via Intl.DisplayNames
export const iso3166 = new Map(readTab('iso3166.tab').map(([cc, name]) => [cc, name]));
// ISO2 -> zones, in zone.tab order (first is the default / most populous by tzdata convention)
export const zonesByCountry = new Map();
for (const [zone, cc] of zoneTab) {
  if (!zonesByCountry.has(cc)) zonesByCountry.set(cc, []);
  zonesByCountry.get(cc).push(zone);
}

const NON_GEOGRAPHIC = /^(UTC|GMT|UCT|Universal|Zulu|Etc\/.*|Factory)$/i;

export function isValidIanaZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  if (!zoneTab.has(tz) && !NON_GEOGRAPHIC.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A zone that identifies a place (not UTC/GMT/Etc). */
export function isGeographicZone(tz) {
  return isValidIanaZone(tz) && !NON_GEOGRAPHIC.test(tz) && zoneTab.has(tz);
}

export function isValidIso2(cc) {
  return typeof cc === 'string' && iso3166.has(cc.toUpperCase());
}

export function countryForZone(tz) {
  return zoneTab.get(tz) ?? null;
}

export function zonesForCountry(cc) {
  return zonesByCountry.get(String(cc).toUpperCase()) ?? [];
}

/**
 * Country/time zone detection. Priority: time zone > locale > IP hint > manual.
 * Never uses GPS, SIM or phone state.
 * @returns {{country: string|null, timezone: string|null, source: 'timezone'|'locale'|'ip'|null,
 *            needsZoneConfirmation: boolean}}
 */
export function detect({ deviceTz, localeRegion, ipCountryHint } = {}) {
  let country = null;
  let source = null;
  if (isGeographicZone(deviceTz)) {
    country = countryForZone(deviceTz);
    source = 'timezone';
  } else if (localeRegion && isValidIso2(localeRegion)) {
    country = localeRegion.toUpperCase();
    source = 'locale';
  } else if (ipCountryHint && isValidIso2(ipCountryHint)) {
    country = ipCountryHint.toUpperCase();
    source = 'ip';
  }
  let timezone = null;
  let needsZoneConfirmation = false;
  if (isGeographicZone(deviceTz)) {
    timezone = deviceTz;
  } else if (country) {
    const zones = zonesForCountry(country);
    timezone = zones[0] ?? null;
    needsZoneConfirmation = zones.length > 1;
  }
  return { country, timezone, source, needsZoneConfirmation };
}

/** Wall-clock parts of `date` in `tz`. */
export function partsIn(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second,
    weekday: p.weekday,
  };
}

/** UTC offset of `tz` at `date`, in minutes (DST-aware). */
export function offsetMinutes(date, tz) {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** "+6", "+5:30", "+5:45", "-4", "+0" */
export function formatOffset(mins) {
  const sign = mins < 0 ? '-' : '+';
  const a = Math.abs(mins);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return m ? `${sign}${h}:${String(m).padStart(2, '0')}` : `${sign}${h}`;
}

/** Greeting period from the hour in the user's saved zone: 05-11 morning, 12-16 afternoon, 17-20 evening, 21-04 night. */
export function greetingPeriodForHour(hour) {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  return 'night';
}

export function greetingPeriod(date, tz) {
  return greetingPeriodForHour(partsIn(date, tz).hour);
}

const NUMBERING = { en: 'latn', bn: 'beng', hi: 'latn', ur: 'arabext', ar: 'arab', es: 'latn', id: 'latn', ms: 'latn' };

/** Local time like "7:57 PM" / "19:57" / "৭:৫৭ PM" in the language's numerals. */
export function formatLocalTime(date, tz, { language = 'en', hour24 = false } = {}) {
  const nu = NUMBERING[language] ?? 'latn';
  return new Intl.DateTimeFormat(`${language}-u-nu-${nu}`, {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hourCycle: hour24 ? 'h23' : 'h12',
  }).format(date);
}

/** Localized country name (CLDR) for the selected language. */
export function countryName(cc, language = 'en') {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(cc.toUpperCase()) ?? iso3166.get(cc) ?? cc;
  } catch {
    return iso3166.get(cc) ?? cc;
  }
}

/** UTC Date for a wall-clock time in `tz` (DST-aware; for a skipped hour returns the post-transition instant). */
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, tz) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let t = guess - offsetMinutes(new Date(guess), tz) * 60000;
  // second pass handles instants near a DST transition
  t = guess - offsetMinutes(new Date(t), tz) * 60000;
  return new Date(t);
}
