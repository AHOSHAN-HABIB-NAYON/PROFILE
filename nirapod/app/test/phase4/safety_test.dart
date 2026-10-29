import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/app.dart';
import 'package:nirapod/core/prefs/prefs.dart';
import 'package:nirapod/core/session/session.dart';
import 'package:nirapod/features/places/places_screen.dart';
import 'package:nirapod/features/safety/data/safety_repo.dart';
import 'package:nirapod/features/safety/sos_screens.dart';
import 'package:nirapod/nav/router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers.dart';
import '../phase2/home_test.dart' show phase2Overrides, parent, family;

const child = AuthUser(id: 'u-rafi', email: null, emailVerified: true, name: 'Rafi', countryIso2: 'BD', timezone: 'Asia/Dhaka', role: AppRole.child, familyId: 'f1');

class FakeSafety implements SafetyRepo {
  int sosSent = 0;
  int arrivals = 0;
  int trips = 0;
  List<Place> placeList = const [];
  int? maxPlaces = 2;

  SosEvent _sos(String status) => SosEvent(
        id: 'sos-1',
        status: status,
        memberId: 'u-rafi',
        memberName: 'Rafi',
        startedAt: DateTime.utc(2026, 10, 27, 13, 50),
        lat: 23.81,
        lng: 90.41,
        mapUrl: 'https://maps.google.com/?q=23.81,90.41',
        deliveries: const [SosDelivery(name: 'Nasrin Rahman', channel: 'socket', status: 'seen'), SosDelivery(name: 'Aunt', channel: 'email', status: 'sent', isMember: false)],
      );

  @override
  Future<SosEvent> sendSos({double? lat, double? lng, double? accuracyM, String trigger = 'button'}) async {
    sosSent++;
    return _sos('active');
  }

  @override
  Future<SosEvent> sos(String id) async => _sos('active');
  @override
  Future<SosEvent> resolveSos(String id) async => _sos('resolved');
  @override
  Future<List<SosEvent>> openSos(String familyId) async => const [];
  @override
  Future<void> ackSos(String id, String state) async {}
  @override
  Future<String?> safeArrival() async {
    arrivals++;
    return 'School';
  }

  @override
  Future<Trip?> myTrip() async => null;
  @override
  Future<Trip> startTrip(int minutes) async {
    trips++;
    return Trip(id: 't1', status: 'active', memberId: 'u-rafi', memberName: 'Rafi', startedAt: DateTime.now().toUtc(), expectedAt: DateTime.now().toUtc().add(Duration(minutes: minutes)));
  }

  @override
  Future<PlacesState> places(String familyId) async => PlacesState(placeList, maxPlaces: maxPlaces);
  @override
  Future<String?> emergencyNumber() async => '999';
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

Future<(FakeSafety, dynamic)> pumpRouted(WidgetTester t, String id, {AuthUser user = child, FakeSafety? fake, Map<String, Object> prefs = const {}, PlaceSearch? search}) async {
  setScreen(t, const Size(412, 915));
  final f = fake ?? FakeSafety();
  final router = createRouter(initialLocation: locationFor(id));
  final List<Override> o = [
    ...await phase2Overrides(user: user, prefs: prefs),
    routerProvider.overrideWithValue(router),
    safetyRepoProvider.overrideWithValue(f),
    sosPositionReaderProvider.overrideWithValue(() async => (23.81, 90.41, 10.0)),
    pickerMapBuilderProvider.overrideWithValue((lat, lng, r, onCenter) => const ColoredBox(color: Color(0xFFDDE7E3))),
    if (search != null) placeSearchProvider.overrideWithValue(search),
  ];
  await t.pumpWidget(ProviderScope(overrides: o, child: const NirapodApp()));
  for (var i = 0; i < 10; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
  return (f, router);
}

void main() {
  testWidgets('child home: sharing status, three big buttons, I arrived safely sends', (t) async {
    final (f, _) = await pumpRouted(t, 'child_home');
    expect(find.text('Location sharing is on'), findsOneWidget);
    expect(find.byKey(const Key('child_sos')), findsOneWidget);
    expect(find.byKey(const Key('child_heading_home')), findsOneWidget);
    await t.tap(find.byKey(const Key('child_arrived')));
    await t.pump(const Duration(milliseconds: 300));
    expect(f.arrivals, 1);
    expect(find.text('Sent: you are at School'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('child SOS: 5 s countdown can be cancelled; otherwise sends and shows delivery status', (t) async {
    final (f, router) = await pumpRouted(t, 'child_sos');
    expect(find.textContaining('Sending SOS in'), findsWidgets);
    await t.tap(find.byKey(const Key('sos_cancel')));
    await t.pump(const Duration(milliseconds: 300));
    expect(f.sosSent, 0);

    router.go(locationFor('child_sos'));
    for (var i = 0; i < 60; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
    expect(f.sosSent, 1);
    expect(find.text('Your SOS has been sent'), findsOneWidget);
    expect(find.text('Seen'), findsOneWidget);
    expect(find.text('Call 999'), findsOneWidget);
    await t.tap(find.byKey(const Key('sos_safe')));
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('SOS ended. Your family has been told.'), findsOneWidget);
  });

  testWidgets('heading home: pick minutes and start', (t) async {
    final (f, _) = await pumpRouted(t, 'child_safe_walk');
    await t.tap(find.byKey(const Key('walk_30')));
    await t.pump();
    await t.tap(find.byKey(const Key('walk_start')));
    await t.pump(const Duration(milliseconds: 300));
    expect(f.trips, 1);
  });

  testWidgets('places: at the plan limit the add button hides and the upsell shows', (t) async {
    final fake = FakeSafety()
      ..placeList = const [
        Place(id: 'p1', name: 'Home', type: 'home', lat: 23.8, lng: 90.4, radiusM: 150),
        Place(id: 'p2', name: 'School', type: 'school', lat: 23.81, lng: 90.41, radiusM: 200),
      ];
    await pumpRouted(t, 'places', user: parent, fake: fake);
    expect(find.text('Home'), findsWidgets);
    expect(find.byKey(const Key('places_upsell')), findsOneWidget);
    expect(find.byKey(const Key('add_place')), findsNothing);
    expect(family().members.length, 4);
  });

  testWidgets('new place: search finds a place, picking it fills the name', (t) async {
    final queries = <String>[];
    await pumpRouted(t, 'place_edit', user: parent, search: (q) async {
      queries.add(q);
      return q == 'zzz' ? const <PlaceHit>[] : const [PlaceHit('Jhinia High School, Jhenaidah, Bangladesh', 23.5, 89.1)];
    });
    await t.enterText(find.byKey(const Key('place_search')), 'zzz');
    await t.tap(find.byKey(const Key('place_search_go')));
    await t.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('No place found'), findsOneWidget);
    await t.enterText(find.byKey(const Key('place_search')), 'Jhinia school');
    await t.tap(find.byKey(const Key('place_search_go')));
    await t.pump(const Duration(milliseconds: 100));
    await t.tap(find.text('Jhinia High School, Jhenaidah, Bangladesh'));
    await t.pump(const Duration(milliseconds: 100));
    expect(queries, ['zzz', 'Jhinia school']);
    final name = t.widget<TextField>(find.descendant(of: find.byKey(const Key('place_name')), matching: find.byType(TextField)));
    expect(name.controller!.text, 'Jhinia High School');
  });

  testWidgets('remember me: email is prefilled when remembered', (t) async {
    SharedPreferences.setMockInitialValues({});
    await pumpRouted(t, 'login_parent', user: parent, prefs: {PrefKeys.rememberMe: true, PrefKeys.rememberedEmail: 'mom@example.com'});
    expect(find.text('Remember me'), findsOneWidget);
    expect(find.text('mom@example.com'), findsOneWidget);
  });
}
