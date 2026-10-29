import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countryForZone, detect, greetingPeriod, greetingPeriodForHour, zonedTimeToUtc, offsetMinutes, formatOffset,
  formatLocalTime, isValidIanaZone, isGeographicZone, isValidIso2, zonesForCountry, countryName, partsIn,
} from '../src/tz/index.js';

test('zone.tab mapping', () => {
  const cases = {
    'Asia/Dhaka': 'BD', 'Asia/Riyadh': 'SA', 'Asia/Kuala_Lumpur': 'MY', 'Europe/London': 'GB',
    'America/New_York': 'US', 'Asia/Kolkata': 'IN', 'Asia/Kathmandu': 'NP',
  };
  for (const [z, cc] of Object.entries(cases)) assert.equal(countryForZone(z), cc, z);
});

test('greeting boundaries in five zones', () => {
  const expect = [
    ['04:59', 'night'], ['05:00', 'morning'], ['11:59', 'morning'], ['12:00', 'afternoon'],
    ['16:59', 'afternoon'], ['17:00', 'evening'], ['19:59', 'evening'], ['20:00', 'night'], ['20:59', 'night'], ['21:00', 'night'],
  ];
  for (const tz of ['Asia/Dhaka', 'Asia/Riyadh', 'Asia/Kuala_Lumpur', 'Europe/London', 'America/New_York']) {
    // one winter date and one summer date (DST for London/New York)
    for (const [y, m, d] of [[2026, 1, 15], [2026, 7, 15]]) {
      for (const [hhmm, period] of expect) {
        const [hour, minute] = hhmm.split(':').map(Number);
        const utc = zonedTimeToUtc({ year: y, month: m, day: d, hour, minute }, tz);
        const p = partsIn(utc, tz);
        assert.equal(`${p.hour}:${p.minute}`, `${hour}:${minute}`, `${tz} ${hhmm} round trip`);
        assert.equal(greetingPeriod(utc, tz), period, `${tz} ${y}-${m}-${d} ${hhmm}`);
      }
    }
  }
});

test('greeting uses saved zone, not server/phone clock', () => {
  const instant = new Date('2026-10-27T13:57:00Z'); // 19:57 Dhaka, 16:57 Riyadh, 09:57 New York
  assert.equal(greetingPeriod(instant, 'Asia/Dhaka'), 'evening');
  assert.equal(greetingPeriod(instant, 'Asia/Riyadh'), 'afternoon');
  assert.equal(greetingPeriod(instant, 'America/New_York'), 'morning');
  assert.equal(greetingPeriodForHour(0), 'night');
});

test('half-hour and 45-minute zones, DST offsets', () => {
  const jan = new Date('2026-01-15T12:00:00Z');
  const jul = new Date('2026-07-15T12:00:00Z');
  assert.equal(formatOffset(offsetMinutes(jan, 'Asia/Kolkata')), '+5:30');
  assert.equal(formatOffset(offsetMinutes(jan, 'Asia/Kathmandu')), '+5:45');
  assert.equal(formatOffset(offsetMinutes(jan, 'Asia/Dhaka')), '+6');
  assert.equal(formatOffset(offsetMinutes(jan, 'Europe/London')), '+0');
  assert.equal(formatOffset(offsetMinutes(jul, 'Europe/London')), '+1');
  assert.equal(formatOffset(offsetMinutes(jan, 'America/New_York')), '-5');
  assert.equal(formatOffset(offsetMinutes(jul, 'America/New_York')), '-4');
});

test('date line: Pacific/Kiritimati is a different calendar day than Pacific/Pago_Pago', () => {
  const t = new Date('2026-03-01T12:00:00Z');
  assert.notEqual(partsIn(t, 'Pacific/Kiritimati').day, partsIn(t, 'Pacific/Pago_Pago').day);
});

test('time formatting 12/24 hour and numerals', () => {
  const t = new Date('2026-10-27T13:57:00Z');
  assert.match(formatLocalTime(t, 'Asia/Dhaka', { language: 'en' }), /^7:57\s?PM$/);
  assert.equal(formatLocalTime(t, 'Asia/Dhaka', { language: 'en', hour24: true }), '19:57');
  assert.equal(formatLocalTime(t, 'Asia/Kolkata', { language: 'en', hour24: true }), '19:27');
  assert.equal(formatLocalTime(t, 'Asia/Kathmandu', { language: 'en', hour24: true }), '19:42');
  assert.match(formatLocalTime(t, 'Asia/Dhaka', { language: 'bn', hour24: true }), /১৯:৫৭/);
  assert.match(formatLocalTime(t, 'Asia/Riyadh', { language: 'ar', hour24: true }), /١٦:٥٧/);
});

test('detection priority: timezone > locale > ip > manual', () => {
  // expat in Saudi Arabia with a Bengali phone: trust the time zone
  assert.deepEqual(detect({ deviceTz: 'Asia/Riyadh', localeRegion: 'BD' }), {
    country: 'SA', timezone: 'Asia/Riyadh', source: 'timezone', needsZoneConfirmation: false,
  });
  // UTC/Etc fall back to locale; single-zone country
  assert.deepEqual(detect({ deviceTz: 'Etc/UTC', localeRegion: 'BD' }), {
    country: 'BD', timezone: 'Asia/Dhaka', source: 'locale', needsZoneConfirmation: false,
  });
  // multi-zone country must be confirmed
  const us = detect({ deviceTz: 'UTC', localeRegion: 'US' });
  assert.equal(us.source, 'locale');
  assert.equal(us.needsZoneConfirmation, true);
  // IP hint (VPN cases are handled by zone priority)
  assert.equal(detect({ deviceTz: 'GMT', ipCountryHint: 'MY' }).source, 'ip');
  assert.equal(detect({ deviceTz: 'Asia/Kuala_Lumpur', ipCountryHint: 'US' }).country, 'MY');
  // nothing: manual
  assert.deepEqual(detect({ deviceTz: null }), { country: null, timezone: null, source: null, needsZoneConfirmation: false });
});

test('validation of IANA zones and ISO-2 codes', () => {
  assert.ok(isValidIanaZone('Asia/Dhaka'));
  assert.ok(isValidIanaZone('UTC'));
  assert.ok(!isGeographicZone('UTC'));
  assert.ok(!isValidIanaZone('Mars/Olympus'));
  assert.ok(!isValidIanaZone(''));
  assert.ok(isValidIso2('bd'));
  assert.ok(!isValidIso2('XX'));
  assert.ok(zonesForCountry('US').length > 1);
  assert.equal(zonesForCountry('BD')[0], 'Asia/Dhaka');
});

test('localized country names from CLDR', () => {
  assert.equal(countryName('BD', 'en'), 'Bangladesh');
  assert.equal(countryName('BD', 'bn'), 'বাংলাদেশ');
  assert.equal(countryName('MY', 'ms'), 'Malaysia');
});
