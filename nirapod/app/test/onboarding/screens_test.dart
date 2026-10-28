import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/app.dart';
import 'package:nirapod/nav/router.dart';

import '../helpers.dart';
import 'package:nirapod/core/net/api_error.dart';
import 'package:nirapod/core/prefs/prefs.dart';
import 'package:nirapod/core/session/session.dart';
import 'package:nirapod/core/widgets/brand/confetti.dart';
import 'package:nirapod/core/widgets/language_selector.dart';
import 'package:nirapod/features/onboarding/data/onboarding_repository.dart';
import 'package:nirapod/features/onboarding/data/permission_gateway.dart';
import 'package:nirapod/features/onboarding/widgets/demo_stage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

const _onboardingIds = [
  'welcome',
  'perm_notifications',
  'perm_how_location',
  'perm_location',
  'role',
  'child_perm_background',
  'child_perm_battery',
  'child_consent',
  'child_all_set',
];

const _members = [
  FamilyMemberInfo(id: 'm-mom', name: 'Mom', role: 'parent', relationship: 'Mother'),
  FamilyMemberInfo(id: 'm-uncle', name: 'Karim Uncle', role: 'guardian'),
  FamilyMemberInfo(id: 'm-rafi', name: 'Rafi', role: 'child'),
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('splash', () {
    tearDown(() => SessionController.restoreImpl = null);

    testWidgets('first launch -> welcome after 600 ms', (t) async {
      final app = await pumpApp(t, 'splash');
      expect(app.path, '/welcome');
    });

    testWidgets('waits at least 600 ms', (t) async {
      final app = await pumpApp(t, 'splash', prefs: {PrefKeys.onboardingDone: true});
      // Start again from a fresh splash and check it holds for the minimum time.
      app.router.go('/');
      await t.pump(const Duration(milliseconds: 300));
      expect(app.path, '/');
      await settle(t);
      expect(app.path, '/role');
    });

    testWidgets('onboarding done -> remembered login page', (t) async {
      final app = await pumpApp(t, 'splash', prefs: {PrefKeys.onboardingDone: true, PrefKeys.roleChoice: 'probashi'});
      expect(app.path, '/login/probashi');
    });

    testWidgets('signed-in child -> child home', (t) async {
      SessionController.restoreImpl = (_) async => const SignedIn(childUser);
      final app = await pumpApp(t, 'splash');
      expect(app.path, '/child');
    });
  });

  testWidgets('every onboarding screen opens through the router with the REAL gateway and API (no plugins in tests)', (t) async {
    final router = createRouter(initialLocation: '/welcome');
    await t.pumpWidget(ProviderScope(
      overrides: [...await overrides(), routerProvider.overrideWithValue(router)],
      child: const NirapodApp(),
    ));
    for (final id in _onboardingIds) {
      router.go(locationFor(id));
      await settle(t);
      expect(t.takeException(), isNull, reason: id);
    }
    // Tapping Continue on a real permission page must not throw without the platform plugin.
    router.go(locationFor('perm_notifications'));
    await settle(t);
    await tapKey(t, 'perm_primary');
    expect(t.takeException(), isNull);
  });

  group('language selector placement', () {
    testWidgets('present on Welcome only; absent on permission, role and child pages', (t) async {
      for (final id in _onboardingIds) {
        await pumpApp(t, id, session: const SignedIn(childUser), repo: FakeRepo(members: _members));
        expect(find.byType(LanguagePill), id == 'welcome' ? findsOneWidget : findsNothing, reason: id);
        expect(find.byType(LanguageFlagButton), findsNothing, reason: id);
        await t.pumpWidget(const SizedBox());
      }
    });
  });

  group('welcome + permission flow', () {
    testWidgets('Get Started resumes the saved step', (t) async {
      final app = await pumpApp(t, 'welcome', prefs: {PrefKeys.onboardingStep: 2});
      await tapKey(t, 'get_started');
      expect(app.path, '/onboarding/location');
    });

    testWidgets('Continue triggers the system dialog, then the next page; steps are saved', (t) async {
      final app = await pumpApp(t, 'welcome');
      await tapKey(t, 'get_started');
      expect(app.path, '/onboarding/notifications');
      expect(find.text('Step 1 of 3'), findsOneWidget);
      expect(app.gateway.requests, isEmpty, reason: 'nothing is requested before Continue');

      await tapKey(t, 'perm_primary');
      expect(app.gateway.requests, [OnbPermission.notification]);
      expect(app.path, '/onboarding/how-location-works');

      await tapKey(t, 'perm_primary'); // story page: no dialog
      expect(app.gateway.requests, [OnbPermission.notification]);
      expect(app.path, '/onboarding/location');

      await tapKey(t, 'perm_primary');
      expect(app.gateway.requests, [OnbPermission.notification, OnbPermission.locationWhenInUse]);
      expect(app.path, '/role');

      final prefs = await SharedPrefsProbe.read(t);
      expect(prefs[PrefKeys.onboardingStep], 3);
      expect(prefs[PrefKeys.onboardingDone], isNull, reason: 'done only once a role is chosen');
    });

    testWidgets('denied -> friendly explanation + Open Settings; then Continue moves on', (t) async {
      final gateway = FakeGateway(results: {OnbPermission.notification: PermResult.denied});
      final app = await pumpApp(t, 'perm_notifications', gateway: gateway);
      expect(find.byKey(const Key('denied_panel')), findsNothing);
      await tapKey(t, 'perm_primary');
      expect(app.path, '/onboarding/notifications');
      expect(find.byKey(const Key('denied_panel')), findsOneWidget);
      expect(find.text('Open Settings'), findsOneWidget);
      await t.ensureVisible(find.text('Open Settings'));
      await t.pump();
      await t.tap(find.text('Open Settings'));
      await settle(t);
      expect(gateway.settingsOpened, 1);
      await tapKey(t, 'perm_primary');
      expect(gateway.requests.length, 1, reason: 'no repeated dialog after a denial');
      expect(app.path, '/onboarding/how-location-works');
    });

    testWidgets('permanently denied location also shows Open Settings', (t) async {
      final gateway = FakeGateway(results: {OnbPermission.locationWhenInUse: PermResult.permanentlyDenied});
      await pumpApp(t, 'perm_location', gateway: gateway);
      await tapKey(t, 'perm_primary');
      expect(find.byKey(const Key('denied_panel')), findsOneWidget);
      expect(find.text('Open Settings'), findsOneWidget);
    });

    testWidgets('Not now skips without a dialog and still records the step', (t) async {
      final app = await pumpApp(t, 'perm_notifications');
      await tapKey(t, 'perm_not_now');
      expect(app.gateway.requests, isEmpty);
      expect(app.path, '/onboarding/how-location-works');
      expect((await SharedPrefsProbe.read(t))[PrefKeys.onboardingStep], 1);
    });
  });

  group('role', () {
    for (final (key, path, name) in [
      ('role_parent', '/login/parent', 'parent'),
      ('role_child', '/login/child', 'child'),
      ('role_probashi', '/login/probashi', 'probashi'),
      ('role_member', '/login/member', 'member'),
    ]) {
      testWidgets('$name card -> $path, choice saved, onboarding done', (t) async {
        final app = await pumpApp(t, 'role');
        await tapKey(t, key);
        expect(app.path, path);
        final prefs = await SharedPrefsProbe.read(t);
        expect(prefs[PrefKeys.roleChoice], name);
        expect(prefs[PrefKeys.onboardingDone], isTrue);
      });
    }

    testWidgets('saved choice is shown as selected; "Log in" opens the remembered login', (t) async {
      final app = await pumpApp(t, 'role', prefs: {PrefKeys.roleChoice: 'member'});
      expect(t.getSemantics(find.byKey(const Key('role_member'))), isSemantics(isSelected: true, isButton: true));
      expect(t.getSemantics(find.byKey(const Key('role_parent'))), isSemantics(isSelected: false));
      await tapKey(t, 'role_log_in');
      expect(app.path, '/login/member');
    });

    testWidgets('"Log in" without a saved role defaults to the parent login', (t) async {
      final app = await pumpApp(t, 'role');
      await tapKey(t, 'role_log_in');
      expect(app.path, '/login/parent');
    });
  });

  group('child pages', () {
    testWidgets('background: disclosure first, then while-in-use + always, consent stored', (t) async {
      final app = await pumpApp(t, 'child_perm_background', session: const SignedIn(childUser));
      expect(find.byKey(const Key('bg_disclosure')), findsOneWidget);
      expect(find.byKey(const Key('bg_hint')), findsOneWidget);
      expect(app.gateway.requests, isEmpty);
      await tapKey(t, 'perm_primary');
      expect(app.gateway.requests, [OnbPermission.locationWhenInUse, OnbPermission.locationAlways]);
      expect(app.repo.consents.single, {
        'type': 'background_location_disclosure',
        'version': '2026-10',
        'granted': true,
        'details': {'os_permission': 'granted'},
      });
      expect(app.path, '/child/onboarding/battery');
    });

    testWidgets('background: denied -> explanation + Open Settings', (t) async {
      final gateway = FakeGateway(
        statuses: {OnbPermission.locationWhenInUse: PermResult.granted},
        results: {OnbPermission.locationAlways: PermResult.denied},
      );
      final app = await pumpApp(t, 'child_perm_background', gateway: gateway);
      await tapKey(t, 'perm_primary');
      expect(gateway.requests, [OnbPermission.locationAlways], reason: 'while-in-use already granted');
      expect(find.byKey(const Key('denied_panel')), findsOneWidget);
      expect(find.text('Open Settings'), findsOneWidget);
      expect(app.path, '/child/onboarding/background');
    });

    testWidgets('background: Not now records a declined disclosure and moves on', (t) async {
      final app = await pumpApp(t, 'child_perm_background');
      await tapKey(t, 'perm_not_now');
      expect(app.gateway.requests, isEmpty);
      expect(app.repo.consents.single['granted'], isFalse);
      expect(app.path, '/child/onboarding/battery');
    });

    testWidgets('battery: brand chips switch the guide; settings open via intent', (t) async {
      final app = await pumpApp(t, 'child_perm_battery');
      expect(find.textContaining('Don\'t optimize'), findsOneWidget, reason: 'Others preselected');
      await tapKey(t, 'brand_samsung');
      expect(find.textContaining('Sleeping apps'), findsOneWidget);
      await tapKey(t, 'open_battery');
      expect(app.gateway.batteryOpened, 1);
      await tapKey(t, 'perm_primary');
      expect(app.path, '/child/onboarding/consent');
    });

    testWidgets('consent: lists adults who can see the child; "I understand" stores the record', (t) async {
      final repo = FakeRepo(members: [..._members]);
      final app = await pumpApp(t, 'child_consent', session: const SignedIn(childUser), repo: repo);
      expect(repo.familyRequests, ['fam-1']);
      expect(find.text('Mom'), findsOneWidget);
      expect(find.text('Karim Uncle'), findsOneWidget);
      expect(find.text('Rafi'), findsNothing);
      expect(find.text('Parent · Mother'), findsOneWidget);
      await tapKey(t, 'consent_ok');
      expect(repo.consents.single, {
        'type': 'child_location_sharing',
        'version': '2026-10',
        'granted': true,
        'details': {'shown_member_ids': ['m-mom', 'm-uncle']},
      });
      expect(app.path, '/child/onboarding/done');
    });

    testWidgets('consent: offline state with retry; button disabled until loaded', (t) async {
      final repo = FakeRepo(members: [..._members], loadError: ApiError(ApiErrorKind.network));
      final app = await pumpApp(t, 'child_consent', session: const SignedIn(childUser), repo: repo);
      expect(find.byKey(const Key('consent_load_error')), findsOneWidget);
      expect(find.textContaining('offline'), findsOneWidget);
      await tapKey(t, 'consent_ok');
      expect(app.path, '/child/onboarding/consent');
      repo.loadError = null;
      await tapKey(t, 'consent_retry');
      expect(find.text('Mom'), findsOneWidget);
    });

    testWidgets('consent: save failure keeps the child on the page with an error', (t) async {
      final repo = FakeRepo(members: [..._members], saveError: ApiError(ApiErrorKind.server));
      final app = await pumpApp(t, 'child_consent', session: const SignedIn(childUser), repo: repo);
      await tapKey(t, 'consent_ok');
      expect(app.path, '/child/onboarding/consent');
      expect(find.textContaining('could not save'), findsOneWidget);
    });

    testWidgets('all set: confetti + check, Continue -> child home', (t) async {
      final app = await pumpApp(t, 'child_all_set');
      expect(find.byType(ConfettiBurst), findsOneWidget);
      expect(find.text('You\'re all set'), findsOneWidget);
      await tapKey(t, 'allset_continue');
      expect(app.path, '/child');
    });
  });

  group('motion', () {
    testWidgets('demos run on a time-based ticker normally', (t) async {
      await pumpApp(t, 'perm_notifications');
      expect(find.byType(DemoStage), findsOneWidget);
      expect(SchedulerBinding.instance.transientCallbackCount, greaterThan(0));
    });

    testWidgets('reduce motion: every demo is a static frame, no tickers keep running', (t) async {
      t.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
      addTearDown(t.platformDispatcher.clearAccessibilityFeaturesTestValue);
      for (final id in ['perm_notifications', 'perm_how_location', 'perm_location', 'child_perm_background', 'child_perm_battery']) {
        await pumpApp(t, id);
        await t.pumpAndSettle(); // would time out if any demo ticker were running
        expect(SchedulerBinding.instance.transientCallbackCount, 0, reason: id);
        expect(find.byType(DemoStage), findsOneWidget, reason: id);
        await t.pumpWidget(const SizedBox());
      }
    });
  });

  group('layout', () {
    for (final size in const [Size(320, 640), Size(360, 800), Size(412, 915)]) {
      for (final lang in ['en', 'bn']) {
        testWidgets('no overflow at ${size.width.toInt()}x${size.height.toInt()}, text x2, $lang', (t) async {
          t.view.devicePixelRatio = 2;
          t.view.physicalSize = size * 2;
          t.platformDispatcher.textScaleFactorTestValue = 2.0;
          addTearDown(t.view.reset);
          addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
          for (final id in _onboardingIds) {
            await pumpApp(t, id, prefs: {'language': lang}, session: const SignedIn(childUser), repo: FakeRepo(members: _members));
            expect(t.takeException(), isNull, reason: '$id $lang $size');
            await t.pumpWidget(const SizedBox());
          }
        });
      }
    }

    testWidgets('RTL (Arabic): layout mirrors, pages render', (t) async {
      for (final id in ['welcome', 'role', 'perm_location']) {
        await pumpApp(t, id, prefs: {'language': 'ar'});
        expect(t.takeException(), isNull, reason: id);
        expect(Directionality.of(t.element(find.byType(Scaffold).first)), TextDirection.rtl, reason: id);
        await t.pumpWidget(const SizedBox());
      }
    });
  });
}

/// Reads the mocked SharedPreferences values the app wrote (same singleton the app uses).
abstract final class SharedPrefsProbe {
  static Future<Map<String, Object?>> read(WidgetTester t) async {
    final p = await SharedPreferences.getInstance();
    return {for (final k in p.getKeys()) k: p.get(k)};
  }
}
