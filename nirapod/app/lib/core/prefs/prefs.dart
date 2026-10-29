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
  /// Login "Remember me": false = sign out on the next app start. Email is kept only when true.
  static const rememberMe = 'remember_me';
  static const rememberedEmail = 'remembered_email';
  /// Adult opted in to "share when the app is closed" (native service, visible notification).
  static const adultBackground = 'adult_background_sharing';
}
