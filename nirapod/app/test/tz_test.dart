import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nirapod/core/i18n/languages.dart';
import 'package:nirapod/core/tz/tz_utils.dart';
import 'package:timezone/timezone.dart' as tz;

import 'helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late TzData data;
  setUpAll(() async {
    data = await loadTz();
    await initializeDateFormatting();
  });

  test('zone.tab mapping', () {
    const cases = {
      'Asia/Dhaka': 'BD', 'Asia/Riyadh': 'SA', 'Asia/Kuala_Lumpur': 'MY', 'Europe/London': 'GB',
      'America/New_York': 'US', 'Asia/Kolkata': 'IN', 'Asia/Kathmandu': 'NP',
    };
    cases.forEach((zone, cc) => expect(data.countryForZone(zone), cc, reason: zone));
  });

  test('greeting boundaries in five zones, winter and summer', () {
    const expectations = {
      '04:59': GreetingPeriod.night, '05:00': GreetingPeriod.morning, '11:59': GreetingPeriod.morning,
      '12:00': GreetingPeriod.afternoon, '16:59': GreetingPeriod.afternoon, '17:00': GreetingPeriod.evening,
      '19:59': GreetingPeriod.evening, '20:00': GreetingPeriod.night, '20:59': GreetingPeriod.night, '21:00': GreetingPeriod.night,
    };
    for (final zone in ['Asia/Dhaka', 'Asia/Riyadh', 'Asia/Kuala_Lumpur', 'Europe/London', 'America/New_York']) {
      final loc = tz.getLocation(zone);
      for (final month in [1, 7]) {
        expectations.forEach((hhmm, period) {
          final p = hhmm.split(':').map(int.parse).toList();
          final instant = tz.TZDateTime(loc, 2026, month, 15, p[0], p[1]).toUtc();
          expect(greetingPeriod(instant, zone), period, reason: '$zone 2026-$month-15 $hhmm');
        });
      }
    }
  });

  test('greeting follows the saved zone, not the phone clock', () {
    final instant = DateTime.utc(2026, 10, 27, 13, 57);
    expect(greetingPeriod(instant, 'Asia/Dhaka'), GreetingPeriod.evening);
    expect(greetingPeriod(instant, 'Asia/Riyadh'), GreetingPeriod.afternoon);
    expect(greetingPeriod(instant, 'America/New_York'), GreetingPeriod.morning);
  });

  test('half-hour and 45-minute zones; DST offsets', () {
    String off(String zone, DateTime utc) => formatUtcOffset(inZone(utc, zone).timeZoneOffset);
    final jan = DateTime.utc(2026, 1, 15, 12);
    final jul = DateTime.utc(2026, 7, 15, 12);
    expect(off('Asia/Kolkata', jan), '+5:30');
    expect(off('Asia/Kathmandu', jan), '+5:45');
    expect(off('Asia/Dhaka', jan), '+6');
    expect(off('Europe/London', jan), '+0');
    expect(off('Europe/London', jul), '+1');
    expect(off('America/New_York', jan), '-5');
    expect(off('America/New_York', jul), '-4');
  });

  test('12/24-hour formatting and numerals', () {
    final t = DateTime.utc(2026, 10, 27, 13, 57);
    final en = languageFor('en');
    expect(formatLocalTime(t, 'Asia/Dhaka', language: en, use24h: false), '7:57 PM');
    expect(formatLocalTime(t, 'Asia/Dhaka', language: en, use24h: true), '19:57');
    expect(formatLocalTime(t, 'Asia/Kolkata', language: en, use24h: true), '19:27');
    expect(formatLocalTime(t, 'Asia/Kathmandu', language: en, use24h: true), '19:42');
    expect(formatLocalTime(t, 'Asia/Dhaka', language: languageFor('bn'), use24h: true), '১৯:৫৭');
    expect(formatLocalTime(t, 'Asia/Riyadh', language: languageFor('ar'), use24h: true), '١٦:٥٧');
    expect(formatLocalTime(t, 'Asia/Karachi', language: languageFor('ur'), use24h: true), '۱۸:۵۷');
    expect(formatLongDate(t, 'Asia/Dhaka', language: en), 'Tuesday, 27 October');
  });

  test('midnight rollover and date line', () {
    final t = DateTime.utc(2026, 3, 1, 18, 30); // 00:30 next day in Dhaka
    expect(inZone(t, 'Asia/Dhaka').day, 2);
    expect(greetingPeriod(t, 'Asia/Dhaka'), GreetingPeriod.night);
    final noon = DateTime.utc(2026, 3, 1, 12);
    expect(inZone(noon, 'Pacific/Kiritimati').day, isNot(inZone(noon, 'Pacific/Pago_Pago').day));
  });

  test('detection priority: timezone > locale > ip > manual', () {
    // Expat with a Bengali phone in Saudi Arabia: trust the time zone.
    var d = data.detect(deviceZone: 'Asia/Riyadh', localeRegion: 'BD');
    expect([d.country, d.timezone, d.source], ['SA', 'Asia/Riyadh', DetectionSource.timezone]);
    // UTC / Etc fall back to locale.
    d = data.detect(deviceZone: 'Etc/UTC', localeRegion: 'BD');
    expect([d.country, d.timezone, d.source, d.needsZoneConfirmation], ['BD', 'Asia/Dhaka', DetectionSource.locale, false]);
    // A country with several zones must be confirmed.
    d = data.detect(deviceZone: 'UTC', localeRegion: 'US');
    expect(d.needsZoneConfirmation, isTrue);
    // IP hint; VPN does not override a real zone.
    expect(data.detect(deviceZone: 'GMT', ipCountryHint: 'MY').source, DetectionSource.ip);
    expect(data.detect(deviceZone: 'Asia/Kuala_Lumpur', ipCountryHint: 'US').country, 'MY');
    // Nothing known: manual pick.
    d = data.detect();
    expect([d.country, d.timezone, d.source], [null, null, null]);
  });

  test('validation', () {
    expect(data.isValidZone('Asia/Dhaka'), isTrue);
    expect(data.isValidZone('UTC'), isTrue);
    expect(data.isGeographicZone('UTC'), isFalse);
    expect(data.isValidZone('Mars/Olympus'), isFalse);
    expect(data.isValidCountry('bd'), isTrue);
    expect(data.isValidCountry('XX'), isFalse);
    expect(data.zonesForCountry('BD').first, 'Asia/Dhaka');
  });

  test('minute-aligned refresh', () {
    expect(untilNextMinute(DateTime(2026, 1, 1, 10, 0, 45, 500)), const Duration(seconds: 14, milliseconds: 500));
    expect(untilNextMinute(DateTime(2026, 1, 1, 23, 59, 59)), const Duration(seconds: 1));
  });
}
