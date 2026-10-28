import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/widgets/brand/animated_logo.dart';
import 'package:nirapod/core/widgets/brand/confetti.dart';
import 'package:nirapod/core/widgets/brand/logo_paths.g.dart';
import 'package:nirapod/core/widgets/brand/splash_brand.dart';

import '../helpers.dart';

/// Optional visual check: BRAND_FRAMES_DIR=/some/dir flutter test test/brand writes PNG frames there.
final _framesDir = Platform.environment['BRAND_FRAMES_DIR'];

Future<void> _capture(WidgetTester t, Finder f, String name) async {
  if (_framesDir == null) return;
  await t.runAsync(() async {
    final ro = t.renderObject(f);
    final boundary = ro is RenderRepaintBoundary ? ro : ro.debugLayer == null ? null : ro;
    if (boundary is! RenderRepaintBoundary) return;
    final img = await boundary.toImage(pixelRatio: 2);
    final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
    File('$_framesDir/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

void main() {
  group('AnimatedLogo', () {
    for (final size in [24.0, 48.0, 120.0, 240.0]) {
      testWidgets('builds at ${size}dp and finishes the draw-on within 900 ms', (t) async {
        await t.pumpWidget(harness(Center(child: AnimatedLogo(size: size, semanticLabel: 'Nirapod'))));
        expect(t.getSize(find.byType(AnimatedLogo)), Size(size, size));
        expect(t.hasRunningAnimations, isTrue);
        await t.pump(const Duration(milliseconds: 16)); // first tick: the clock starts one frame after build
        await t.pump(const Duration(milliseconds: 450));
        expect(t.takeException(), isNull);
        await t.pump(const Duration(milliseconds: 450));
        expect(t.hasRunningAnimations, isFalse, reason: 'draw-on must be done after 900 ms');
        expect(t.takeException(), isNull);
      });
    }

    testWidgets('reduce motion shows the final frame without running a ticker', (t) async {
      await t.pumpWidget(harness(const Center(child: AnimatedLogo()), reduceMotion: true));
      expect(t.hasRunningAnimations, isFalse);
      expect(t.binding.transientCallbackCount, 0);
    });

    testWidgets('animate: false shows the final frame without running a ticker', (t) async {
      await t.pumpWidget(harness(const Center(child: AnimatedLogo(animate: false))));
      expect(t.hasRunningAnimations, isFalse);
    });

    testWidgets('semantics label and repaint boundary', (t) async {
      final h = t.ensureSemantics();
      await t.pumpWidget(harness(const Center(child: AnimatedLogo(semanticLabel: 'Nirapod logo'))));
      expect(find.bySemanticsLabel('Nirapod logo'), findsOneWidget);
      expect(find.descendant(of: find.byType(AnimatedLogo), matching: find.byType(RepaintBoundary)), findsOneWidget);
      await t.pump(const Duration(seconds: 1));
      h.dispose();
    });

    testWidgets('frames (visual check)', (t) async {
      for (final ms in [0, 200, 400, 600, 750, 900]) {
        await t.pumpWidget(harness(Center(child: AnimatedLogo(key: ValueKey(ms), size: 160))));
        await t.pump(const Duration(milliseconds: 16));
        await t.pump(Duration(milliseconds: ms));
        await _capture(t, find.descendant(of: find.byType(AnimatedLogo), matching: find.byType(RepaintBoundary)), 'logo_${ms}ms');
        await t.pumpWidget(const SizedBox());
      }
    });
  });

  group('SplashBrand', () {
    for (final dp in screenSizes) {
      for (final b in Brightness.values) {
        testWidgets('builds at ${dp.width.toInt()}x${dp.height.toInt()} ${b.name}, 200 % text, settles', (t) async {
          setScreen(t, dp);
          t.platformDispatcher.platformBrightnessTestValue = b;
          addTearDown(t.platformDispatcher.clearPlatformBrightnessTestValue);
          await t.pumpWidget(harness(const SplashBrand(tagline: 'Live Family Locator'), textScale: 2));
          expect(t.takeException(), isNull);
          await t.pump(const Duration(milliseconds: 16));
          await t.pump(SplashBrand.duration);
          expect(t.hasRunningAnimations, isFalse);
          expect(t.takeException(), isNull);
          expect(find.text('Live Family Locator'), findsOneWidget);
        });
      }
    }

    testWidgets('first frame paints the native splash background for the system brightness', (t) async {
      t.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      addTearDown(t.platformDispatcher.clearPlatformBrightnessTestValue);
      await t.pumpWidget(harness(const SplashBrand()));
      final box = t.widget<ColoredBox>(find.descendant(of: find.byType(SplashBrand), matching: find.byType(ColoredBox)).first);
      expect(box.color, const Color(0xFF0B1512));
      await t.pump(SplashBrand.duration);
    });

    testWidgets('semantics: one label with the tagline', (t) async {
      final h = t.ensureSemantics();
      await t.pumpWidget(harness(const SplashBrand(tagline: 'Live Family Locator')));
      expect(find.bySemanticsLabel('Nirapod. Live Family Locator'), findsOneWidget);
      await t.pump(SplashBrand.duration);
      h.dispose();
    });

    testWidgets('reduce motion: final composition, no ticker', (t) async {
      await t.pumpWidget(harness(const SplashBrand(tagline: 'Live Family Locator'), reduceMotion: true));
      expect(t.hasRunningAnimations, isFalse);
    });

    testWidgets('frames (visual check)', (t) async {
      setScreen(t, const Size(360, 800));
      for (final b in Brightness.values) {
        t.platformDispatcher.platformBrightnessTestValue = b;
        for (final ms in [0, 300, 600, 1600]) {
          await t.pumpWidget(RepaintBoundary(
              key: const ValueKey('cap'),
              child: harness(SplashBrand(key: ValueKey('$b$ms'), tagline: 'Live Family Locator'))));
          await t.pump(const Duration(milliseconds: 16));
          await t.pump(Duration(milliseconds: ms));
          await _capture(t, find.byKey(const ValueKey('cap')), 'splash_${b.name}_${ms}ms');
          await t.pumpWidget(const SizedBox());
        }
      }
      t.platformDispatcher.clearPlatformBrightnessTestValue();
    });
  });

  group('ConfettiBurst', () {
    testWidgets('plays for 1.5 s and stops', (t) async {
      await t.pumpWidget(harness(const ConfettiBurst()));
      expect(t.hasRunningAnimations, isTrue);
      await t.pump(const Duration(milliseconds: 16));
      await t.pump(const Duration(milliseconds: 700));
      expect(t.takeException(), isNull);
      await t.pump(const Duration(milliseconds: 800));
      expect(t.hasRunningAnimations, isFalse);
    });

    testWidgets('reduce motion: nothing, no ticker', (t) async {
      await t.pumpWidget(harness(const ConfettiBurst(), reduceMotion: true));
      expect(t.hasRunningAnimations, isFalse);
      expect(find.descendant(of: find.byType(ConfettiBurst), matching: find.byType(CustomPaint)), findsNothing);
    });

    testWidgets('play: false draws nothing; switching to true plays', (t) async {
      await t.pumpWidget(harness(const ConfettiBurst(play: false)));
      expect(t.hasRunningAnimations, isFalse);
      await t.pumpWidget(harness(const ConfettiBurst()));
      expect(t.hasRunningAnimations, isTrue);
      await t.pump(const Duration(milliseconds: 1600));
    });

    testWidgets('frame (visual check)', (t) async {
      await t.pumpWidget(RepaintBoundary(key: const ValueKey('cap'), child: harness(const ConfettiBurst())));
      await t.pump(const Duration(milliseconds: 450));
      await _capture(t, find.byKey(const ValueKey('cap')), 'confetti_450ms');
      await t.pump(const Duration(milliseconds: 1200));
    });
  });

  test('logo paths stay on the 48 grid', () {
    for (final p in [LogoPaths.pin, LogoPaths.familyFill, LogoPaths.adultLeft, LogoPaths.adultRight, LogoPaths.child]) {
      final b = p.getBounds();
      expect(b.left >= 0 && b.top >= 0 && b.right <= 48 && b.bottom <= 48, isTrue, reason: '$b');
    }
    // the family sits inside the pin
    final pin = LogoPaths.pin.getBounds();
    final fam = LogoPaths.familyFill.getBounds();
    expect(pin.contains(fam.topLeft) && pin.contains(fam.bottomRight), isTrue);
  });
}
