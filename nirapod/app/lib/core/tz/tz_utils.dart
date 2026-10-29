import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../i18n/languages.dart';
import '../i18n/numerals.dart';

/// IANA time zone helpers. Mirrors server/src/tz/index.js; both are tested against the same cases.
/// Conversions use the IANA database bundled in package:timezone; zone -> country uses zone.tab.
class TzData {
  TzData._(this.zoneToCountry, this.countryNames, this.zonesByCountry);

  final Map<String, String> zoneToCountry;
  final Map<String, String> countryNames; // ISO2 -> English name (iso3166.tab)
  final Map<String, List<String>> zonesByCountry;

  static bool _dbReady = false;

  static void ensureDatabase() {
    if (_dbReady) return;
    tzdata.initializeTimeZones();
    _dbReady = true;
  }

  static TzData parse({required String zoneTab, required String iso3166}) {
    ensureDatabase();
    final z2c = <String, String>{};
    final byCountry = <String, List<String>>{};
    for (final line in zoneTab.split('\n')) {
      if (line.isEmpty || line.startsWith('#')) continue;
      final cols = line.split('\t');
      if (cols.length < 3) continue;
      z2c[cols[2]] = cols[0];
      byCountry.putIfAbsent(cols[0], () => []).add(cols[2]);
    }
    final names = <String, String>{};
    for (final line in iso3166.split('\n')) {
      if (line.isEmpty || line.startsWith('#')) continue;
      final cols = line.split('\t');
      if (cols.length >= 2) names[cols[0]] = cols[1];
    }
    return TzData._(z2c, names, byCountry);
  }

  static Future<TzData> load(AssetBundle assets) async => parse(
        zoneTab: await assets.loadString('assets/tz/zone.tab'),
        iso3166: await assets.loadString('assets/tz/iso3166.tab'),
      );

  static final _nonGeographic = RegExp(r'^(UTC|GMT|UCT|Universal|Zulu|Etc/.*|Factory)$', caseSensitive: false);

  bool isValidZone(String? zone) {
    if (zone == null || zone.isEmpty) return false;
    if (!zoneToCountry.containsKey(zone) && !_nonGeographic.hasMatch(zone)) return false;
    try {
      tz.getLocation(zone);
      return true;
    } catch (_) {
      return _nonGeographic.hasMatch(zone);
    }
  }

  /// A zone that identifies a place (not UTC/GMT/Etc/*).
  bool isGeographicZone(String? zone) => isValidZone(zone) && !_nonGeographic.hasMatch(zone!) && zoneToCountry.containsKey(zone);

  bool isValidCountry(String? cc) => cc != null && countryNames.containsKey(cc.toUpperCase());

  String? countryForZone(String zone) => zoneToCountry[zone];

  List<String> zonesForCountry(String cc) => zonesByCountry[cc.toUpperCase()] ?? const [];

  /// Priority: time zone > locale > IP hint > manual. Never uses GPS, SIM or phone state.
  Detection detect({String? deviceZone, String? localeRegion, String? ipCountryHint}) {
    String? country;
    DetectionSource? source;
    if (isGeographicZone(deviceZone)) {
      country = countryForZone(deviceZone!);
      source = DetectionSource.timezone;
    } else if (isValidCountry(localeRegion)) {
      country = localeRegion!.toUpperCase();
      source = DetectionSource.locale;
    } else if (isValidCountry(ipCountryHint)) {
      country = ipCountryHint!.toUpperCase();
      source = DetectionSource.ip;
    }
    String? zone;
    var confirm = false;
    if (isGeographicZone(deviceZone)) {
      zone = deviceZone;
    } else if (country != null) {
      final zones = zonesForCountry(country);
      zone = zones.isEmpty ? null : zones.first;
      confirm = zones.length > 1;
    }
    return Detection(country: country, timezone: zone, source: source, needsZoneConfirmation: confirm);
  }
}

enum DetectionSource { timezone, locale, ip, manual }

class Detection {
  const Detection({this.country, this.timezone, this.source, this.needsZoneConfirmation = false});
  final String? country;
  final String? timezone;
  final DetectionSource? source;
  final bool needsZoneConfirmation;

  @override
  String toString() => 'Detection($country, $timezone, $source, confirm=$needsZoneConfirmation)';
}

enum GreetingPeriod { morning, afternoon, evening, night }

/// 05-11 morning, 12-16 afternoon, 17-19 evening, 20-04 night (from 8 PM it is night, as people say in Bangladesh).
GreetingPeriod greetingPeriodForHour(int hour) {
  if (hour >= 5 && hour <= 11) return GreetingPeriod.morning;
  if (hour >= 12 && hour <= 16) return GreetingPeriod.afternoon;
  if (hour >= 17 && hour <= 19) return GreetingPeriod.evening;
  return GreetingPeriod.night;
}

/// Wall-clock time of [instant] in [zone] (DST-aware, handles :30 and :45 offsets).
tz.TZDateTime inZone(DateTime instant, String zone) {
  TzData.ensureDatabase();
  return tz.TZDateTime.from(instant.toUtc(), tz.getLocation(zone));
}

/// Greeting from the user's SAVED zone, not the phone clock.
GreetingPeriod greetingPeriod(DateTime instant, String zone) => greetingPeriodForHour(inZone(instant, zone).hour);

/// "+6", "+5:30", "+5:45", "-4", "+0"
String formatUtcOffset(Duration offset) {
  final mins = offset.inMinutes;
  final sign = mins < 0 ? '-' : '+';
  final a = mins.abs();
  final h = a ~/ 60;
  final m = a % 60;
  return m == 0 ? '$sign$h' : '$sign$h:${m.toString().padLeft(2, '0')}';
}

/// Live local time like "7:57 PM" or "19:57", with the selected language's numerals.
/// [use24h] should come from MediaQuery.alwaysUse24HourFormatOf(context).
String formatLocalTime(DateTime instant, String zone, {required Language language, required bool use24h}) {
  final local = inZone(instant, zone);
  final h = use24h ? local.hour.toString().padLeft(2, '0') : ((local.hour + 11) % 12 + 1).toString();
  final m = local.minute.toString().padLeft(2, '0');
  final core = localizeDigits('$h:$m', language.numerals);
  if (use24h) return core;
  final isPm = local.hour >= 12;
  return '$core ${_dayPeriod(language.code, isPm)}';
}

String _dayPeriod(String lang, bool pm) {
  try {
    final symbols = DateFormat('a', lang).dateSymbols.AMPMS;
    return pm ? symbols[1] : symbols[0];
  } catch (_) {
    return pm ? 'PM' : 'AM';
  }
}

/// Full date for the long-press tooltip, e.g. "Tuesday, 27 October".
String formatLongDate(DateTime instant, String zone, {required Language language}) {
  final local = inZone(instant, zone);
  try {
    return localizeDigits(DateFormat('EEEE, d MMMM', language.code).format(local), language.numerals);
  } catch (_) {
    return DateFormat('EEEE, d MMMM', 'en').format(local);
  }
}

/// Delay until the next minute boundary, so a clock refreshes exactly when the minute changes.
Duration untilNextMinute(DateTime now) {
  final next = DateTime(now.year, now.month, now.day, now.hour, now.minute).add(const Duration(minutes: 1));
  return next.difference(now);
}

/// "29 Oct 2026" in the given zone (digits stay Latin; month names in English for now).
String formatLocalDate(DateTime instant, String zone) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final l = inZone(instant, zone);
  return '${l.day} ${months[l.month - 1]} ${l.year}';
}
