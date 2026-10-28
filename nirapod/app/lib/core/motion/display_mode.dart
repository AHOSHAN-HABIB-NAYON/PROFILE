import 'package:flutter/foundation.dart';
import 'package:flutter_displaymode/flutter_displaymode.dart';

import '../log/log.dart';

/// Requests the highest refresh rate the display supports (60/90/120/144 Hz) at the current
/// resolution. Android itself drops back to 60 Hz in battery saver, which is the behavior we want.
Future<void> requestHighRefreshRate() async {
  if (defaultTargetPlatform != TargetPlatform.android || kIsWeb) return;
  try {
    await FlutterDisplayMode.setHighRefreshRate();
    final active = await FlutterDisplayMode.active;
    Log.info('display', 'refresh rate ${active.refreshRate.round()} Hz');
  } catch (e) {
    Log.warn('display', 'high refresh rate unavailable: ${e.runtimeType}');
  }
}
