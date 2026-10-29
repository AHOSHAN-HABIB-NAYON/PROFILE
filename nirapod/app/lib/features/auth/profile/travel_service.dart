import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';

import '../../../core/log/log.dart';
import '../../../core/prefs/prefs.dart';
import '../../../core/session/session.dart';
import '../../../core/tz/tz_provider.dart';
import '../../../core/tz/tz_utils.dart';
import 'profile_repo.dart';

/// Reads the device's IANA zone. Never GPS, SIM or phone state.
typedef DeviceZoneReader = Future<String?> Function();

Future<String?> readDeviceZone() async {
  try {
    return (await FlutterTimezone.getLocalTimezone()).identifier;
  } catch (_) {
    return null;
  }
}

final deviceZoneReaderProvider = Provider<DeviceZoneReader>((ref) => readDeviceZone);

/// Outcome of comparing the device zone with the saved profile.
class TravelDecision {
  const TravelDecision({this.newZone, this.promptCountry, this.recordDeviceZone});

  /// Save this zone silently (clock and greeting stay right).
  final String? newZone;

  /// Ask "It looks like you're in `Country` now. Update?" for this ISO2 country.
  final String? promptCountry;

  /// Remember this as the last real device zone.
  final String? recordDeviceZone;

  bool get isNone => newZone == null && promptCountry == null;
}

/// Pure travel rule (spec: "Update automatically when I travel" + EDGE CASES):
/// - tz_auto OFF: do nothing (only remember the device zone so turning it on later does not fire).
/// - Only a REAL device change counts: a manual zone choice while auto is ON wins until the device zone
///   changes again.
/// - On a change: save the new zone silently; if the country would change, prompt (non-blocking).
TravelDecision decideTravel({
  required TzData tz,
  required bool tzAuto,
  required String? savedZone,
  required String? savedCountry,
  required String? lastDeviceZone,
  required String? deviceZone,
}) {
  if (!tz.isGeographicZone(deviceZone)) return const TravelDecision();
  final device = deviceZone!;
  if (!tzAuto) return TravelDecision(recordDeviceZone: device);
  if (lastDeviceZone == null || lastDeviceZone == device) return TravelDecision(recordDeviceZone: device);
  final newZone = device == savedZone ? null : device;
  final country = tz.countryForZone(device);
  final prompt = (country != null && country != savedCountry) ? country : null;
  return TravelDecision(newZone: newZone, promptCountry: prompt, recordDeviceZone: device);
}

/// Shows the travel prompt; returns true for "Update".
typedef TravelPrompter = Future<bool> Function(String countryIso2);

/// Watches for time zone changes while signed in: on every app resume and every few minutes in the
/// foreground (Flutter has no zone-change stream; the native broadcast hook can call [check] later).
class TravelWatcher {
  TravelWatcher(this._ref, {DeviceZoneReader? reader, this.prompter, this.interval = const Duration(minutes: 5)})
      : _reader = reader; // ignore: prefer_initializing_formals
  final Ref _ref;
  final DeviceZoneReader? _reader;
  TravelPrompter? prompter;
  final Duration interval;

  static const lastDeviceZoneKey = 'auth_tz_last_device_zone';

  AppLifecycleListener? _life;
  Timer? _timer;
  bool _checking = false;

  bool get running => _life != null;

  void start() {
    if (_life != null) return;
    _life = AppLifecycleListener(onResume: () {
      unawaited(check());
      unawaited(_ref.read(profileRepoProvider).sync());
    });
    _timer = Timer.periodic(interval, (_) => unawaited(check()));
    unawaited(check());
  }

  void stop() {
    _life?.dispose();
    _life = null;
    _timer?.cancel();
    _timer = null;
  }

  DeviceZoneReader get _read => _reader ?? _ref.read(deviceZoneReaderProvider);

  String? get lastDeviceZone => _ref.read(prefsProvider).getString(lastDeviceZoneKey);

  Future<void> rememberDeviceZone(String? zone) async {
    if (zone == null) return;
    await _ref.read(prefsProvider).setString(lastDeviceZoneKey, zone);
  }

  /// Called after the user picks a zone by hand: the choice wins until the device zone really changes.
  Future<void> noteManualChoice() async => rememberDeviceZone(await _read());

  Future<TravelDecision> check() async {
    if (_checking) return const TravelDecision();
    _checking = true;
    try {
      final s = _ref.read(sessionControllerProvider);
      if (s is! SignedIn || s.user.isChild || s.needsProfileSetup) return const TravelDecision();
      final user = s.user;
      final d = decideTravel(
        tz: _ref.read(tzDataProvider),
        tzAuto: user.tzAuto,
        savedZone: user.timezone,
        savedCountry: user.countryIso2,
        lastDeviceZone: lastDeviceZone,
        deviceZone: await _read(),
      );
      await rememberDeviceZone(d.recordDeviceZone);
      final repo = _ref.read(profileRepoProvider);
      if (d.newZone != null) {
        await repo.save({'timezone': d.newZone, 'detected_source': 'timezone'});
      }
      final p = prompter;
      if (d.promptCountry != null && p != null) {
        final country = d.promptCountry!;
        unawaited(() async {
          if (await p(country)) {
            await repo.save({'country_iso2': country, 'detected_source': 'timezone'});
          }
        }());
      }
      return d;
    } catch (e) {
      Log.warn('travel', 'check failed: ${e.runtimeType}');
      return const TravelDecision();
    } finally {
      _checking = false;
    }
  }
}

final travelWatcherProvider = Provider<TravelWatcher>((ref) {
  final w = TravelWatcher(ref);
  ref.onDispose(w.stop);
  return w;
});
