import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/i18n/locale_controller.dart';
import 'core/i18n/strings.dart';
import 'core/motion/display_mode.dart';
import 'core/prefs/prefs.dart';
import 'core/tz/tz_provider.dart';
import 'core/tz/tz_utils.dart';
import 'features/auth/routes.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  installAuthFeature();
  final results = await Future.wait<Object>([
    SharedPreferences.getInstance(),
    StringsBundle.load(rootBundle),
    TzData.load(rootBundle),
    initializeDateFormatting().then((_) => true),
  ]);
  // Highest supported refresh rate (60/90/120/144 Hz); Android falls back to 60 Hz in battery saver.
  unawaited(requestHighRefreshRate());
  runApp(ProviderScope(
    overrides: [
      prefsProvider.overrideWithValue(results[0] as SharedPreferences),
      stringsBundleProvider.overrideWithValue(results[1] as StringsBundle),
      tzDataProvider.overrideWithValue(results[2] as TzData),
    ],
    child: const NirapodApp(),
  ));
}
