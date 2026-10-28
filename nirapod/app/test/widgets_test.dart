import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/i18n/strings.dart';
import 'package:nirapod/core/state/buttons.dart';
import 'package:nirapod/core/state/state_views.dart';
import 'package:nirapod/core/trust/trust.dart';
import 'package:nirapod/core/trust/trust_label.dart';
import 'package:nirapod/nav/adult_shell.dart';

import 'helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late StringsBundle b;
  setUpAll(() async => b = await loadStrings());

  final states = <String, ViewState<String>>{
    'loading': const Loading(),
    'empty': const Empty(),
    'offline': const Data('cached', offline: true),
    'stale': const Data('cached', staleSince: '7:42 PM'),
    'permission': const PermissionDenied('Location'),
    'error': const Failure('err.network'),
    'success': const Succeeded(),
    'limit': const PlanLimit(),
  };

  for (final size in screenSizes) {
    for (final brightness in Brightness.values) {
      for (final lang in ['en', 'bn']) {
        testWidgets('all 8 states fit at ${size.width.toInt()}x${size.height.toInt()} ${brightness.name} $lang, text 200%', (t) async {
          setScreen(t, size);
          final s = b.forScreen('_default', lang);
          for (final entry in states.entries) {
            await t.pumpWidget(harness(
              StateView<String>(
                state: entry.value,
                strings: s,
                data: (_, v) => Text(v),
                onRetry: () {},
                onOpenSettings: () {},
                onSeePlans: () {},
              ),
              brightness: brightness,
              textScale: 2.0,
              script: lang == 'bn' ? 'bengali' : 'latin',
              reduceMotion: true,
            ));
            await t.pump(const Duration(milliseconds: 50));
            expect(t.takeException(), isNull, reason: '${entry.key} overflowed');
          }
        });
      }
    }
  }

  testWidgets('error state offers retry and plain-language text', (t) async {
    var retried = 0;
    await t.pumpWidget(harness(StateView<String>(
      state: const Failure('err.network'),
      strings: b.forScreen('_default', 'en'),
      data: (_, v) => Text(v),
      onRetry: () => retried++,
    )));
    expect(find.text('Check your internet connection'), findsOneWidget);
    await t.tap(find.text('Try again'));
    expect(retried, 1);
  });

  testWidgets('long Bengali button labels wrap instead of truncating', (t) async {
    setScreen(t, const Size(320, 640));
    const label = 'অনুগ্রহ করে আবার চেষ্টা করুন এবং আপনার ইন্টারনেট সংযোগ দেখুন';
    await t.pumpWidget(harness(
      Center(child: SizedBox(width: 200, child: AppButton(label: label, onPressed: () {}))),
      script: 'bengali',
      textScale: 2.0,
    ));
    expect(t.takeException(), isNull);
    final text = t.widget<Text>(find.text(label));
    expect(text.overflow, isNot(TextOverflow.ellipsis));
    expect(text.maxLines, isNull);
  });

  testWidgets('buttons meet the 48dp touch target', (t) async {
    await t.pumpWidget(harness(Center(child: AppButton(label: 'OK', onPressed: () {}, kind: ButtonKind.text))));
    final size = t.getSize(find.byType(AppButton));
    expect(size.height, greaterThanOrEqualTo(48));
    expect(size.width, greaterThanOrEqualTo(48));
  });

  testWidgets('trust label has text and exact time, not color alone', (t) async {
    final s = b.forScreen('_default', 'en');
    await t.pumpWidget(harness(TrustLabel(trust: Trust.stale, strings: s, updatedAt: '7:12 PM')));
    expect(find.text('Stale'), findsOneWidget);
    expect(find.textContaining('Updated 7:12 PM'), findsOneWidget);
    await t.pumpWidget(harness(TrustLabel(trust: Trust.unavailable, strings: s, updatedAt: '6:00 PM', reason: UnavailableReason.locationOff)));
    expect(find.textContaining('Location is turned off'), findsOneWidget);
  });

  testWidgets('bottom bar: 5 tabs, selected state, mirrors in RTL', (t) async {
    setScreen(t, const Size(360, 800));
    var tapped = -1;
    final labels = ['Home', 'Map', 'History', 'Premium', 'Settings'];
    Widget bar(TextDirection d) => harness(
          Align(alignment: Alignment.bottomCenter, child: BottomBar(index: 0, labels: labels, onTap: (i) => tapped = i)),
          direction: d,
        );
    await t.pumpWidget(bar(TextDirection.ltr));
    final homeLtr = t.getCenter(find.text('Home')).dx;
    final settingsLtr = t.getCenter(find.text('Settings')).dx;
    expect(homeLtr, lessThan(settingsLtr));
    await t.tap(find.text('Map'));
    expect(tapped, 1);
    await t.pumpWidget(bar(TextDirection.rtl));
    await t.pumpAndSettle();
    expect(t.getCenter(find.text('Home')).dx, greaterThan(t.getCenter(find.text('Settings')).dx));
    expect(t.getSemantics(find.bySemanticsLabel('Home')), isSemantics(isSelected: true, isButton: true));
  });
}
