import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/i18n/strings.dart';
import 'package:nirapod/features/auth/data/google_gateway.dart';
import 'package:nirapod/features/auth/ui/google_flow.dart';

import '../helpers.dart' show loadStrings, screenSizes;
import 'auth_helpers.dart';

void main() {
  late Strings en;
  setUpAll(() async => en = (await loadStrings()).forScreen('login', 'en'));

  Future<void> fillLogin(WidgetTester t, {String email = 'rafi@example.com', String password = 'river7lantern'}) async {
    await enterField(t, en.t('auth.email'), email);
    await enterField(t, en.t('auth.password'), password);
    await tapLabel(t, en.t('auth.log_in'));
    await t.pumpAndSettle();
  }

  group('login', () {
    testWidgets('wrong password -> plain-language inline error', (t) async {
      final (_, o) = await authOverrides(handler: (r) => (401, apiErr('AUTH_INVALID_CREDENTIALS')));
      final router = await pumpApp(t, o, 'login_parent');
      await fillLogin(t);
      expect(find.text('Email or password is incorrect'), findsOneWidget);
      expect(pathOf(router), '/login/parent');
    });

    testWidgets('after 5 failures the server lock message is shown', (t) async {
      final (_, o) = await authOverrides(handler: (r) => (423, apiErr('AUTH_LOCKED')));
      await pumpApp(t, o, 'login_parent');
      await fillLogin(t);
      expect(find.text('Too many attempts. Try again in 15 minutes.'), findsOneWidget);
    });

    testWidgets('offline -> check your internet connection', (t) async {
      final (_, o) = await authOverrides(handler: (r) => (0, null));
      await pumpApp(t, o, 'login_probashi');
      expect(find.text('Probashi login'), findsOneWidget);
      await fillLogin(t);
      expect(find.text('Check your internet connection'), findsOneWidget);
    });

    testWidgets('invalid email is caught before any request', (t) async {
      final (env, o) = await authOverrides();
      await pumpApp(t, o, 'login_parent');
      await fillLogin(t, email: 'rafi@');
      expect(find.text('Enter a valid email address'), findsOneWidget);
      expect(env.api.calls, isEmpty);
    });

    testWidgets('email not verified -> verification screen', (t) async {
      final (env, o) = await authOverrides(handler: (r) => r.path == '/auth/login' ? (403, apiErr('AUTH_EMAIL_NOT_VERIFIED')) : (202, null));
      final router = await pumpApp(t, o, 'login_parent');
      await fillLogin(t);
      expect(pathOf(router), '/register/verify');
      expect(env.api.paths, contains('POST /auth/resend-code'));
    });

    testWidgets('success -> home; device id and tokens stored', (t) async {
      final (env, o) = await authOverrides(handler: (r) => (200, sessionJson()));
      final router = await pumpApp(t, o, 'login_parent');
      await fillLogin(t);
      expect(pathOf(router), '/home');
      final body = env.api.bodyOf('POST /auth/login')! as Map;
      expect(body['email'], 'rafi@example.com');
      expect((body['device'] as Map)['device_id'], isNotEmpty);
      expect((await env.tokens.read())!.access, 'A1');
    });

    testWidgets('member: optional invite code accepted after login', (t) async {
      final (env, o) = await authOverrides(handler: (r) => r.path == '/auth/login' ? (200, sessionJson(role: 'guardian')) : (200, {}));
      final router = await pumpApp(t, o, 'login_member');
      await enterField(t, en.t('auth.invite_code'), 'k7q-2mx');
      await fillLogin(t);
      expect(env.api.bodyOf('POST /invites/accept'), {'code': 'K7Q2MX'});
      expect(pathOf(router), '/home');
    });

    testWidgets('account without a name -> profile setup', (t) async {
      final (_, o) = await authOverrides(handler: (r) => (200, sessionJson(name: null)));
      final router = await pumpApp(t, o, 'login_parent');
      await fillLogin(t);
      expect(pathOf(router), '/profile-setup');
    });

    testWidgets('links: forgot, create account, change role', (t) async {
      final (_, o) = await authOverrides();
      final router = await pumpApp(t, o, 'login_parent');
      await tapLabel(t, en.t('auth.forgot'));
      await t.pumpAndSettle();
      expect(pathOf(router), '/forgot');
      router.go('/login/parent');
      await t.pumpAndSettle();
      await tapLabel(t, en.t('auth.create_account'));
      await t.pumpAndSettle();
      expect(pathOf(router), '/register');
      router.go('/login/parent');
      await t.pumpAndSettle();
      await tapLabel(t, en.t('auth.change_role'));
      await t.pumpAndSettle();
      expect(pathOf(router), '/role');
    });
  });

  group('google', () {
    testWidgets('new account: 18+ sheet is mandatory, then retry with confirmation -> profile setup', (t) async {
      var call = 0;
      final (env, o) = await authOverrides(handler: (r) {
        call++;
        final body = r.data as Map;
        if (body['adult_and_terms_confirmed'] != true) return (403, apiErr('CONSENT_REQUIRED', {'needs': 'age_terms'}));
        return (200, sessionJson(name: null, isNew: true, provider: 'google'));
      });
      env.google.result = const GoogleIdentityResult(idToken: 'ID', displayName: 'Mina Rahman', photoUrl: null);
      final router = await pumpApp(t, o, 'login_parent');
      await tapLabel(t, en.t('auth.google'));
      await settle(t);
      expect(find.text('Before we continue'), findsOneWidget);
      await tapLabel(t, en.t('common.continue'));
      await settle(t);
      expect(find.text('Please confirm to continue'), findsOneWidget, reason: 'checkbox is mandatory');
      await t.tap(find.descendant(of: find.byType(GoogleTermsSheet), matching: find.byType(Checkbox)));
      await t.pump();
      await tapLabel(t, en.t('common.continue'));
      await settle(t);
      expect(call, 2);
      expect((env.api.bodyOf('POST /auth/google')! as Map)['id_token'], 'ID');
      expect(pathOf(router), '/profile-setup');
      expect(find.widgetWithText(TextField, 'Mina Rahman'), findsOneWidget, reason: 'name prefilled from Google');
    });

    testWidgets('existing account goes straight home', (t) async {
      final (env, o) = await authOverrides(handler: (r) => (200, sessionJson(provider: 'google')));
      env.google.result = const GoogleIdentityResult(idToken: 'ID');
      final router = await pumpApp(t, o, 'login_parent');
      await tapLabel(t, en.t('auth.google'));
      await t.pumpAndSettle();
      expect(pathOf(router), '/home');
    });

    testWidgets('cancel is silent; unavailable shows a friendly error', (t) async {
      final (env, o) = await authOverrides();
      final router = await pumpApp(t, o, 'login_parent');
      await tapLabel(t, en.t('auth.google'));
      await t.pumpAndSettle();
      expect(pathOf(router), '/login/parent');
      expect(find.text(en.t('auth.err_google')), findsNothing);
      env.google.unavailable = true;
      await tapLabel(t, en.t('auth.google'));
      await t.pumpAndSettle();
      expect(find.text(en.t('auth.err_google')), findsOneWidget);
    });
  });

  group('register', () {
    testWidgets('rules checklist, mismatch and the mandatory 18+ checkbox', (t) async {
      final (env, o) = await authOverrides(handler: (r) => (201, {'verification_id': 'v'}));
      final router = await pumpApp(t, o, 'register');
      await enterField(t, en.t('auth.email'), 'mina@example.com');
      await enterField(t, en.t('auth.password'), 'password1');
      expect(find.text('Password strength: Weak'), findsOneWidget);
      await tapLabel(t, en.t('auth.create_account'));
      await t.pumpAndSettle();
      expect(find.text(en.t('auth.err_password')), findsOneWidget);
      expect(find.text(en.t('auth.err_age_terms')), findsOneWidget);
      expect(env.api.calls, isEmpty);

      await enterField(t, en.t('auth.password'), 'River7-Lantern-Moon');
      expect(find.text('Password strength: Strong'), findsOneWidget);
      await enterField(t, en.t('auth.confirm_password'), 'River7-Lantern-Mo0n');
      await tapLabel(t, en.t('auth.create_account'));
      await t.pumpAndSettle();
      expect(find.text(en.t('auth.err_mismatch')), findsOneWidget);

      await enterField(t, en.t('auth.confirm_password'), 'River7-Lantern-Moon');
      await t.ensureVisible(find.byType(Checkbox));
      await t.tap(find.byType(Checkbox));
      await t.pump();
      await tapLabel(t, en.t('auth.create_account'));
      await t.pumpAndSettle();
      expect(env.api.bodyOf('POST /auth/register'), {
        'email': 'mina@example.com',
        'password': 'River7-Lantern-Moon',
        'adult_and_terms_confirmed': true,
        'language': 'en',
      });
      expect(pathOf(router), '/register/verify');
      expect(find.textContaining('mina@example.com'), findsOneWidget);
    });

    testWidgets('email already registered', (t) async {
      final (_, o) = await authOverrides(handler: (r) => (409, apiErr('CONFLICT')));
      await pumpApp(t, o, 'register');
      await enterField(t, en.t('auth.email'), 'mina@example.com');
      await enterField(t, en.t('auth.password'), 'river7lantern');
      await enterField(t, en.t('auth.confirm_password'), 'river7lantern');
      await t.ensureVisible(find.byType(Checkbox));
      await t.tap(find.byType(Checkbox));
      await tapLabel(t, en.t('auth.create_account'));
      await t.pumpAndSettle();
      expect(find.text(en.t('auth.err_email_taken')), findsOneWidget);
    });

    testWidgets('Terms opens the in-app browser and returns', (t) async {
      final (env, o) = await authOverrides();
      final router = await pumpApp(t, o, 'register');
      await tapLabel(t, en.t('auth.terms'));
      await t.pumpAndSettle();
      expect(env.opened.single.toString(), 'https://nirapod.app/terms');
      expect(pathOf(router), '/register');
    });
  });

  group('layout', () {
    for (final lang in ['en', 'bn']) {
      for (final size in screenSizes) {
        testWidgets('login + register fit at ${size.width.toInt()}x${size.height.toInt()} $lang, text 200%', (t) async {
          final (_, o) = await authOverrides(prefs: {'language': lang});
          for (final id in ['login_member', 'register', 'forgot_email', 'child_code']) {
            await pumpApp(t, o, id, size: size, textScale: 2.0);
            await t.pumpAndSettle();
            expect(t.takeException(), isNull, reason: '$id overflowed');
          }
        });
      }
    }

    testWidgets('Bengali login is fully Bengali (no English labels)', (t) async {
      final (_, o) = await authOverrides(prefs: {'language': 'bn'});
      await pumpApp(t, o, 'login_parent');
      final bn = (await loadStrings()).forScreen('login', 'bn');
      expect(bn.language, 'bn');
      expect(find.text(bn.t('auth.log_in')), findsWidgets);
      expect(find.text('Log in'), findsNothing);
    });
  });
}
