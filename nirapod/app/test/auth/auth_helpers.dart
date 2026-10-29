import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nirapod/core/net/api_client.dart';
import 'package:nirapod/core/net/providers.dart';
import 'package:nirapod/core/net/token_store.dart';
import 'package:nirapod/core/theme/app_theme.dart';
import 'package:nirapod/core/net/device_id.dart';
import 'package:nirapod/features/auth/data/google_gateway.dart';
import 'package:nirapod/features/auth/legal/legal_screen.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:nirapod/features/auth/profile/countries.dart';
import 'package:nirapod/features/auth/profile/detection.dart';
import 'package:nirapod/features/auth/profile/travel_service.dart';
import 'package:nirapod/nav/router.dart';

import '../helpers.dart' as h;

typedef Handler = FutureOr<(int, Object?)> Function(RequestOptions o);

/// Fake HTTP layer (status 0 = offline). Records every call with its JSON body.
class FakeApi implements HttpClientAdapter {
  FakeApi(this.handler);
  Handler handler;
  final calls = <(String, String, Object?)>[];

  List<String> get paths => [for (final c in calls) '${c.$1} ${c.$2}'];
  Object? bodyOf(String methodPath) => calls.lastWhere((c) => '${c.$1} ${c.$2}' == methodPath).$3;

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    calls.add((o.method, o.path, o.data is FormData ? 'multipart' : o.data));
    final (status, data) = await handler(o);
    if (status == 0) throw DioException.connectionError(requestOptions: o, reason: 'offline');
    return ResponseBody.fromString(data == null ? '' : jsonEncode(data), status, headers: {
      Headers.contentTypeHeader: ['application/json'],
    });
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> apiErr(String code, [Map<String, dynamic>? details]) => {
      'error': {'code': code, 'message': 'x', 'requestId': 'r', 'details': ?details},
    };

Map<String, dynamic> meJson({String? name = 'Rafi', String role = 'parent', String provider = 'email', String? familyId}) => {
      'id': 'u1',
      'email': 'rafi@example.com',
      'email_verified': true,
      'auth_provider': provider,
      'name': name,
      'country_iso2': 'BD',
      'timezone': 'Asia/Dhaka',
      'tz_auto': true,
      'language': 'en',
      'role': role,
      'is_overseas': false,
      'family_id': familyId,
    };

Map<String, dynamic> sessionJson({String? name = 'Rafi', String role = 'parent', bool? needsProfile, bool isNew = false, String provider = 'email'}) => {
      'access_token': 'A1',
      'refresh_token': 'R1',
      'expires_in': 900,
      'user': meJson(name: name, role: role, provider: provider),
      'needs_profile_setup': ?needsProfile,
      if (isNew) 'is_new_account': true,
    };

class FakeGoogle implements GoogleGateway {
  FakeGoogle([this.result]);
  GoogleIdentityResult? result;
  bool unavailable = false;
  @override
  Future<GoogleIdentityResult?> signIn() async {
    if (unavailable) throw GoogleUnavailable();
    return result;
  }

  @override
  Future<void> signOut() async {}
}

/// Travel watcher without timers or lifecycle hooks (tests drive [check] directly).
class QuietTravelWatcher extends TravelWatcher {
  QuietTravelWatcher(super.ref, {super.reader});
  @override
  void start() {}
}

CountryNames? _names;

class TestEnv {
  TestEnv(this.api, this.tokens, this.deviceIds, this.google);
  final FakeApi api;
  final MemoryTokenStore tokens;
  final MemoryDeviceIdStore deviceIds;
  final FakeGoogle google;
  final opened = <Uri>[];
  String deviceZone = 'Asia/Dhaka';
  String? localeRegion = 'BD';
}

Future<(TestEnv, List<Override>)> authOverrides({Handler? handler, Map<String, Object> prefs = const {}, Tokens? tokens}) async {
  final env = TestEnv(FakeApi(handler ?? (o) => (404, apiErr('NOT_FOUND'))), MemoryTokenStore(tokens), MemoryDeviceIdStore('device-test-1'), FakeGoogle());
  final base = await h.overrides(prefs: prefs);
  final names = _names ??= await CountryNames.load(rootBundle);
  return (
    env,
    [
      ...base,
      tokenStoreProvider.overrideWithValue(env.tokens),
      apiClientProvider.overrideWith((ref) => ApiClient(tokens: env.tokens, deviceIds: env.deviceIds, adapter: env.api, baseUrl: 'https://x/api/v1')),
      deviceIdStoreProvider.overrideWithValue(env.deviceIds),
      countryNamesProvider.overrideWith((ref) => names),
      googleGatewayProvider.overrideWithValue(env.google),
      travelWatcherProvider.overrideWith((ref) => QuietTravelWatcher(ref)),
      deviceZoneReaderProvider.overrideWithValue(() async => env.deviceZone),
      localeRegionReaderProvider.overrideWithValue(() => env.localeRegion),
      urlOpenerProvider.overrideWithValue((u) async {
        env.opened.add(u);
        return true;
      }),
    ],
  );
}

/// Pumps the real router at [screenId] with the given overrides. Returns the router.
Future<GoRouter> pumpApp(
  WidgetTester t,
  List<Override> overrides,
  String screenId, {
  double textScale = 1.0,
  Size size = const Size(412, 915),
}) async {
  h.setScreen(t, size);
  final router = createRouter(initialLocation: locationFor(screenId));
  await t.pumpWidget(ProviderScope(
    overrides: overrides,
    child: MaterialApp.router(
      routerConfig: router,
      theme: buildTheme(brightness: Brightness.light, script: 'latin'),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale), disableAnimations: true),
        child: child!,
      ),
    ),
  ));
  await t.pump();
  return router;
}

String pathOf(GoRouter r) => r.state.uri.path;

/// Enters text into the TextField under the label [label].
Future<void> enterField(WidgetTester t, String label, String text) async {
  final field = find.ancestor(of: find.text(label), matching: find.byType(Column)).first;
  await t.enterText(find.descendant(of: field, matching: find.byType(TextField)).first, text);
  await t.pump();
}

/// Taps a button by its (semantics) label.
Future<void> tapLabel(WidgetTester t, String label) async {
  final f = find.bySemanticsLabel(label);
  await t.ensureVisible(f.first);
  await t.tap(f.first);
  await t.pump();
}

/// Types a whole code into code cells (the paste path).
Future<void> enterCode(WidgetTester t, String code) async {
  await t.enterText(find.byType(TextField).first, code);
  await t.pump();
}

/// Like pumpAndSettle, but also works while an indeterminate spinner is visible.
Future<void> settle(WidgetTester t, {int steps = 15}) async {
  for (var i = 0; i < steps; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
}
