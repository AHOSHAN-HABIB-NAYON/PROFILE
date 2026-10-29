import 'package:nirapod/features/premium/billing.dart';
import 'package:nirapod/core/push/push_service.dart';
import 'package:nirapod/features/auth/legal/legal_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nirapod/core/i18n/locale_controller.dart';
import 'package:nirapod/core/i18n/strings.dart';
import 'package:nirapod/core/prefs/prefs.dart';
import 'package:nirapod/core/theme/app_theme.dart';
import 'package:nirapod/core/tz/tz_provider.dart';
import 'package:nirapod/core/tz/tz_utils.dart';
import 'package:nirapod/features/map/family_map.dart';
import 'package:nirapod/core/tracking/tracking_bridge.dart';
import 'package:shared_preferences/shared_preferences.dart';

StringsBundle? _strings;
TzData? _tz;

Future<StringsBundle> loadStrings() async => _strings ??= await StringsBundle.load(rootBundle);
Future<TzData> loadTz() async => _tz ??= await TzData.load(rootBundle);

Future<List<Override>> overrides({Map<String, Object> prefs = const {}, bool legalView = true}) async {
  SharedPreferences.setMockInitialValues(prefs);
  await initializeDateFormatting();
  return [
    prefsProvider.overrideWithValue(await SharedPreferences.getInstance()),
    stringsBundleProvider.overrideWithValue(await loadStrings()),
    tzDataProvider.overrideWithValue(await loadTz()),
    // Platform views (Google Maps) do not run in widget tests.
    trackingBridgeProvider.overrideWithValue(NoopTrackingBridge()),
    pushServiceProvider.overrideWithValue(NoopPushService()),
    playBillingProvider.overrideWithValue(NoopPlayBilling()),
    familyMapBuilderProvider.overrideWithValue((data, onReady, onPinTap) => const ColoredBox(color: Color(0xFFDDE7E3))),
    if (legalView) legalViewProvider.overrideWithValue((uri) => const SizedBox(key: Key('legal_view'))),
  ];
}

/// Sets a logical screen size (dp) for layout checks: 320x640, 360x800, 412x915.
void setScreen(WidgetTester t, Size dp) {
  t.view.devicePixelRatio = 2.0;
  t.view.physicalSize = dp * 2.0;
  addTearDown(t.view.reset);
}

/// Wraps a widget in a themed MaterialApp with text scale and direction.
Widget harness(
  Widget child, {
  Brightness brightness = Brightness.light,
  double textScale = 1.0,
  TextDirection direction = TextDirection.ltr,
  String script = 'latin',
  bool reduceMotion = false,
}) {
  return MaterialApp(
    theme: buildTheme(brightness: brightness, script: script),
    home: Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale), disableAnimations: reduceMotion),
        child: Directionality(textDirection: direction, child: Scaffold(body: child)),
      ),
    ),
  );
}

const screenSizes = [Size(320, 640), Size(360, 800), Size(412, 915)];
