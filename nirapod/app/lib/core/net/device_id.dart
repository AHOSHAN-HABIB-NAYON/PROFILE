import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// A random id for this installation (not a hardware id). Sent as `x-device-id`; child sessions are
/// bound to it on the server, and /auth/refresh is rejected from any other device.
abstract class DeviceIdStore {
  Future<String> get();
}

class SecureDeviceIdStore implements DeviceIdStore {
  SecureDeviceIdStore([FlutterSecureStorage? s]) : _s = s ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  static const _key = 'nirapod.device_id';
  String? _cached;

  @override
  Future<String> get() async {
    if (_cached != null) return _cached!;
    var id = await _s.read(key: _key);
    if (id == null || id.isEmpty) {
      id = randomId();
      await _s.write(key: _key, value: id);
    }
    return _cached = id;
  }

  /// 128-bit random id in UUID v4 format.
  static String randomId([Random? random]) {
    final r = random ?? Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }
}

class MemoryDeviceIdStore implements DeviceIdStore {
  MemoryDeviceIdStore([this.id = 'test-device']);
  final String id;
  @override
  Future<String> get() async => id;
}
