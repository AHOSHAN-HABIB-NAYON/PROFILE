import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Overridden in main() with the loaded instance (and in tests with a mock).
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('prefsProvider not overridden'));

abstract final class PrefKeys {
  static const themeMode = 'theme_mode'; // 'light' | 'dark'
  static const language = 'language';
  static const roleChoice = 'role_choice';
  static const onboardingDone = 'onboarding_done';
  static const onboardingStep = 'onboarding_step';
}
