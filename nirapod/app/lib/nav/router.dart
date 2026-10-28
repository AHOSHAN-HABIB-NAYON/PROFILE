import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/motion/motion.dart';
import '../features/auth/routes.dart';
import '../features/onboarding/routes.dart';
import '../features/splash/splash_screen.dart';
import 'adult_shell.dart';
import 'nav_types.dart';
import 'placeholder_screen.dart';
import 'routes.g.dart';

ScreenSpec screenById(String id) => screens.firstWhere((s) => s.id == id);
OverlaySpec overlayById(String id) => overlays.firstWhere((o) => o.id == id);

/// Concrete path for a screen (fills `:id` params with a demo value in the skeleton).
String locationFor(String id, {String param = 'demo'}) => screenById(id).path.replaceAll(RegExp(r':\w+'), param);

/// Builds a screen by id. Each feature registers its screens in its own routes.dart map;
/// anything not registered yet is a walkable placeholder.
Widget buildScreen(String id, GoRouterState state) {
  final builder = onboardingScreens[id] ?? authScreens[id];
  if (builder != null) return builder(state);
  if (id == 'splash') return const SplashScreen();
  return PlaceholderScreen(spec: screenById(id));
}

CustomTransitionPage<void> _page(String id, GoRouterState state) => CustomTransitionPage<void>(
      key: state.pageKey,
      transitionDuration: Motion.page,
      reverseTransitionDuration: Motion.page,
      child: buildScreen(id, state),
      // Fade-through (240 ms). Reduced motion: MaterialApp already shortens via MediaQuery.
      transitionsBuilder: (context, animation, secondary, child) => FadeTransition(
        opacity: CurvedAnimation(parent: animation, curve: Motion.decelerate),
        child: FadeTransition(opacity: ReverseAnimation(CurvedAnimation(parent: secondary, curve: Motion.decelerate)), child: child),
      ),
    );

GoRouter createRouter({String initialLocation = '/'}) {
  final tabSpecs = adultTabs.map(screenById).toList();
  final others = screens.where((s) => !s.adultShell);
  return GoRouter(
    initialLocation: initialLocation,
    routes: [
      for (final s in others) GoRoute(path: s.path, name: s.id, pageBuilder: (c, st) => _page(s.id, st)),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AdultShell(shell: shell),
        branches: [
          for (final t in tabSpecs)
            StatefulShellBranch(routes: [GoRoute(path: t.path, name: t.id, pageBuilder: (c, st) => _page(t.id, st))]),
        ],
      ),
    ],
  );
}
