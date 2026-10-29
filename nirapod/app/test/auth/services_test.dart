import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/net/token_store.dart';
import 'package:nirapod/core/session/session.dart';
import 'package:nirapod/core/tz/tz_utils.dart';
import 'package:nirapod/features/auth/data/auth_api.dart';
import 'package:nirapod/features/auth/data/auth_service.dart';
import 'package:nirapod/features/auth/profile/countries.dart';
import 'package:nirapod/features/auth/profile/detection.dart';
import 'package:nirapod/features/auth/profile/pickers.dart';
import 'package:nirapod/features/auth/profile/profile_repo.dart';
import 'package:nirapod/features/auth/profile/travel_service.dart';
import 'package:nirapod/features/auth/routes.dart';

import '../helpers.dart' show loadTz;
import 'auth_helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late TzData tz;
  setUpAll(() async => tz = await loadTz());

  group('travel rule (decideTravel)', () {
    TravelDecision d({bool auto = true, String? saved = 'Asia/Dhaka', String? country = 'BD', String? last = 'Asia/Dhaka', String? device}) =>
        decideTravel(tz: tz, tzAuto: auto, savedZone: saved, savedCountry: country, lastDeviceZone: last, deviceZone: device);

    test('no change -> nothing', () => expect(d(device: 'Asia/Dhaka').isNone, isTrue));

    test('travel to another country: save zone silently AND prompt for the country', () {
      final r = d(device: 'Asia/Riyadh');
      expect(r.newZone, 'Asia/Riyadh');
      expect(r.promptCountry, 'SA');
      expect(r.recordDeviceZone, 'Asia/Riyadh');
    });

    test('zone change inside the same country: silent, no prompt', () {
      final r = d(saved: 'America/New_York', country: 'US', last: 'America/New_York', device: 'America/Chicago');
      expect(r.newZone, 'America/Chicago');
      expect(r.promptCountry, isNull);
    });

    test('auto OFF: do nothing', () {
      final r = d(auto: false, device: 'Asia/Riyadh');
      expect(r.isNone, isTrue);
      expect(r.recordDeviceZone, 'Asia/Riyadh');
    });

    test('manual choice while auto ON wins until the next REAL device change', () {
      // User picked Asia/Kolkata by hand while the phone is still on Asia/Dhaka.
      final r1 = d(saved: 'Asia/Kolkata', country: 'IN', last: 'Asia/Dhaka', device: 'Asia/Dhaka');
      expect(r1.isNone, isTrue);
      final r2 = d(saved: 'Asia/Kolkata', country: 'IN', last: 'Asia/Dhaka', device: 'Asia/Kuala_Lumpur');
      expect(r2.newZone, 'Asia/Kuala_Lumpur');
      expect(r2.promptCountry, 'MY');
    });

    test('UTC / Etc zones are ignored', () {
      expect(d(device: 'UTC').isNone, isTrue);
      expect(d(device: 'Etc/GMT+3').isNone, isTrue);
      expect(d(device: null).isNone, isTrue);
    });

    test('first run only remembers the zone', () => expect(d(last: null, device: 'Asia/Riyadh').isNone, isTrue));
  });

  group('detection: zone > locale > IP > manual; never GPS/SIM', () {
    test('expat with a Bengali phone in Saudi Arabia: trust the time zone', () async {
      var ipAsked = false;
      final r = await detectCountryZone(tz: tz, readZone: () async => 'Asia/Riyadh', readRegion: () => 'BD', ipHint: () async {
        ipAsked = true;
        return 'BD';
      });
      expect([r.country, r.timezone, r.source], ['SA', 'Asia/Riyadh', DetectionSource.timezone]);
      expect(ipAsked, isFalse, reason: 'IP hint only when zone and locale give nothing');
    });

    test('UTC zone falls back to locale, then IP, then manual', () async {
      final a = await detectCountryZone(tz: tz, readZone: () async => 'UTC', readRegion: () => 'BD');
      expect([a.country, a.timezone, a.source], ['BD', 'Asia/Dhaka', DetectionSource.locale]);
      final b = await detectCountryZone(tz: tz, readZone: () async => 'Etc/UTC', readRegion: () => null, ipHint: () async => 'MY');
      expect([b.country, b.source], ['MY', DetectionSource.ip]);
      final c = await detectCountryZone(tz: tz, readZone: () async => null, readRegion: () => null, ipHint: () async => throw Exception('offline'));
      expect([c.country, c.source], [null, null]);
    });

    test('countries with several zones ask to confirm', () async {
      final r = await detectCountryZone(tz: tz, readZone: () async => null, readRegion: () => 'US');
      expect(r.needsZoneConfirmation, isTrue);
    });
  });

  group('pickers search', () {
    late CountryNames names;
    setUpAll(() async => names = await CountryNames.load(rootBundle));

    test('country search by localized, English, native name or code', () {
      expect(filterCountries(names, 'bangla', 'en'), contains('BD'));
      expect(filterCountries(names, 'বাংলাদেশ', 'en'), contains('BD'), reason: 'native name');
      expect(filterCountries(names, 'সৌদি', 'bn'), contains('SA'));
      expect(filterCountries(names, 'my', 'en'), contains('MY'));
      expect(filterCountries(names, 'cote', 'en'), contains('CI'), reason: 'accent-insensitive');
      expect(filterCountries(names, 'zzzz', 'en'), isEmpty);
      expect(filterCountries(names, '', 'en').length, greaterThan(200));
    });

    test('zone search by city, zone id or country; selected country first', () {
      final g = filterZones(tz, names, 'kuala', 'en');
      expect(g.single.country, 'MY');
      expect(g.single.zones, contains('Asia/Kuala_Lumpur'));
      expect(filterZones(tz, names, 'saudi', 'en').single.zones, ['Asia/Riyadh']);
      expect(filterZones(tz, names, '', 'en', firstCountry: 'BD').first.country, 'BD');
      expect(filterZones(tz, names, 'new york', 'en').single.zones, ['America/New_York']);
      expect(cityOf('America/Argentina/Buenos_Aires'), 'Buenos Aires');
    });
  });

  group('session restore / sign out', () {
    Future<(TestEnv, ProviderContainer)> make(Handler h, {Tokens? tokens}) async {
      final (env, o) = await authOverrides(handler: h, tokens: tokens);
      final c = ProviderContainer(overrides: o);
      addTearDown(c.dispose);
      installAuthFeature();
      return (env, c);
    }

    test('no tokens -> signed out without a call', () async {
      final (env, c) = await make((o) => (200, meJson()));
      expect(await c.read(sessionControllerProvider.notifier).restore(), isA<SignedOut>());
      expect(env.api.calls, isEmpty);
    });

    test('tokens + /me -> signed in; no name -> needs profile setup', () async {
      final (_, c) = await make((o) => (200, meJson(name: null)), tokens: const Tokens(access: 'A', refresh: 'R'));
      final s = await c.read(sessionControllerProvider.notifier).restore();
      expect(s, isA<SignedIn>().having((x) => x.needsProfileSetup, 'setup', isTrue));
    });

    test('rejected tokens -> signed out and tokens cleared', () async {
      final (env, c) = await make((o) => (403, apiErr('FORBIDDEN')), tokens: const Tokens(access: 'A', refresh: 'R'));
      expect(await c.read(sessionControllerProvider.notifier).restore(), isA<SignedOut>());
      expect(await env.tokens.read(), isNull);
    });

    test('offline start keeps tokens and uses the cached account', () async {
      final (env, c) = await make((o) => (0, null), tokens: const Tokens(access: 'A', refresh: 'R'));
      expect(await c.read(sessionControllerProvider.notifier).restore(), isA<SignedOut>(), reason: 'nothing cached yet');
      expect(await env.tokens.read(), isNotNull);
      await c.read(profileRepoProvider).cacheUser(AuthUser.fromJson(meJson()));
      expect(await c.read(sessionControllerProvider.notifier).restore(), isA<SignedIn>());
    });

    test('logout revokes on the server and clears tokens and caches, even offline', () async {
      final (env, c) = await make((o) => (204, null), tokens: const Tokens(access: 'A', refresh: 'R'));
      await c.read(authServiceProvider).completeSession(_session());
      await c.read(sessionControllerProvider.notifier).signOut();
      expect(env.api.paths, contains('POST /auth/logout'));
      expect(await env.tokens.read(), isNull);
      expect(c.read(profileRepoProvider).cachedUser(), isNull);
      expect(c.read(sessionControllerProvider), isA<SignedOut>());

      env.api.handler = (o) => (0, null);
      await c.read(authServiceProvider).completeSession(_session());
      await c.read(sessionControllerProvider.notifier).signOut();
      expect(await env.tokens.read(), isNull);
    });
  });

  group('profile save offline + travel watcher', () {
    test('offline save is kept locally and synced later', () async {
      var online = false;
      final (env, o) = await authOverrides(handler: (r) {
        if (!online) return (0, null);
        return (200, {...meJson(), ...(r.data as Map).cast<String, dynamic>()});
      });
      final c = ProviderContainer(overrides: o);
      addTearDown(c.dispose);
      await c.read(authServiceProvider).completeSession(_session());
      final repo = c.read(profileRepoProvider);
      expect(await repo.save({'name': 'Mina'}), SaveOutcome.savedOffline);
      expect((c.read(sessionControllerProvider) as SignedIn).user.name, 'Mina', reason: 'applied locally');
      expect(repo.pending, {'name': 'Mina'});
      online = true;
      await repo.sync();
      expect(repo.pending, isEmpty);
      expect(env.api.bodyOf('PATCH /me/profile'), {'name': 'Mina'});
    });

    test('watcher saves the new zone silently and asks about the country', () async {
      final (env, o) = await authOverrides(handler: (r) => (200, {...meJson(), ...(r.data as Map).cast<String, dynamic>()}));
      final c = ProviderContainer(overrides: o);
      addTearDown(c.dispose);
      await c.read(authServiceProvider).completeSession(_session());
      final w = c.read(travelWatcherProvider);
      final asked = <String>[];
      w.prompter = (cc) async {
        asked.add(cc);
        return true;
      };
      await w.check(); // first run remembers Asia/Dhaka
      expect(env.api.paths.where((p) => p.startsWith('PATCH')), isEmpty);
      env.deviceZone = 'Asia/Riyadh';
      final d = await w.check();
      expect(d.newZone, 'Asia/Riyadh');
      await pumpEventQueue(times: 50);
      expect(asked, ['SA']);
      final patches = env.api.calls.where((x) => x.$1 == 'PATCH').map((x) => x.$3).toList();
      expect(patches, [
        {'timezone': 'Asia/Riyadh', 'detected_source': 'timezone'},
        {'country_iso2': 'SA', 'detected_source': 'timezone'},
      ]);
      // Manual choice while auto is ON wins until the next real device change.
      await c.read(profileRepoProvider).save({'timezone': 'Asia/Kolkata'});
      await w.noteManualChoice();
      expect((await w.check()).isNone, isTrue);
    });
  });
}

AuthSession _session() => AuthSession.fromJson(sessionJson());
