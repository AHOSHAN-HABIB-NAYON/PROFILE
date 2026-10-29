import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../core/config/env.dart';
import '../../../core/i18n/locale_controller.dart';
import '../../../core/log/log.dart';
import '../../../core/net/providers.dart';
import '../../../core/prefs/prefs.dart';
import '../../onboarding/data/permission_gateway.dart';
import '../../../core/session/session.dart';
import '../../../core/tracking/tracking_bridge.dart';
import '../../auth/profile/travel_service.dart';

/// Texts for the native notifications, in the selected language ("%s" = a name).
Map<String, String> trackingTexts(Ref ref) {
  final s = ref.read(screenStringsProvider('tracking'));
  return {
    for (final k in ['sharing_title', 'sharing_body', 'channel_sharing', 'channel_requests', 'request_title', 'request_body',
        'channel_sos', 'shake_title', 'shake_body', 'shake_cancel', 'sos_sent_title', 'sos_sent_body', 'sos_failed'])
      k: s.t('tracking.$k'),
  };
}

/// Child devices: once signed in and allowed to use location, get a device upload key and start the
/// native foreground service (visible "Location sharing is on" notification). Adults never run it.
class ChildTracking {
  ChildTracking(this._ref);
  final Ref _ref;
  bool _starting = false;

  Future<bool> ensureStarted() async {
    final s = _ref.read(sessionControllerProvider);
    if (s is! SignedIn || !s.user.isChild || _starting) return false;
    _starting = true;
    try {
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return false;
      final key = (await _ref.read(apiClientProvider).post<Map<String, dynamic>>('/devices/upload-key', data: {}))['upload_key'] as String;
      final deviceId = await _ref.read(deviceIdStoreProvider).get();
      return await _ref.read(trackingBridgeProvider).start(apiBase: Env.apiBaseUrl, uploadKey: key, deviceId: deviceId, texts: trackingTexts(_ref));
    } catch (e) {
      Log.warn('tracking', 'start failed: ${e.runtimeType}');
      return false;
    } finally {
      _starting = false;
    }
  }
}

final childTrackingProvider = Provider<ChildTracking>(ChildTracking.new);

/// App-wide hooks: starts child tracking when a child session appears, and feeds Android's time-zone
/// change broadcast into the travel watcher.
/// Adults who chose "share when the app is closed": the same visible native service as children, started only
/// after an explicit opt-in (with disclosure) and only while their sharing is active. Pausing or stopping
/// sharing ends it (the server also revokes the phone's key).
class AdultBackgroundSharing {
  AdultBackgroundSharing(this._ref);
  final Ref _ref;

  bool get isOn => _ref.read(prefsProvider).getBool(PrefKeys.adultBackground) ?? false;

  /// Asks for "Allow all the time", then starts the service. Returns false if not possible.
  Future<bool> enable() async {
    final gw = _ref.read(permissionGatewayProvider);
    if (!(await gw.request(OnbPermission.locationWhenInUse)).isGranted) return false;
    if (!(await gw.request(OnbPermission.locationAlways)).isGranted) return false;
    final ok = await _start();
    await _ref.read(prefsProvider).setBool(PrefKeys.adultBackground, ok);
    return ok;
  }

  Future<void> disable() async {
    await _ref.read(prefsProvider).setBool(PrefKeys.adultBackground, false);
    await _ref.read(trackingBridgeProvider).stop().catchError((Object _) {});
  }

  /// App start: keep it running if the adult turned it on before.
  Future<void> resumeIfOn() async {
    if (!isOn) return;
    if (!(await _start())) await disable();
  }

  Future<bool> _start() async {
    try {
      final key = (await _ref.read(apiClientProvider).post<Map<String, dynamic>>('/devices/upload-key', data: {}))['upload_key'] as String;
      final deviceId = await _ref.read(deviceIdStoreProvider).get();
      return await _ref.read(trackingBridgeProvider).start(apiBase: Env.apiBaseUrl, uploadKey: key, deviceId: deviceId, texts: trackingTexts(_ref));
    } catch (e) {
      Log.warn('tracking', 'adult start failed: ${e.runtimeType}');
      return false;
    }
  }
}

final adultBackgroundProvider = Provider<AdultBackgroundSharing>(AdultBackgroundSharing.new);

final backgroundHooksProvider = Provider<void>((ref) {
  final s = ref.watch(sessionControllerProvider);
  if (s is SignedIn && s.user.isChild) unawaited(ref.read(childTrackingProvider).ensureStarted());
  if (s is SignedIn && !s.user.isChild) unawaited(ref.read(adultBackgroundProvider).resumeIfOn());
  final sub = ref.read(trackingBridgeProvider).timezoneChanges().listen((_) {
    if (ref.read(sessionControllerProvider) is SignedIn) unawaited(ref.read(travelWatcherProvider).check());
  });
  ref.onDispose(sub.cancel);
});

/// Adults who agreed to share: while the app is open, upload the position at most every 2 minutes
/// (adults never run a background service).
class AdultForegroundSharing {
  AdultForegroundSharing(this._ref);
  final Ref _ref;
  StreamSubscription<Position>? _sub;
  DateTime? _lastSent;

  void start() {
    if (_sub != null) return;
    _sub = Geolocator.getPositionStream(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 50))
        .listen(_onPosition, onError: (_) {});
  }

  Future<void> _onPosition(Position p) async {
    final now = DateTime.now();
    if (_lastSent != null && now.difference(_lastSent!) < const Duration(minutes: 2)) return;
    _lastSent = now;
    try {
      await _ref.read(apiClientProvider).post<dynamic>('/locations', data: {
        'points': [
          {
            'recorded_at': p.timestamp.toUtc().toIso8601String(),
            'lat': p.latitude,
            'lng': p.longitude,
            'accuracy_m': p.accuracy,
            if (p.speed >= 0) 'speed_mps': p.speed.clamp(0, 150),
          },
        ],
      });
    } catch (_) {
      // Not sharing (consent changed) or offline: the next position tries again.
    }
  }

  void stop() {
    _sub?.cancel();
    _sub = null;
  }
}

final adultSharingProvider = Provider<AdultForegroundSharing>((ref) {
  final a = AdultForegroundSharing(ref);
  ref.onDispose(a.stop);
  return a;
});
