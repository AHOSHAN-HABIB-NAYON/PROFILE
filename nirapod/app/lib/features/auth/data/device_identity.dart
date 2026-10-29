import 'dart:io' show Platform;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/net/device_id.dart';
import '../../../core/net/providers.dart';

/// Builds the DeviceInfo body (OpenAPI DeviceInfo) for login / verify / Google / child join.
/// The id comes from the core [DeviceIdStore] (also sent as `x-device-id`), so child sessions are
/// bound to the same id the API client uses. No hardware or phone-state identifiers.
class DeviceIdentity {
  DeviceIdentity(this._ids);
  final DeviceIdStore _ids;

  Future<String> deviceId() => _ids.get();

  Future<Map<String, dynamic>> deviceInfo() async => {
        'device_id': await _ids.get(),
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

final deviceIdentityProvider = Provider<DeviceIdentity>((ref) => DeviceIdentity(ref.watch(deviceIdStoreProvider)));
