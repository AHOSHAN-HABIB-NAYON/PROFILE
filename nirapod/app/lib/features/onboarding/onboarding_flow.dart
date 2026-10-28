import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/prefs/prefs.dart';
import '../../core/session/session.dart';

/// Pure navigation rules for the start of the app. Everything here is a plain function of its inputs
/// so it can be unit-tested without widgets (test/onboarding/flow_test.dart).

/// The three permission pages before login, in order. Index + 1 is what [PrefKeys.onboardingStep]
/// stores once that page is finished ("Continue" or "Not now").
const permissionPages = ['perm_notifications', 'perm_how_location', 'perm_location'];

/// Login page for the role picked on "Who are you?". The choice only selects the UI; the server
/// decides the real role from the account.
String loginScreenFor(RoleChoice? role) => switch (role) {
      RoleChoice.parent || null => 'login_parent',
      RoleChoice.probashi => 'login_probashi',
      RoleChoice.member => 'login_member',
      RoleChoice.child => 'child_code',
    };

/// Splash decision (spec Phase 1 item 1):
/// valid session -> Home (Child home for a child; Profile setup first if it is still needed);
/// else permission onboarding finished on this device -> the remembered login page (no role yet -> role);
/// else -> Welcome.
String splashDestination({required SessionState session, required bool onboardingDone, required RoleChoice? role}) {
  if (session is SignedIn) {
    if (session.user.isChild) return 'child_home';
    if (session.needsProfileSetup) return 'profile_setup';
    return 'home';
  }
  if (onboardingDone) return role == null ? 'role' : loginScreenFor(role);
  return 'welcome';
}

/// Where "Get Started" continues: the first permission page not yet finished, or "Who are you?".
String resumeScreenFor(int completedSteps) =>
    completedSteps >= permissionPages.length ? 'role' : permissionPages[completedSteps.clamp(0, permissionPages.length - 1)];

/// Device-local onboarding progress (SharedPreferences).
class OnboardingProgress {
  OnboardingProgress(this._ref);
  final Ref _ref;

  int get completedSteps => _ref.read(prefsProvider).getInt(PrefKeys.onboardingStep) ?? 0;
  bool get done => _ref.read(prefsProvider).getBool(PrefKeys.onboardingDone) ?? false;
  RoleChoice? get role => roleChoiceFromName(_ref.read(prefsProvider).getString(PrefKeys.roleChoice));

  String get resumeScreen => resumeScreenFor(completedSteps);

  /// Marks permission page [pageId] as finished. Steps only move forward.
  Future<void> completePage(String pageId) async {
    final index = permissionPages.indexOf(pageId);
    if (index < 0) return;
    final next = index + 1;
    if (next > completedSteps) await _ref.read(prefsProvider).setInt(PrefKeys.onboardingStep, next);
  }

  /// Saves the role choice and marks permission onboarding finished on this device.
  Future<void> chooseRole(RoleChoice role) async {
    final prefs = _ref.read(prefsProvider);
    await prefs.setString(PrefKeys.roleChoice, role.name);
    await prefs.setBool(PrefKeys.onboardingDone, true);
  }

  /// "Already have an account? Log in" also ends the onboarding on this device.
  Future<void> finish() => _ref.read(prefsProvider).setBool(PrefKeys.onboardingDone, true);
}

final onboardingProgressProvider = Provider<OnboardingProgress>(OnboardingProgress.new);
