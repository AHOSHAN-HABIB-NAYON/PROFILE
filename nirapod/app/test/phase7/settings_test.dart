import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/config/app_config.dart';
import 'package:nirapod/core/net/api_client.dart';
import 'package:nirapod/core/net/providers.dart';
import 'package:nirapod/core/net/token_store.dart';
import 'package:nirapod/features/settings/app_info.dart';
import 'package:nirapod/features/settings/settings_screens.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api_client_test.dart' show FakeAdapter, err;
import '../helpers.dart';
import '../phase2/home_test.dart' show phase2Overrides, pump;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  ApiClient apiWith(FakeAdapter a) => ApiClient(tokens: MemoryTokenStore(const Tokens(access: 'a', refresh: 'r')), adapter: a, baseUrl: 'https://x/api/v1');

  for (final size in const [Size(320, 640), Size(360, 800)]) {
    testWidgets('settings tab lists every section without overflow at ${size.width.toInt()}dp', (t) async {
      setScreen(t, size);
      await pump(t, const SettingsScreen(), await phase2Overrides());
      expect(find.text('Settings'), findsOneWidget);
      expect(find.text('Dark mode'), findsOneWidget);
      expect(find.text('Language'), findsNothing); // language lives in the header pill only
      await t.scrollUntilVisible(find.text('Delete my account and data'), 200);
      expect(find.text('Download my data'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('data export: emails the link and confirms', (t) async {
    setScreen(t, const Size(360, 800));
    final a = FakeAdapter((o) => o.path == '/me/data-export' ? (201, {'id': '1', 'emailed': true}) : (404, err('NOT_FOUND')));
    await pump(t, const DataExportScreen(), [...await phase2Overrides(), apiClientProvider.overrideWithValue(apiWith(a))]);
    await t.tap(find.text('Email me my data'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 50));
    expect(a.calls.single, startsWith('POST /me/data-export'));
    expect(find.text('Sent. Check mom@example.com for the link.'), findsOneWidget);
  });

  testWidgets('delete account: owner with another adult is told the family passes on; wrong password shows an error', (t) async {
    setScreen(t, const Size(360, 800));
    Object? sent;
    final a = FakeAdapter((o) {
      sent = o.data;
      return (401, err('AUTH_INVALID_CREDENTIALS'));
    });
    await pump(t, const DeleteAccountScreen(), [...await phase2Overrides(), apiClientProvider.overrideWithValue(apiWith(a))]);
    expect(find.text('You own this family. Another adult in it becomes the owner.'), findsOneWidget);
    await t.enterText(find.byType(TextField), 'secret-pass');
    await t.pump();
    await t.ensureVisible(find.text('Delete my account').last);
    await t.tap(find.text('Delete my account').last);
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('Delete your account?'), findsOneWidget);
    await t.tap(find.text('Delete my account').last); // dialog action
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    expect(jsonEncode(sent), contains('secret-pass'));
    expect(find.text('Password is incorrect'), findsWidgets);
  });

  testWidgets('help: built-in FAQ, search filters', (t) async {
    setScreen(t, const Size(360, 800));
    final a = FakeAdapter((o) => (200, <dynamic>[]));
    await pump(t, const HelpScreen(), [...await phase2Overrides(), apiClientProvider.overrideWithValue(apiWith(a))]);
    expect(find.text('Who can see my location?'), findsOneWidget);
    await t.enterText(find.byType(TextField), 'battery');
    await t.pump();
    expect(find.text('Does Nirapod drain the battery?'), findsOneWidget);
    expect(find.text('Who can see my location?'), findsNothing);
  });

  testWidgets('update gate: blocks below min_version, offers a prompt below latest', (t) async {
    setScreen(t, const Size(360, 800));
    Future<void> run(String version, Map<String, dynamic> cfg) async {
      await t.pumpWidget(ProviderScope(
        key: UniqueKey(),
        overrides: [
          ...await overrides(appVersion: false),
          appVersionProvider.overrideWith((ref) async => version),
          appConfigProvider.overrideWith((ref) async => AppConfig(cfg)),
        ],
        child: harness(const UpdateGate(child: Text('APP'))),
      ));
      await t.pump();
      await t.pump(const Duration(milliseconds: 50));
    }

    await run('1.0.0', {'min_version': '1.2.0', 'latest_version': '1.3.0'});
    expect(find.text('Update Nirapod'), findsOneWidget);
    expect(find.text('APP'), findsNothing);
    await run('1.2.5', {'min_version': '1.2.0', 'latest_version': '1.3.0'});
    expect(find.text('APP'), findsOneWidget);
    expect(find.text('A new version is ready'), findsOneWidget);
    await t.tap(find.text('Later'));
    await t.pump();
    expect(find.text('A new version is ready'), findsNothing);
    await run('1.3.0', {'min_version': '1.2.0', 'latest_version': '1.3.0'});
    expect(find.text('A new version is ready'), findsNothing);
  });

  test('review: asked only after 7 days and 3 sessions', () async {
    SharedPreferences.setMockInitialValues({});
    final p = await SharedPreferences.getInstance();
    var now = DateTime(2026, 10, 1);
    final r = ReviewService(p, now: () => now);
    expect(r.recordSessionAndCheck(), isFalse); // first open
    expect(r.recordSessionAndCheck(), isFalse);
    expect(r.recordSessionAndCheck(), isFalse); // 3 sessions, day 0
    now = DateTime(2026, 10, 9);
    expect(r.recordSessionAndCheck(), isTrue);
  });
}
