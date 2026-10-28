import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/icons/app_icons.g.dart';
import 'package:nirapod/core/theme/tokens.g.dart';

const _res = 'android/app/src/main/res';
String _hex(int argb) => '#${argb.toRadixString(16).toUpperCase().padLeft(8, '0')}';

void main() {
  test('every BrandAssets constant exists and is pure vector (no raster, no font dependency)', () {
    expect(BrandAssets.all, isNotEmpty);
    for (final a in BrandAssets.all) {
      final f = File(a);
      expect(f.existsSync(), isTrue, reason: a);
      final svg = f.readAsStringSync();
      expect(svg.startsWith('<svg'), isTrue, reason: a);
      expect(RegExp(r'<image|data:|\.png|\.jpe?g|\.gif|\.webp', caseSensitive: false).hasMatch(svg), isFalse, reason: a);
      expect(RegExp(r'<text|<tspan|font-family', caseSensitive: false).hasMatch(svg), isFalse, reason: a);
    }
  });

  test('logo system is complete, with a simplified small app tile', () {
    for (final a in [
      BrandAssets.logoMark, BrandAssets.logoMarkLine, BrandAssets.logoApp, BrandAssets.logoAppSmall,
      BrandAssets.logoMono, BrandAssets.logoWordmark, BrandAssets.logoWordmarkDark,
      BrandAssets.logoLockup, BrandAssets.logoLockupDark,
      BrandAssets.illustrationParent, BrandAssets.illustrationChild, BrandAssets.illustrationProbashi,
      BrandAssets.illustrationMember, BrandAssets.illustrationWelcome,
    ]) {
      expect(File(a).existsSync(), isTrue, reason: a);
    }
    // the draw-on needs the named paths
    final line = File(BrandAssets.logoMarkLine).readAsStringSync();
    for (final id in ['pin', 'adult-left', 'adult-right', 'child']) {
      expect(line.contains('id="$id"'), isTrue, reason: id);
    }
  });

  test('adaptive launcher icon: vector layers incl. monochrome; no PNG mipmaps left', () {
    for (final f in ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      final xml = File('$_res/mipmap-anydpi-v26/$f').readAsStringSync();
      for (final layer in ['background', 'foreground', 'monochrome']) {
        final m = RegExp('<$layer android:drawable="@drawable/([a-z_]+)"').firstMatch(xml);
        expect(m, isNotNull, reason: '$f $layer');
        expect(File('$_res/drawable/${m!.group(1)}.xml').existsSync(), isTrue);
      }
    }
    final pngs = Directory(_res).listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.png'));
    expect(pngs.map((f) => f.path), isEmpty);
    expect(File('android/app/src/main/AndroidManifest.xml').readAsStringSync(), contains('android:icon="@mipmap/ic_launcher"'));
  });

  test('native splash colours equal the Flutter background tokens (no flash)', () {
    String bg(String dir) => RegExp(r'name="nirapod_window_bg">(#[0-9A-F]{8})<')
        .firstMatch(File('$_res/$dir/colors.xml').readAsStringSync())!
        .group(1)!;
    expect(bg('values'), _hex(LightColors.background.toARGB32()));
    expect(bg('values-night'), _hex(DarkColors.background.toARGB32()));
    for (final dir in ['values', 'values-night', 'values-v31', 'values-night-v31']) {
      final s = File('$_res/$dir/styles.xml').readAsStringSync();
      expect(s, contains('<item name="android:windowBackground">@color/nirapod_window_bg</item>'), reason: '$dir NormalTheme');
      if (dir.endsWith('v31')) {
        expect(s, contains('android:windowSplashScreenBackground">@color/nirapod_window_bg'), reason: dir);
        expect(s, contains('android:windowSplashScreenAnimatedIcon">@drawable/splash_icon'), reason: dir);
      }
    }
  });
}
