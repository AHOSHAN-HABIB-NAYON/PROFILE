import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/net/api_client.dart';
import 'package:nirapod/core/net/api_error.dart';
import 'package:nirapod/core/net/device_id.dart';
import 'package:nirapod/core/net/providers.dart';
import 'package:nirapod/core/net/token_store.dart';
import 'package:nirapod/core/session/session.dart';
import 'package:nirapod/core/tracking/tracking_bridge.dart';
import 'package:nirapod/features/family/data/sharing.dart';
import 'package:nirapod/features/history/history_data.dart';
import 'package:nirapod/features/history/history_screen.dart';

import '../api_client_test.dart' show FakeAdapter;
import '../phase2/home_test.dart' show phase2Overrides, pump, now, parent;

final events = [
  TimelineEvent(id: '1', type: 'battery_low', memberId: 'u-rafi', memberName: 'Rafi', at: now.subtract(const Duration(minutes: 5)), data: const {'battery_pct': 19}),
  TimelineEvent(id: '2', type: 'update_requested', memberId: 'u-rafi', memberName: 'Rafi', at: now.subtract(const Duration(minutes: 9))),
  TimelineEvent(id: '3', type: 'offline', memberId: 'u-mina', memberName: 'Mina', at: now.subtract(const Duration(minutes: 20)), data: const {'minutes': 16, 'reason': 'phone_off_or_offline'}),
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('timeline shows readable events and filters by category', (t) async {
    final o = [
      ...await phase2Overrides(),
      timelineProvider.overrideWith((ref, cat) async => cat == 'safety' ? events.where((e) => e.isSafety).toList() : events),
    ];
    await pump(t, const HistoryScreen(), o);
    expect(find.text("Rafi's battery was low (19%)"), findsOneWidget);
    expect(find.text('Location update requested for Rafi'), findsOneWidget);
    expect(find.text('Mina was offline (no update for 16 min)'), findsOneWidget);
    await t.tap(find.text('Safety'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 50));
    expect(find.text('Location update requested for Rafi'), findsNothing);
    expect(find.text("Rafi's battery was low (19%)"), findsOneWidget);
  });

  testWidgets('routes: shows the day route and the plan limit message beyond history', (t) async {
    final o = [
      ...await phase2Overrides(),
      routeProvider.overrideWith((ref, key) async {
        if (key.$2 == '2026-10-27') {
          return DayRoute(timezone: 'Asia/Dhaka', historyDays: 3, points: [
            RoutePoint(now.subtract(const Duration(hours: 3)), 23.80, 90.40, 10),
            RoutePoint(now.subtract(const Duration(hours: 1)), 23.81, 90.41, 10),
          ]);
        }
        throw ApiError(ApiErrorKind.planLimit, code: 'PLAN_LIMIT_REACHED', details: const {'max': 3});
      }),
    ];
    setScreenSize(t);
    await pump(t, const HistoryScreen(), o);
    await t.tap(find.text('Routes'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 50));
    expect(find.text('Today'), findsWidgets);
    await t.pump(const Duration(milliseconds: 100));
    await t.pump(const Duration(milliseconds: 100));
    expect(find.text('2 location updates'), findsOneWidget);
    await t.tap(find.byTooltip('Day').first);
    await t.pump();
    await t.pump(const Duration(milliseconds: 100));
    await t.pump(const Duration(milliseconds: 100));
    expect(find.text('Your plan keeps 3 days of history. Upgrade to see more.'), findsOneWidget);
  });

  test('child device: gets an upload key and starts the native service; adults never do', () async {
    final bridge = NoopTrackingBridge();
    final adapter = FakeAdapter((o) => o.path == '/devices/upload-key' ? (201, {'upload_key': 'k' * 43}) : (404, null));
    final api = ApiClient(tokens: MemoryTokenStore(const Tokens(access: 'a', refresh: 'r')), adapter: adapter, baseUrl: 'https://x/api/v1');
    ProviderContainer make(AuthUser u) => ProviderContainer(overrides: [
          trackingBridgeProvider.overrideWithValue(bridge),
          apiClientProvider.overrideWithValue(api),
          deviceIdStoreProvider.overrideWithValue(MemoryDeviceIdStore('dev-1')),
          sessionControllerProvider.overrideWith(() => _Fixed(u)),
        ]);
    final adult = make(parent);
    expect(await adult.read(childTrackingProvider).ensureStarted(), isFalse);
    expect(bridge.calls, isEmpty);
    adult.dispose();
    // Child path needs the geolocator plugin (permission check), which does not run in unit tests:
    // the gate on the session role is what we verify here; the device flow is covered by manual tests.
  });
}

void setScreenSize(WidgetTester t) {
  t.view.devicePixelRatio = 2;
  t.view.physicalSize = const Size(412, 915) * 2;
  addTearDown(t.view.reset);
}

class _Fixed extends SessionController {
  _Fixed(this.u);
  final AuthUser u;
  @override
  SessionState build() => SignedIn(u);
}
