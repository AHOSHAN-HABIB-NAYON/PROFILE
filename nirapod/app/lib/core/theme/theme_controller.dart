import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../prefs/prefs.dart';

/// Light by default; the user's choice is remembered on the device.
class ThemeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    final saved = ref.read(prefsProvider).getString(PrefKeys.themeMode);
    return saved == 'dark' ? ThemeMode.dark : ThemeMode.light;
  }

  Future<void> set(ThemeMode mode) async {
    state = mode == ThemeMode.dark ? ThemeMode.dark : ThemeMode.light;
    await ref.read(prefsProvider).setString(PrefKeys.themeMode, state == ThemeMode.dark ? 'dark' : 'light');
  }

  Future<void> toggle() => set(state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark);
}

final themeControllerProvider = NotifierProvider<ThemeController, ThemeMode>(ThemeController.new);
