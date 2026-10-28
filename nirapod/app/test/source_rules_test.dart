import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

Iterable<File> dartFiles() => Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'));

void main() {
  test('no icon fonts or Material Icons in app code (all icons are SVG)', () {
    for (final f in dartFiles()) {
      final src = f.readAsStringSync();
      expect(RegExp(r'\bIcons\.\w').hasMatch(src), isFalse, reason: f.path);
      expect(RegExp(r'\bCupertinoIcons\.').hasMatch(src), isFalse, reason: f.path);
    }
  });

  test('no PNG/JPG/GIF assets for icons, flags, logo or illustrations', () {
    final raster = Directory('assets').listSync(recursive: true).whereType<File>()
        .where((f) => RegExp(r'\.(png|jpe?g|gif|webp)$', caseSensitive: false).hasMatch(f.path));
    expect(raster.map((f) => f.path), isEmpty);
    for (final d in ['assets/icons', 'assets/brand', 'assets/flags/1x1', 'assets/flags/4x3']) {
      expect(Directory(d).listSync().whereType<File>().every((f) => f.path.endsWith('.svg')), isTrue, reason: d);
    }
  });

  test('no print(), no cleartext http URLs, no emoji in app code', () {
    final emoji = RegExp(r'[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]', unicode: true);
    for (final f in dartFiles()) {
      final src = f.readAsStringSync();
      expect(RegExp(r'(^|[^.\w])print\(').hasMatch(src), isFalse, reason: f.path);
      expect(src.contains('http://'), isFalse, reason: f.path);
      expect(emoji.hasMatch(src), isFalse, reason: f.path);
    }
  });

  test('animations use durations, never frame counts', () {
    for (final f in dartFiles()) {
      final src = f.readAsStringSync();
      expect(RegExp(r'frameCount|frames\s*[+-]=|\+\+frame').hasMatch(src), isFalse, reason: f.path);
    }
  });
}
