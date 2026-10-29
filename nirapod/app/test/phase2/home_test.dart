import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/session/session.dart';
import 'package:nirapod/core/theme/app_theme.dart';
import 'package:nirapod/core/widgets/language_selector.dart';
import 'package:nirapod/features/family/data/family_models.dart';
import 'package:nirapod/features/family/data/family_repo.dart';
import 'package:nirapod/features/family/data/realtime.dart';
import 'package:nirapod/features/family/ui/family_screen.dart';
import 'package:nirapod/features/family/ui/member_screen.dart';
import 'package:nirapod/features/home/home_screen.dart';
import 'package:nirapod/features/home/widgets/header_buttons.dart';
import 'package:nirapod/features/home/widgets/profile_row.dart';
import 'package:nirapod/features/map/map_prefs.dart';
import 'package:nirapod/features/map/map_screen.dart';
import 'package:nirapod/features/me/me_screen.dart';

import '../helpers.dart';

final now = DateTime.utc(2026, 10, 27, 13, 57); // 19:57 in Dhaka, 16:57 in Riyadh

const parent = AuthUser(
  id: 'u-parent', email: 'mom@example.com', emailVerified: true, name: 'Nasrin Rahman', countryIso2: 'BD',
  timezone: 'Asia/Dhaka', role: AppRole.parent, familyId: 'f1',
);
const probashi = AuthUser(
  id: 'u-dad', email: 'dad@example.com', emailVerified: true, name: 'Karim', countryIso2: 'SA',
  timezone: 'Asia/Riyadh', role: AppRole.guardian, isOverseas: true, familyId: 'f1',
);

Family family({String parentSharing = 'active', String dadSharing = 'active'}) => Family(id: 'f1', ownerMemberId: 'u-parent', members: [
      FamilyMember(id: 'u-parent', name: 'Nasrin Rahman', role: 'parent', timezone: 'Asia/Dhaka', sharingStatus: parentSharing),
      FamilyMember(id: 'u-dad', name: 'Karim', role: 'guardian', isOverseas: true, timezone: 'Asia/Riyadh', sharingStatus: dadSharing),
      const FamilyMember(id: 'u-rafi', name: 'Rafi', role: 'child', relationship: 'Son', timezone: 'Asia/Dhaka', sharingStatus: 'active'),
      const FamilyMember(id: 'u-mina', name: 'Mina', role: 'child', relationship: 'Daughter', timezone: 'Asia/Dhaka', sharingStatus: 'active'),
    ]);

final liveData = {
  'u-rafi': MemberLive(memberId: 'u-rafi', online: true, batteryPct: 78, lastUpdateAt: now.subtract(const Duration(minutes: 1)),
      point: LivePoint(recordedAt: now.subtract(const Duration(minutes: 1)), lat: 23.81, lng: 90.41, accuracyM: 12)),
  'u-mina': MemberLive(memberId: 'u-mina', online: false, batteryPct: 15, lastUpdateAt: now.subtract(const Duration(minutes: 40)),
      point: LivePoint(recordedAt: now.subtract(const Duration(minutes: 40)), lat: 23.8, lng: 90.4, accuracyM: 30)),
};

class FakeSession extends SessionController {
  FakeSession(this.user);
  final AuthUser user;
  bool signedOut = false;
  @override
  SessionState build() => SignedIn(user);
  @override
  Future<void> signOut() async {
    signedOut = true;
    state = const SignedOut();
  }
}

class FakeLive extends LiveController {
  @override
  Future<Map<String, MemberLive>> build() async => liveData;
}

Future<List<Override>> phase2Overrides({AuthUser user = parent, Family? fam, bool noFamily = false, Map<String, Object> prefs = const {}}) async => [
      ...await overrides(prefs: prefs),
      sessionControllerProvider.overrideWith(() => FakeSession(user)),
      familyProvider.overrideWith((ref) async => noFamily ? null : (fam ?? family())),
      liveProvider.overrideWith(FakeLive.new),
      homeClockProvider.overrideWithValue(() => now),
      realtimeProvider.overrideWith((ref) => RealtimeClient(ref)),
      myPositionProvider.overrideWith((ref) async => null),
    ];

Future<void> pump(WidgetTester t, Widget w, List<Override> o, {Brightness b = Brightness.light, double scale = 1}) async {
  await t.pumpWidget(ProviderScope(overrides: o, child: harness(w, brightness: b, textScale: scale, reduceMotion: true)));
  await t.pump();
  await t.pump(const Duration(milliseconds: 50));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Home header: theme toggle, language flag (no pill), bell; profile row greeting + local time', (t) async {
    setScreen(t, const Size(412, 915));
    await pump(t, const HomeScreen(), await phase2Overrides());
    expect(find.byType(ThemeToggleButton), findsOneWidget);
    expect(find.byType(LanguageFlagButton), findsOneWidget);
    expect(find.byType(LanguagePill), findsNothing);
    expect(find.byType(NotificationBell), findsOneWidget);
    expect(find.text('Good evening,'), findsOneWidget); // 19:57 in the SAVED zone Asia/Dhaka
    expect(find.text('Nasrin Rahman'), findsWidgets);
    expect(find.textContaining('Bangladesh · 7:57 PM'), findsOneWidget);
  });

  testWidgets('member cards show trust labels with text, battery and online state', (t) async {
    setScreen(t, const Size(412, 915));
    await pump(t, const HomeScreen(), await phase2Overrides());
    await t.scrollUntilVisible(find.textContaining('Mina', findRichText: true), 300);
    expect(find.text('Live'), findsWidgets);
    expect(find.text('Stale'), findsWidgets);
    expect(find.text('78%'), findsOneWidget);
    expect(find.text('Offline'), findsWidgets);
  });

  testWidgets('overseas guardian sees the family status summary and local times', (t) async {
    setScreen(t, const Size(412, 915));
    await pump(t, const HomeScreen(), await phase2Overrides(user: probashi));
    expect(find.text('Family status'), findsOneWidget);
    expect(find.text('1 need attention.'), findsOneWidget); // Mina is stale
    expect(find.text('Good afternoon,'), findsOneWidget); // 16:57 in Riyadh
    await t.scrollUntilVisible(find.textContaining('It is 7:57 PM for Rafi'), 300);
    expect(find.textContaining('It is 7:57 PM for Rafi'), findsOneWidget);
  });

  testWidgets('an adult who has not agreed sees the consent card', (t) async {
    setScreen(t, const Size(412, 915));
    await pump(t, const HomeScreen(), await phase2Overrides(fam: family(parentSharing: 'pending')));
    expect(find.text('Share your location with your family?'), findsOneWidget);
    expect(find.text('Share my location'), findsOneWidget);
  });

  testWidgets('no family: parent sees "Create your family"', (t) async {
    setScreen(t, const Size(412, 915));
    await pump(t, const HomeScreen(), await phase2Overrides(noFamily: true));
    expect(find.text('Create your family'), findsOneWidget);
    expect(find.text('Create family'), findsOneWidget);
  });

  testWidgets('theme toggle switches to dark and is labelled for TalkBack', (t) async {
    await pump(t, const HomeScreen(), await phase2Overrides());
    expect(find.bySemanticsLabel('Dark mode toggle, currently off'), findsOneWidget);
    await t.tap(find.byType(ThemeToggleButton));
    await t.pump(const Duration(milliseconds: 500));
    expect(find.bySemanticsLabel('Dark mode toggle, currently on'), findsOneWidget);
  });

  for (final lang in ['en', 'bn']) {
    testWidgets('Home has no overflow at 320x640 with 200% text ($lang, dark)', (t) async {
      setScreen(t, const Size(320, 640));
      await pump(t, const HomeScreen(), await phase2Overrides(prefs: {'language': lang}), b: Brightness.dark, scale: 2);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('map: layer choices are remembered; satellite by default', (t) async {
    final o = await phase2Overrides();
    await pump(t, const MapScreen(), o);
    final container = ProviderScope.containerOf(t.element(find.byType(MapScreen)));
    expect(container.read(mapPrefsProvider).kind, MapKind.satellite);
    await t.tap(find.bySemanticsLabel('Map layers'));
    await t.pumpAndSettle();
    await t.tap(find.text('Terrain'));
    await t.tap(find.text('3D view'));
    await t.pumpAndSettle();
    expect(container.read(mapPrefsProvider).kind, MapKind.terrain);
    expect(container.read(mapPrefsProvider).threeD, isTrue);
    expect(MapPrefs.decode(container.read(mapPrefsProvider).encode()).threeD, isTrue);
  });

  testWidgets('member page: child shows Request update now and trust with accuracy', (t) async {
    setScreen(t, const Size(412, 915));
    await pump(t, const MemberScreen(memberId: 'u-rafi'), await phase2Overrides());
    expect(find.text('Request update now'), findsOneWidget);
    expect(find.text('Live'), findsOneWidget);
    expect(find.textContaining('12 m'), findsOneWidget);
  });

  testWidgets('member page: adult who paused is shown as not sharing', (t) async {
    setScreen(t, const Size(412, 915));
    await pump(t, const MemberScreen(memberId: 'u-dad'), await phase2Overrides(fam: family(dadSharing: 'paused')));
    expect(find.text('Karim is not sharing their location.'), findsOneWidget);
    expect(find.text('Request update now'), findsNothing);
  });

  testWidgets('family: my sharing control offers pause/stop when active', (t) async {
    setScreen(t, const Size(412, 915));
    await pump(t, const FamilyScreen(), await phase2Overrides());
    expect(find.text('On: your family can see you'), findsOneWidget);
    expect(find.text('Pause'), findsOneWidget);
    expect(find.text('Stop sharing'), findsOneWidget);
    expect(find.text('Owner'), findsNothing); // shown inside the subtitle with the role
    expect(find.textContaining('Owner'), findsOneWidget);
  });

  testWidgets('profile: Log out asks Stay or Log out; Stay keeps the session', (t) async {
    setScreen(t, const Size(412, 915));
    final o = await phase2Overrides();
    await pump(t, const MeScreen(), o);
    await t.scrollUntilVisible(find.text('Log out'), 300);
    await t.tap(find.text('Log out'));
    await t.pumpAndSettle();
    expect(find.text('Log out?'), findsOneWidget);
    await t.tap(find.text('Stay'));
    await t.pumpAndSettle();
    final container = ProviderScope.containerOf(t.element(find.byType(MeScreen)));
    expect(container.read(sessionControllerProvider), isA<SignedIn>());
  });

  test('pinsFor uses live points and trust', () {
    final pins = pinsFor(family(), liveData, now);
    expect(pins.map((p) => p.id), ['u-rafi', 'u-mina']);
  });

  testWidgets('dark theme renders Home without errors', (t) async {
    await pump(t, const HomeScreen(), await phase2Overrides(), b: Brightness.dark);
    expect(t.takeException(), isNull);
    expect(Theme.of(t.element(find.byType(HomeScreen))).extension<AppColors>(), isNotNull);
  });
}
