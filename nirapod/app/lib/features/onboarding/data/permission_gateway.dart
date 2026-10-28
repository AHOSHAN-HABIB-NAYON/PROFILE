import 'dart:io' show Platform;

import 'package:android_intent_plus/android_intent.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';

/// Runtime permissions the onboarding asks for. Only items from the spec's PERMISSIONS list.
enum OnbPermission { notification, locationWhenInUse, locationAlways }

enum PermResult { granted, denied, permanentlyDenied }

extension PermResultX on PermResult {
  bool get isGranted => this == PermResult.granted;
}

/// Wraps permission_handler and the settings intents so screens can be tested with a fake.
/// Implementations must never throw.
abstract class PermissionGateway {
  Future<PermResult> status(OnbPermission p);

  /// Shows the REAL system dialog (or, for "all the time" on Android 11+, the system settings page).
  Future<PermResult> request(OnbPermission p);

  /// App settings page (permission denied -> "Open Settings").
  Future<void> openSettings();

  /// System battery-optimization list via intent. Never uses REQUEST_IGNORE_BATTERY_OPTIMIZATIONS.
  Future<void> openBatterySettings();

  /// Phone brand when it can be read without extra permissions or plugins; null otherwise.
  Future<String?> deviceManufacturer();
}

class PermissionHandlerGateway implements PermissionGateway {
  const PermissionHandlerGateway();

  static Permission _map(OnbPermission p) => switch (p) {
        OnbPermission.notification => Permission.notification,
        OnbPermission.locationWhenInUse => Permission.locationWhenInUse,
        OnbPermission.locationAlways => Permission.locationAlways,
      };

  static PermResult _from(PermissionStatus s) {
    if (s.isGranted || s.isLimited || s.isProvisional) return PermResult.granted;
    if (s.isPermanentlyDenied || s.isRestricted) return PermResult.permanentlyDenied;
    return PermResult.denied;
  }

  @override
  Future<PermResult> status(OnbPermission p) async {
    try {
      return _from(await _map(p).status);
    } catch (_) {
      return PermResult.denied;
    }
  }

  @override
  Future<PermResult> request(OnbPermission p) async {
    try {
      return _from(await _map(p).request());
    } catch (_) {
      return PermResult.denied;
    }
  }

  @override
  Future<void> openSettings() async {
    try {
      await openAppSettings();
    } catch (_) {}
  }

  @override
  Future<void> openBatterySettings() async {
    try {
      if (!Platform.isAndroid) return;
      await const AndroidIntent(action: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').launch();
    } catch (_) {
      await openSettings();
    }
  }

  /// No device-info plugin is bundled (no new plugins in Phase 1), so the brand is not known: the
  /// battery page preselects "Others" and the child picks their brand.
  @override
  Future<String?> deviceManufacturer() async => null;
}

final permissionGatewayProvider = Provider<PermissionGateway>((ref) => const PermissionHandlerGateway());
