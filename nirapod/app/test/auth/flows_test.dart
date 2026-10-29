import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nirapod/core/i18n/strings.dart';
import 'package:nirapod/core/session/session.dart';
import 'package:nirapod/features/auth/data/auth_api.dart';
import 'package:nirapod/features/auth/data/auth_flow.dart';
import 'package:nirapod/features/auth/data/auth_service.dart';
import 'package:nirapod/features/auth/profile/pickers.dart';

import '../helpers.dart' show loadStrings, screenSizes;
import 'auth_helpers.dart';

void main() {
  late StringsBundle b;
  setUpAll(() async => b = await loadStrings());
  Strings s(String screen) => b.forScreen(screen, 'en');

  /// Seeds flow state / session before the screen is shown.
  Future<ProviderContainer> containerOf(WidgetTester t) async =>
      ProviderScope.containerOf(t.element(find.byType(MaterialApp)));

  group('verify email', () {
    testWidgets('six cells (paste), wrong code shows tries left, success -> profile setup', (t) async {
      var attempt = 0;
      final (env, o) = await authOverrides(handler: (r) {
        if (r.path == '/auth/verify-email') {
          attempt++;
          return attempt == 1 ? (400, apiErr('CODE_INVALID', {'attempts_left': 4})) : (200, sessionJson(name: null));
        }
        return (202, null);
      });
      final router = await pumpApp(t, o, 'login_parent');
      final c = await containerOf(t);
      c.read(authFlowProvider.notifier).setVerifyEmail('mina@example.com');
      router.go('/register/verify');
      await settle(t);
      expect(find.textContaining('mina@example.com'), findsOneWidget);
      await enterCode(t, '12 34 56');
      await settle(t, steps: 3);
      expect(find.text('That code is not right. 4 tries left.'), findsOneWidget);
      await enterCode(t, '654321');
      await settle(t);
      expect(env.api.bodyOf('POST /auth/verify-email'), isA<Map<String, dynamic>>().having((m) => m['code'], 'code', '654321'));
      await settle(t, steps: 12);
      expect(pathOf(router), '/profile-setup');
    });

    testWidgets('locked and expired states', (t) async {
      final (_, o) = await authOverrides(handler: (r) => (423, apiErr('AUTH_LOCKED')));
      final router = await pumpApp(t, o, 'login_parent');
      (await containerOf(t)).read(authFlowProvider.notifier).setVerifyEmail('mina@example.com');
      router.go('/register/verify');
      await settle(t, steps: 5);
      await enterCode(t, '123456');
      await settle(t, steps: 3);
      expect(find.text(s('verify_email').t('verify.err_locked')), findsOneWidget);
      final cells = t.widgetList<TextField>(find.byType(TextField));
      expect(cells.every((f) => f.enabled == false), isTrue);
    });

    testWidgets('resend unlocks after 30 s, then counts down again; 5 per hour', (t) async {
      final (env, o) = await authOverrides(handler: (r) => (202, null));
      final router = await pumpApp(t, o, 'login_parent');
      (await containerOf(t)).read(authFlowProvider.notifier).setVerifyEmail('mina@example.com');
      router.go('/register/verify');
      await settle(t, steps: 5);
      expect(find.text('Resend code in 30 s'), findsOneWidget);
      await t.pump(const Duration(seconds: 10));
      expect(find.text('Resend code in 20 s'), findsOneWidget);
      await t.pump(const Duration(seconds: 20));
      await t.pump();
      expect(find.text('Resend code'), findsOneWidget);
      await tapLabel(t, 'Resend code');
      await settle(t, steps: 3);
      expect(env.api.bodyOf('POST /auth/resend-code'), {'email': 'mina@example.com', 'purpose': 'verify_email'});
      expect(find.text('A new code is on its way.'), findsOneWidget);
      expect(find.text('Resend code in 30 s'), findsOneWidget);
      for (var i = 0; i < 3; i++) {
        await t.pump(const Duration(seconds: 31));
        await tapLabel(t, 'Resend code');
        await settle(t, steps: 3);
      }
      await t.pump(const Duration(seconds: 31));
      await tapLabel(t, 'Resend code');
      await settle(t, steps: 3);
      expect(find.text(s('verify_email').t('verify.err_resend_limit')), findsOneWidget);
      expect(env.api.paths.where((p) => p == 'POST /auth/resend-code').length, 4, reason: 'first send + 4 resends = 5 per hour');
    });

    testWidgets('change email goes back to register', (t) async {
      final (_, o) = await authOverrides();
      final router = await pumpApp(t, o, 'verify_email');
      await tapLabel(t, 'Change email');
      await t.pumpAndSettle();
      expect(pathOf(router), '/register');
    });
  });

  group('forgot password', () {
    for (final reply in [(202, null), (404, apiErr('NOT_FOUND'))]) {
      testWidgets('always the same reply (no enumeration): server ${reply.$1}', (t) async {
        final (env, o) = await authOverrides(handler: (r) => reply);
        final router = await pumpApp(t, o, 'forgot_email');
        await enterField(t, 'Email address', 'who@example.com');
        await tapLabel(t, 'Send code');
        await t.pumpAndSettle();
        expect(pathOf(router), '/forgot/code');
        expect(find.text('If this email exists, we sent a code.'), findsOneWidget);
        expect(env.api.bodyOf('POST /auth/forgot'), {'email': 'who@example.com'});
      });
    }

    testWidgets('code -> new password (same rules) -> done -> back to the remembered login page', (t) async {
      final (env, o) = await authOverrides(handler: (r) => (r.path == '/auth/reset') ? (204, null) : (202, null), prefs: {'role_choice': 'probashi'});
      final router = await pumpApp(t, o, 'forgot_email');
      await enterField(t, 'Email address', 'mina@example.com');
      await tapLabel(t, 'Send code');
      await t.pumpAndSettle();
      await enterCode(t, '246810');
      await t.pumpAndSettle();
      expect(pathOf(router), '/forgot/new-password');
      await enterField(t, 'New password', 'password1');
      await tapLabel(t, 'Save password');
      await t.pump();
      expect(env.api.paths, isNot(contains('POST /auth/reset')));
      await enterField(t, 'New password', 'river7lantern');
      await enterField(t, 'Confirm password', 'river7lantern');
      await tapLabel(t, 'Save password');
      await t.pumpAndSettle();
      expect(env.api.bodyOf('POST /auth/reset'), {'email': 'mina@example.com', 'code': '246810', 'new_password': 'river7lantern'});
      expect(pathOf(router), '/forgot/done');
      await tapLabel(t, 'Back to log in');
      await t.pumpAndSettle();
      expect(pathOf(router), '/login/probashi');
    });

    testWidgets('wrong code at the last step offers to enter it again', (t) async {
      final (_, o) = await authOverrides(handler: (r) => (r.path == '/auth/reset') ? (400, apiErr('CODE_INVALID')) : (202, null));
      final router = await pumpApp(t, o, 'forgot_email');
      await enterField(t, 'Email address', 'mina@example.com');
      await tapLabel(t, 'Send code');
      await t.pumpAndSettle();
      await enterCode(t, '111111');
      await t.pumpAndSettle();
      await enterField(t, 'New password', 'river7lantern');
      await enterField(t, 'Confirm password', 'river7lantern');
      await tapLabel(t, 'Save password');
      await t.pumpAndSettle();
      expect(find.text(s('forgot').t('forgot.err_code')), findsOneWidget);
      await tapLabel(t, 'Enter the code again');
      await t.pumpAndSettle();
      expect(pathOf(router), '/forgot/code');
    });
  });

  group('child code', () {
    testWidgets('alphanumeric cells normalise, name required, detected zone sent silently', (t) async {
      final (env, o) = await authOverrides(handler: (r) => (200, sessionJson(name: 'Rafi', role: 'child', provider: 'device')));
      env.deviceZone = 'Asia/Riyadh';
      final router = await pumpApp(t, o, 'child_code');
      await enterCode(t, 'k7q-2mx');
      final cells = t.widgetList<TextField>(find.byType(TextField)).take(6).map((f) => f.controller!.text).join();
      expect(cells, 'K7Q2MX');
      await tapLabel(t, 'Join my family');
      await t.pump();
      expect(find.text(s('child_code').t('child.err_name')), findsOneWidget);
      expect(env.api.calls, isEmpty);
      await enterField(t, 'Your first name', 'Rafi');
      await tapLabel(t, 'Join my family');
      await settle(t);
      final body = env.api.bodyOf('POST /auth/child')! as Map;
      expect(body['code'], 'K7Q2MX');
      expect(body['first_name'], 'Rafi');
      expect(body['timezone'], 'Asia/Riyadh');
      expect(body['country_iso2'], 'SA');
      expect((body['device'] as Map)['device_id'], 'device-test-1');
      expect(body.containsKey('email'), isFalse);
      expect(pathOf(router), '/child/onboarding/background');
    });

    testWidgets('expired code message', (t) async {
      final (_, o) = await authOverrides(handler: (r) => (410, apiErr('CODE_EXPIRED')));
      await pumpApp(t, o, 'child_code');
      await enterCode(t, 'K7Q2MX');
      await enterField(t, 'Your first name', 'Rafi');
      await tapLabel(t, 'Join my family');
      await settle(t);
      expect(find.text(s('child_code').t('child.err_expired')), findsOneWidget);
    });
  });

  group('profile setup', () {
    Future<(TestEnv, GoRouter)> open(WidgetTester t, Handler h, {String role = 'parent', Map<String, Object> prefs = const {}, Size size = const Size(412, 915), double scale = 1}) async {
      final (env, o) = await authOverrides(handler: h, prefs: {'role_choice': role, ...prefs});
      final router = await pumpApp(t, o, 'welcome', size: size, textScale: scale);
      final c = await containerOf(t);
      final noCountry = {...sessionJson(name: null), 'user': {...meJson(name: null), 'country_iso2': null, 'timezone': null}};
      await c.read(authServiceProvider).completeSession(AuthSession.fromJson(noCountry));
      router.go('/profile-setup');
      await settle(t);
      return (env, router);
    }

    Map<String, dynamic> echo(dynamic r) => {...meJson(), ...((r.data as Map?) ?? {}).cast<String, dynamic>()};

    testWidgets('detects country + zone, validates the name, saves, parent creates family -> child code', (t) async {
      final (env, router) = await open(t, (r) {
        if (r.path == '/me/profile') return (200, echo(r));
        if (r.path == '/families') return (201, {'id': 'f1'});
        if (r.path == '/families/f1/child-code') return (201, {'code': 'K7Q2MX', 'expires_at': DateTime.now().add(const Duration(hours: 24)).toUtc().toIso8601String(), 'join_url': 'https://nirapod.app/join?code=K7Q2MX'});
        return (404, apiErr('NOT_FOUND'));
      });
      expect(find.text('Bangladesh'), findsOneWidget);
      expect(find.text('Detected automatically'), findsOneWidget);
      expect(find.text('Dhaka'), findsOneWidget);
      await tapLabel(t, 'Continue');
      await t.pump();
      expect(find.text(s('profile_setup').t('profile.err_name')), findsOneWidget);
      await enterField(t, 'Full name', '  Mina \u{1F338} Rahman ');
      await tapLabel(t, 'Continue');
      await settle(t);
      final patch = env.api.bodyOf('PATCH /me/profile')! as Map;
      expect(patch['name'], 'Mina \u{1F338} Rahman');
      expect(patch['country_iso2'], 'BD');
      expect(patch['timezone'], 'Asia/Dhaka');
      expect(patch['tz_auto'], true);
      expect(patch['detected_source'], 'timezone');
      expect(env.api.paths, contains('POST /families'));
      await settle(t);
      expect(pathOf(router), '/family/child-code');
      expect(find.text('K7Q 2MX'), findsOneWidget);
      expect(find.text('Expires in 24 h · single use'), findsOneWidget);
    });

    testWidgets('probashi sees create / join + gift line; join with invite -> home', (t) async {
      final (env, router) = await open(t, (r) {
        if (r.path == '/me/profile') return (200, echo(r));
        if (r.path == '/invites/accept') return (200, {});
        if (r.path == '/me') return (200, meJson(familyId: 'f9'));
        return (404, apiErr('NOT_FOUND'));
      }, role: 'probashi');
      await enterField(t, 'Full name', 'Rafi');
      await tapLabel(t, 'Continue');
      await settle(t);
      expect(find.text('Create my family circle'), findsOneWidget);
      expect(find.text(s('profile_setup').t('profile.probashi_gift')), findsOneWidget);
      await tapLabel(t, 'Join with invite code');
      await t.pump();
      await enterField(t, 'Invite code', 'ab2-cd3');
      await tapLabel(t, 'Join family');
      await settle(t);
      expect(env.api.bodyOf('POST /invites/accept'), {'code': 'AB2CD3'});
      expect(pathOf(router), '/home');
    });

    testWidgets('offline: saved on this phone and continues', (t) async {
      final (_, router) = await open(t, (r) => (0, null), role: 'member');
      await enterField(t, 'Full name', 'Mom');
      await tapLabel(t, 'Continue');
      await settle(t);
      expect(pathOf(router), '/home');
      final c = await containerOf(t);
      expect((c.read(sessionControllerProvider) as SignedIn).user.name, 'Mom');
    });

    testWidgets('country picker search and save; multi-zone country asks for the zone', (t) async {
      final (env, _) = await open(t, (r) => (200, echo(r)));
      await t.tap(find.text('Bangladesh'));
      await settle(t);
      await t.enterText(find.widgetWithText(TextField, 'Search country'), 'united states');
      await t.pump();
      expect(find.text('United States'), findsOneWidget);
      expect(find.descendant(of: find.byType(CountryPickerSheet), matching: find.text('Bangladesh')), findsNothing);
      await t.tap(find.text('United States'));
      await settle(t);
      expect(find.text('Search city or time zone'), findsOneWidget, reason: 'several zones: pick yours');
      await t.enterText(find.widgetWithText(TextField, 'Search city or time zone'), 'chicago');
      await t.pump();
      await t.tap(find.text('Chicago'));
      await settle(t);
      expect(find.text('Chicago'), findsOneWidget);
      final patches = env.api.calls.where((x) => x.$1 == 'PATCH').map((x) => x.$3 as Map).toList();
      expect(patches.last['timezone'], 'America/Chicago');
      expect(patches.last['detected_source'], 'manual');
    });

    for (final lang in ['en', 'bn']) {
      for (final size in screenSizes) {
        testWidgets('fits at ${size.width.toInt()}x${size.height.toInt()} $lang, text 200%', (t) async {
          await open(t, (r) => (200, echo(r)), size: size, scale: 2.0, prefs: {'language': lang});
          expect(t.takeException(), isNull);
        });
      }
    }
  });

  group('sessions', () {
    testWidgets('lists sessions, marks this device, signs out another', (t) async {
      final (env, o) = await authOverrides(handler: (r) {
        if (r.method == 'GET') {
          return (200, [
            {'id': 's1', 'device_model': 'Pixel 8', 'app_version': '0.1.0', 'last_used_at': '2026-10-28T10:00:00Z', 'current': true},
            {'id': 's2', 'device_model': 'Galaxy A54', 'app_version': '0.1.0', 'last_used_at': '2026-10-27T10:00:00Z', 'current': false},
          ]);
        }
        return (204, null);
      });
      await pumpApp(t, o, 'sessions');
      await settle(t);
      expect(find.text('This device'), findsOneWidget);
      expect(find.text('Galaxy A54'), findsOneWidget);
      expect(find.bySemanticsLabel('Sign out'), findsOneWidget, reason: 'not for this device');
      await tapLabel(t, 'Sign out');
      await settle(t);
      expect(env.api.paths, contains('DELETE /auth/sessions/s2'));
      expect(find.text('Galaxy A54'), findsNothing);
    });

    testWidgets('error state with retry', (t) async {
      var fail = true;
      final (_, o) = await authOverrides(handler: (r) => fail ? (0, null) : (200, <Object>[]));
      await pumpApp(t, o, 'sessions');
      await settle(t);
      expect(find.text('Check your internet connection'), findsOneWidget);
      fail = false;
      await tapLabel(t, 'Try again');
      await settle(t);
      expect(find.text('Nothing here yet'), findsOneWidget);
    });
  });

  testWidgets('child code: plan limit shows the upsell, regenerate posts again', (t) async {
    var n = 0;
    final (env, o) = await authOverrides(handler: (r) {
      if (r.path == '/families') return (201, {'id': 'f1'});
      n++;
      return n == 1 ? (402, apiErr('PLAN_LIMIT_REACHED')) : (201, {'code': 'AB2CD3'});
    });
    final router = await pumpApp(t, o, 'child_code_generate');
    await settle(t);
    expect(find.text('Plan limit reached'), findsOneWidget);
    router.go('/home');
    await settle(t);
    router.go('/family/child-code');
    await settle(t);
    expect(find.text('AB2 CD3'), findsOneWidget);
    await tapLabel(t, 'New code');
    await settle(t);
    expect(env.api.paths.where((p) => p.endsWith('/child-code')).length, 3);
  });
}
