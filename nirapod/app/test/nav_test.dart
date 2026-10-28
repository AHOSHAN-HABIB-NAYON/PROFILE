import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/app.dart';
import 'package:nirapod/features/auth/routes.dart';
import 'package:nirapod/features/onboarding/routes.dart';
import 'package:nirapod/nav/router.dart';
import 'package:nirapod/nav/routes.g.dart';

import 'helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('routes.g.dart matches docs/CONTRACTS/navigation.json', () {
    final nav = jsonDecode(File('../docs/CONTRACTS/navigation.json').readAsStringSync()) as Map<String, dynamic>;
    final ids = (nav['screens'] as List<dynamic>).map((s) => (s as Map)['id']).toList();
    expect(screens.map((s) => s.id).toList(), ids);
    expect(File('../docs/CONTRACTS/NAVIGATION_MAP.md').existsSync(), isTrue);
  });

  test('language selector appears only in the five specified places', () {
    final withSelector = screens.where((s) => s.languageSelector).map((s) => s.id).toSet();
    expect(withSelector, {
      'welcome', // (a)
      'login_parent', 'login_probashi', 'login_member', 'child_code', // (b)
      'register', 'verify_email', // (c)
      'forgot_email', 'forgot_code', 'forgot_new', 'forgot_done', // (d)
      'home', 'child_home', // (e)
    });
    for (final id in ['perm_notifications', 'perm_how_location', 'perm_location', 'role', 'map', 'history', 'premium', 'settings', 'profile']) {
      expect(withSelector.contains(id), isFalse, reason: id);
    }
  });

  test('adult bottom bar has Home, Map, History, Premium, Settings; child screens have none', () {
    expect(adultTabs, ['home', 'map', 'history', 'premium', 'settings']);
    for (final s in screens.where((s) => s.roles.length == 1 && s.roles.single == 'child')) {
      expect(s.adultShell, isFalse, reason: s.id);
    }
  });

  test('every button has a resolvable destination', () {
    final ids = screens.map((s) => s.id).toSet();
    final overlayIds = overlays.map((o) => o.id).toSet();
    for (final s in screens) {
      for (final b in s.buttons) {
        final to = b.to;
        final ok = to == 'back' || to == 'close' || to.startsWith('system:') || to.startsWith('action:') ||
            ids.contains(to) || ((to.startsWith('sheet:') || to.startsWith('dialog:')) && overlayIds.contains(to.split(':')[1]));
        expect(ok, isTrue, reason: '${s.id}: ${b.label} -> $to');
      }
    }
  });

  testWidgets('app boots: splash -> welcome after 600 ms', (t) async {
    await t.pumpWidget(ProviderScope(overrides: await overrides(), child: const NirapodApp()));
    await t.pump();
    expect(find.bySemanticsLabel('Nirapod'), findsOneWidget);
    await t.pump(const Duration(milliseconds: 650));
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('Get Started'), findsOneWidget);
  });

  testWidgets('every screen path can be opened', (t) async {
    final router = createRouter(initialLocation: '/welcome');
    await t.pumpWidget(ProviderScope(
      overrides: [...await overrides(), routerProvider.overrideWithValue(router)],
      child: const NirapodApp(),
    ));
    for (final s in screens.where((s) => s.id != 'splash')) {
      router.go(locationFor(s.id));
      // Real screens have looping demos: pump past the page transition instead of pumpAndSettle.
      await t.pump();
      await t.pump(const Duration(milliseconds: 600));
      expect(t.takeException(), isNull, reason: s.id);
      final registered = onboardingScreens.containsKey(s.id) || authScreens.containsKey(s.id);
      if (!registered) expect(find.text(s.title), findsWidgets, reason: s.id);
    }
  });

  testWidgets('adult tabs switch via the bottom bar', (t) async {
    final router = createRouter(initialLocation: '/home');
    await t.pumpWidget(ProviderScope(
      overrides: [...await overrides(), routerProvider.overrideWithValue(router)],
      child: const NirapodApp(),
    ));
    await t.pumpAndSettle();
    await t.tap(find.text('Premium').last);
    await t.pumpAndSettle();
    expect(router.routerDelegate.currentConfiguration.uri.path, '/premium');
  });

  testWidgets('theme choice is remembered; Arabic is RTL', (t) async {
    await t.pumpWidget(ProviderScope(
      overrides: await overrides(prefs: {'theme_mode': 'dark', 'language': 'ar'}),
      child: const NirapodApp(),
    ));
    await t.pump(const Duration(milliseconds: 700));
    await t.pumpAndSettle();
    final ctx = t.element(find.byType(Scaffold).first);
    expect(Theme.of(ctx).brightness, Brightness.dark);
    expect(Directionality.of(ctx), TextDirection.rtl);
  });
}
