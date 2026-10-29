import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Talks to the native child-device location service (android/.../tracking/TrackingService.kt).
abstract class TrackingBridge {
  Future<bool> start({required String apiBase, required String uploadKey, required String deviceId, required Map<String, String> texts});
  Future<void> stop();
  Future<void> setTrip(DateTime? until);
  Future<bool> requestNow();
  Future<Map<String, Object?>> status();

  /// Family places for this child (Android geofences wake the service for fresh points).
  Future<void> setGeofences(List<({String id, double lat, double lng, int radiusM})> places);

  /// Device time-zone changes (Android ACTION_TIMEZONE_CHANGED).
  Stream<String> timezoneChanges();
}

class MethodChannelTrackingBridge implements TrackingBridge {
  static const _m = MethodChannel('nirapod/tracking');
  static const _tz = EventChannel('nirapod/timezone');

  @override
  Future<bool> start({required String apiBase, required String uploadKey, required String deviceId, required Map<String, String> texts}) async =>
      (await _m.invokeMethod<bool>('start', {'apiBase': apiBase, 'uploadKey': uploadKey, 'deviceId': deviceId, 'texts': texts})) ?? false;

  @override
  Future<void> stop() => _m.invokeMethod<bool>('stop');

  @override
  Future<void> setTrip(DateTime? until) => _m.invokeMethod<bool>('setTrip', {'untilMs': until?.millisecondsSinceEpoch ?? 0});

  @override
  Future<bool> requestNow() async => (await _m.invokeMethod<bool>('requestNow')) ?? false;

  @override
  Future<Map<String, Object?>> status() async =>
      (await _m.invokeMapMethod<String, Object?>('status')) ?? const {};

  @override
  Stream<String> timezoneChanges() => _tz.receiveBroadcastStream().map((e) => '$e');

  @override
  Future<void> setGeofences(List<({String id, double lat, double lng, int radiusM})> places) => _m.invokeMethod<bool>('setGeofences', {
        'json': jsonEncode([
          for (final p in places) {'id': p.id, 'lat': p.lat, 'lng': p.lng, 'radius': p.radiusM},
        ]),
      });
}

/// Tests and non-Android builds use a no-op bridge.
class NoopTrackingBridge implements TrackingBridge {
  final calls = <String>[];
  @override
  Future<bool> start({required String apiBase, required String uploadKey, required String deviceId, required Map<String, String> texts}) async {
    calls.add('start');
    return true;
  }

  @override
  Future<void> stop() async => calls.add('stop');
  @override
  Future<void> setTrip(DateTime? until) async => calls.add('trip');
  @override
  Future<bool> requestNow() async {
    calls.add('requestNow');
    return true;
  }

  @override
  Future<Map<String, Object?>> status() async => const {'enabled': false};
  @override
  Stream<String> timezoneChanges() => const Stream.empty();
  @override
  Future<void> setGeofences(List<({String id, double lat, double lng, int radiusM})> places) async => calls.add('geofences:${places.length}');
}

final trackingBridgeProvider = Provider<TrackingBridge>((ref) => MethodChannelTrackingBridge());
