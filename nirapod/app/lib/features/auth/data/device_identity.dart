import 'dart:io' show Platform;
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/config/env.dart';

/// Small key-value store for secrets that must survive restarts (Android Keystore backed).
abstract class SecureKv {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureStorageKv implements SecureKv {
  SecureStorageKv([FlutterSecureStorage? s]) : _s = s ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  @override
  Future<String?> read(String key) => _s.read(key: key);
  @override
  Future<void> write(String key, String value) => _s.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _s.delete(key: key);
}

class MemoryKv implements SecureKv {
  final Map<String, String> values = {};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
  @override
  Future<void> delete(String key) async => values.remove(key);
}

final secureKvProvider = Provider<SecureKv>((ref) => SecureStorageKv());

/// Random UUID v4 from a secure random source.
String uuidV4([Random? random]) {
  final r = random ?? Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

/// A random id generated ONCE per install and kept in secure storage. Child sessions are bound to it.
/// It is not derived from any hardware or phone-state identifier.
class DeviceIdentity {
  DeviceIdentity(this._kv);
  final SecureKv _kv;
  static const key = 'nirapod.device_id';
  String? _cached;

  Future<String> deviceId() async {
    if (_cached != null) return _cached!;
    var id = await _kv.read(key);
    if (id == null || id.isEmpty) {
      id = uuidV4();
      await _kv.write(key, id);
    }
    return _cached = id;
  }

  /// DeviceInfo from the OpenAPI contract (no model/manufacturer: no extra plugin, no phone-state access).
  Future<Map<String, dynamic>> deviceInfo() async => {
        'device_id': await deviceId(),
        'os_version': _osVersion(),
        'app_version': Env.appVersion,
      };

  static String _osVersion() {
    try {
      final v = Platform.operatingSystemVersion;
      return v.length > 60 ? v.substring(0, 60) : v;
    } catch (_) {
      return 'unknown';
    }
  }
}

final deviceIdentityProvider = Provider<DeviceIdentity>((ref) => DeviceIdentity(ref.watch(secureKvProvider)));
