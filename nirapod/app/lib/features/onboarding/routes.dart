import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Screens owned by the onboarding feature, keyed by screen id from docs/CONTRACTS/navigation.json.
/// Ids: splash, welcome, perm_notifications, perm_how_location, perm_location, role,
/// child_perm_background, child_perm_battery, child_consent, child_all_set.
final onboardingScreens = <String, Widget Function(GoRouterState state)>{};
