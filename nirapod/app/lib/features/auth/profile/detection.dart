import 'dart:ui' show PlatformDispatcher;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/tz/tz_utils.dart';
import 'travel_service.dart';

/// Region of the device locale, e.g. bn_BD -> BD. Never GPS, SIM or phone state.
typedef LocaleRegionReader = String? Function();

String? readLocaleRegion() {
  try {
    final cc = PlatformDispatcher.instance.locale.countryCode;
    return (cc == null || cc.isEmpty) ? null : cc;
  } catch (_) {
    return null;
  }
}

final localeRegionReaderProvider = Provider<LocaleRegionReader>((ref) => readLocaleRegion);

/// Country + zone detection with priority time zone > locale > IP hint > manual (TzData.detect).
/// The IP hint (local GeoIP on our server) is only requested when the first two give nothing.
Future<Detection> detectCountryZone({
  required TzData tz,
  required DeviceZoneReader readZone,
  required LocaleRegionReader readRegion,
  Future<String?> Function()? ipHint,
}) async {
  final zone = await readZone();
  final region = readRegion();
  String? ip;
  if (!tz.isGeographicZone(zone) && !tz.isValidCountry(region) && ipHint != null) {
    try {
      ip = await ipHint().timeout(const Duration(seconds: 4));
    } catch (_) {}
  }
  return tz.detect(deviceZone: zone, localeRegion: region, ipCountryHint: ip);
}
