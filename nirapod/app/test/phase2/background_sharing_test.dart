import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/net/api_client.dart';
import 'package:nirapod/core/net/device_id.dart';
import 'package:nirapod/core/net/providers.dart';
import 'package:nirapod/core/net/token_store.dart';
import 'package:nirapod/core/prefs/prefs.dart';
import 'package:nirapod/core/tracking/tracking_bridge.dart';
import 'package:nirapod/features/family/ui/family_screen.dart';
import 'package:nirapod/features/onboarding/data/permission_gateway.dart';

import '../api_client_test.dart' show FakeAdapter, err;
import '../helpers.dart';
import '../onboarding/fakes.dart' show FakeGateway;
import 'home_test.dart' show phase2Overrides, pump, family;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<(NoopTrackingBridge, FakeGateway, FakeAdapter)> setUp(WidgetTester t, {PermResult always = PermResult.granted, String sharing = 'active'}) async {
    setScreen(t, const Size(412, 915));
    final bridge = NoopTrackingBridge();
    final gw = FakeGateway(results: {OnbPermission.locationAlways: always});
    final api = FakeAdapter((o) => o.path == '/devices/upload-key' ? (201, {'upload_key': 'k' * 40}) : (404, err('NOT_FOUND')));
    final base = await phase2Overrides(fam: family(parentSharing: sharing));
    // Replace the default no-op bridge and permission fakes with ones this test can inspect.
    final keep = [for (final o in base) if (!'$o'.contains('TrackingBridge') && !'$o'.contains('PermissionGateway') && !'$o'.contains('ApiClient')) o];
    await pump(t, const FamilyScreen(), [
      ...keep,
      trackingBridgeProvider.overrideWithValue(bridge),
      permissionGatewayProvider.overrideWithValue(gw),
      deviceIdStoreProvider.overrideWithValue(MemoryDeviceIdStore('dev-1')),
      apiClientProvider.overrideWithValue(ApiClient(tokens: MemoryTokenStore(const Tokens(access: 'a', refresh: 'r')), adapter: api, baseUrl: 'https://x/api/v1')),
    ]);
    return (bridge, gw, api);
  }

  testWidgets('adult: "share when the app is closed" shows the disclosure, asks for all-the-time location, then starts', (t) async {
    final (bridge, gw, api) = await setUp(t);
    expect(find.text('Share when the app is closed'), findsOneWidget);
    await t.tap(find.byKey(const Key('bg_sharing_switch')));
    await t.pumpAndSettle();
    expect(find.text('Share your location in the background?'), findsOneWidget);
    await t.tap(find.byKey(const Key('bg_disclosure_ok')));
    await t.pumpAndSettle();
    expect(gw.requests, contains(OnbPermission.locationAlways));
    expect(api.calls.any((c) => c.contains('/devices/upload-key')), isTrue);
    expect(bridge.calls, contains('start'));
    final prefs = ProviderScope.containerOf(t.element(find.byType(FamilyScreen))).read(prefsProvider);
    expect(prefs.getBool(PrefKeys.adultBackground), isTrue);
  });

  testWidgets('adult: "Not now" on the disclosure changes nothing', (t) async {
    final (bridge, gw, _) = await setUp(t);
    await t.tap(find.byKey(const Key('bg_sharing_switch')));
    await t.pumpAndSettle();
    await t.tap(find.text('Not now'));
    await t.pumpAndSettle();
    expect(gw.requests, isEmpty);
    expect(bridge.calls, isEmpty);
  });

  testWidgets('adult: all-the-time location refused -> not started, explains how to allow it', (t) async {
    final (bridge, _, _) = await setUp(t, always: PermResult.denied);
    await t.tap(find.byKey(const Key('bg_sharing_switch')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('bg_disclosure_ok')));
    await t.pumpAndSettle();
    expect(bridge.calls, isNot(contains('start')));
    expect(find.textContaining('Background location is not allowed'), findsOneWidget);
  });

  testWidgets('adult with paused sharing does not see the option', (t) async {
    await setUp(t, sharing: 'paused');
    expect(find.byKey(const Key('bg_sharing_switch')), findsNothing);
  });
}
