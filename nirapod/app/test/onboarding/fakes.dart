import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nirapod/app.dart';
import 'package:nirapod/core/net/api_client.dart';
import 'package:nirapod/core/net/token_store.dart';
import 'package:nirapod/core/session/session.dart';
import 'package:nirapod/features/onboarding/data/onboarding_repository.dart';
import 'package:nirapod/features/onboarding/data/permission_gateway.dart';
import 'package:nirapod/nav/router.dart';

import '../helpers.dart';

class FakeGateway implements PermissionGateway {
  FakeGateway({Map<OnbPermission, PermResult>? results, Map<OnbPermission, PermResult>? statuses})
      : results = results ?? {},
        statuses = statuses ?? {};

  final Map<OnbPermission, PermResult> results;
  final Map<OnbPermission, PermResult> statuses;
  final requests = <OnbPermission>[];
  int settingsOpened = 0;
  int batteryOpened = 0;
  String? manufacturer;

  @override
  Future<PermResult> status(OnbPermission p) async => statuses[p] ?? PermResult.denied;

  @override
  Future<PermResult> request(OnbPermission p) async {
    requests.add(p);
    final r = results[p] ?? PermResult.granted;
    statuses[p] = r;
    return r;
  }

  @override
  Future<void> openSettings() async => settingsOpened++;

  @override
  Future<void> openBatterySettings() async => batteryOpened++;

  @override
  Future<String?> deviceManufacturer() async => manufacturer;
}

class FakeRepo extends OnboardingRepository {
  FakeRepo({this.members = const [], this.loadError, this.saveError}) : super(ApiClient(tokens: MemoryTokenStore()));

  List<FamilyMemberInfo> members;
  Object? loadError;
  Object? saveError;
  final consents = <Map<String, Object?>>[];
  final familyRequests = <String>[];

  @override
  Future<void> postConsent({required String type, required bool granted, Map<String, Object?>? details}) async {
    if (saveError != null) throw saveError!;
    consents.add(consentBody(type: type, granted: granted, details: details));
  }

  @override
  Future<List<FamilyMemberInfo>> familyMembers(String familyId) async {
    familyRequests.add(familyId);
    if (loadError != null) throw loadError!;
    return members;
  }
}

class FixedSession extends SessionController {
  FixedSession(this.initial);
  final SessionState initial;
  @override
  SessionState build() => initial;
  @override
  Future<SessionState> restore() async => state;
}

const childUser = AuthUser(id: 'u-child', name: 'Rafi', role: AppRole.child, authProvider: 'device', familyId: 'fam-1');

class TestApp {
  TestApp(this.router, this.gateway, this.repo);
  final GoRouter router;
  final FakeGateway gateway;
  final FakeRepo repo;

  String get path => router.routerDelegate.currentConfiguration.last.matchedLocation;
}

/// Pumps the real app (router, theme, strings) at [initial] with fakes for permissions and API.
Future<TestApp> pumpApp(
  WidgetTester t,
  String initialId, {
  Map<String, Object> prefs = const {},
  FakeGateway? gateway,
  FakeRepo? repo,
  SessionState? session,
}) async {
  final router = createRouter(initialLocation: locationFor(initialId));
  final g = gateway ?? FakeGateway();
  final r = repo ?? FakeRepo();
  await t.pumpWidget(ProviderScope(
    overrides: [
      ...await overrides(prefs: prefs),
      routerProvider.overrideWithValue(router),
      permissionGatewayProvider.overrideWithValue(g),
      onboardingRepositoryProvider.overrideWithValue(r),
      if (session != null) sessionControllerProvider.overrideWith(() => FixedSession(session)),
    ],
    child: const NirapodApp(),
  ));
  await settle(t);
  return TestApp(router, g, r);
}

/// Demos loop forever, so pumpAndSettle cannot be used; pump past page transitions instead.
Future<void> settle(WidgetTester t, [int ms = 800]) async {
  for (var i = 0; i < ms ~/ 50; i++) {
    await t.pump(const Duration(milliseconds: 50));
  }
}

Future<void> tapKey(WidgetTester t, String key) async {
  await t.ensureVisible(find.byKey(Key(key)));
  await t.pump();
  await t.tap(find.byKey(Key(key)));
  await settle(t);
}
