import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../splash/splash_screen.dart';
import 'screens/child_screens.dart';
import 'screens/permission_screens.dart';
import 'screens/role_screen.dart';
import 'screens/welcome_screen.dart';

/// Screens owned by the onboarding feature, keyed by screen id from docs/CONTRACTS/navigation.json.
/// Ids: splash, welcome, perm_notifications, perm_how_location, perm_location, role,
/// child_perm_background, child_perm_battery, child_consent, child_all_set.
final onboardingScreens = <String, Widget Function(GoRouterState state)>{
  'splash': (_) => const SplashScreen(),
  'welcome': (_) => const WelcomeScreen(),
  'perm_notifications': (_) => const PermNotificationsScreen(),
  'perm_how_location': (_) => const PermHowLocationScreen(),
  'perm_location': (_) => const PermLocationScreen(),
  'role': (_) => const RoleScreen(),
  'child_perm_background': (_) => const ChildBackgroundScreen(),
  'child_perm_battery': (_) => const ChildBatteryScreen(),
  'child_consent': (_) => const ChildConsentScreen(),
  'child_all_set': (_) => const ChildAllSetScreen(),
};
