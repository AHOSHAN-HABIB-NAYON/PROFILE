import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/permission_gateway.dart';

/// Shared behaviour of a page that asks for one runtime permission:
/// - "Continue" shows the REAL system dialog immediately.
/// - Denied (or permanently denied): the page shows the friendly panel with "Open Settings";
///   the primary button then only moves on (we never nag with the dialog again).
/// - Coming back from Settings re-checks the status.
abstract class PermissionStepState<W extends ConsumerStatefulWidget> extends ConsumerState<W> with WidgetsBindingObserver {
  PermResult? status;
  bool asked = false;
  bool busy = false;

  OnbPermission get permission;

  /// Moves to the next page (called after the dialog, or by "Not now").
  Future<void> advance();

  PermissionGateway get gateway => ref.read(permissionGatewayProvider);

  bool get granted => status?.isGranted ?? false;
  bool get showDenied => asked && !granted;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(refresh());
  }

  Future<void> refresh() async {
    final s = await gateway.status(permission);
    if (mounted) setState(() => status = s);
  }

  /// Primary action. Returns the result of the dialog (or null if it only moved on).
  Future<PermResult?> onContinue() async {
    if (busy) return null;
    if (showDenied) {
      await advance();
      return null;
    }
    setState(() => busy = true);
    final r = await request();
    if (!mounted) return r;
    setState(() {
      busy = false;
      asked = true;
      status = r;
    });
    if (r.isGranted) await advance();
    return r;
  }

  /// The permission request itself; pages with a two-step request override this.
  Future<PermResult> request() => gateway.request(permission);

  Future<void> openSettings() => gateway.openSettings();
}
