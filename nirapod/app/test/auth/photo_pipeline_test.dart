import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:nirapod/features/auth/photo/photo_pipeline.dart';

Uint8List _noisyJpeg(int w, int h, {int? orientation}) {
  final im = img.Image(width: w, height: h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      // Busy pattern so the JPEG is large before re-encoding.
      im.setPixelRgb(x, y, (x * 7 + y * 13) % 256, (x * x + y) % 256, (x ^ y) % 256);
    }
  }
  if (orientation != null) {
    im.exif.imageIfd['Orientation'] = orientation;
    im.exif.imageIfd['Make'] = 'TestCam';
  }
  return img.encodeJpg(im, quality: 95);
}

void main() {
  group('input checks (type by magic bytes, max 10 MB)', () {
    test('accepted types', () {
      expect(sniffImageType(Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0])), PhotoType.jpeg);
      expect(sniffImageType(Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), PhotoType.png);
      expect(sniffImageType(Uint8List.fromList('RIFF\x00\x00\x00\x00WEBP'.codeUnits)), PhotoType.webp);
      expect(sniffImageType(Uint8List.fromList('\x00\x00\x00\x18ftypheic'.codeUnits)), PhotoType.heic);
      expect(sniffImageType(Uint8List.fromList('GIF89a......'.codeUnits)), isNull);
      expect(sniffImageType(Uint8List.fromList('%PDF-1.7....'.codeUnits)), isNull);
    });

    test('size and type messages', () {
      final jpegHead = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0]);
      expect(validatePhotoInput(length: 3 * 1024 * 1024, head: jpegHead), isNull);
      expect(validatePhotoInput(length: PhotoLimits.maxInputBytes, head: jpegHead), isNull);
      expect(validatePhotoInput(length: PhotoLimits.maxInputBytes + 1, head: jpegHead), 'profile.photo_too_big');
      expect(validatePhotoInput(length: 1000, head: Uint8List.fromList('GIF89a'.codeUnits)), 'profile.photo_type');
      expect(validatePhotoInput(length: 0, head: Uint8List(0)), 'profile.photo_type');
    });
  });

  group('crop math', () {
    test('centered at scale 1 crops the middle square', () {
      const image = Size(2000, 1000);
      const vp = 300.0;
      // child is 600x300; centered translation -150
      final m = Matrix4.translationValues(-150, 0, 0);
      final r = cropRectFor(image: image, viewport: vp, matrix: m);
      expect(r.left, closeTo(500, 0.01));
      expect(r.top, closeTo(0, 0.01));
      expect(r.width, closeTo(1000, 0.01));
      expect(r.height, r.width);
    });

    test('zoom 2x and drag', () {
      const image = Size(1000, 1000);
      const vp = 250.0; // k = 0.25 dp per px
      final m = Matrix4.identity()
        ..translateByDouble(-100.0, -50.0, 0, 1)
        ..scaleByDouble(2.0, 2.0, 1, 1);
      final r = cropRectFor(image: image, viewport: vp, matrix: m);
      expect(r.width, closeTo(500, 0.01));
      expect(r.left, closeTo(200, 0.01));
      expect(r.top, closeTo(100, 0.01));
    });

    test('never leaves the image', () {
      const image = Size(800, 600);
      final m = Matrix4.translationValues(5000, -5000, 0);
      final r = cropRectFor(image: image, viewport: 300, matrix: m);
      expect(r.left, greaterThanOrEqualTo(0));
      expect(r.top, greaterThanOrEqualTo(0));
      expect(r.right, lessThanOrEqualTo(800));
      expect(r.bottom, lessThanOrEqualTo(600));
    });
  });

  group('output: 512x512 JPEG, <= 200 KB, metadata stripped, EXIF rotation applied', () {
    test('cropAndEncode', () {
      final src = _noisyJpeg(1600, 1200, orientation: 1);
      expect(jpegHasMetadata(src), isTrue, reason: 'fixture carries EXIF');
      final upright = uprightWithDart(src);
      final out = cropAndEncode(upright, centerSquare(const Size(1600, 1200)));
      final d = img.decodeJpg(out)!;
      expect([d.width, d.height], [512, 512]);
      expect(out.length, lessThanOrEqualTo(PhotoLimits.maxOutputBytes));
      expect(jpegHasMetadata(out), isFalse);
      expect(d.exif.isEmpty, isTrue);
    });

    test('EXIF orientation 6 (rotated 90) becomes upright', () {
      final src = _noisyJpeg(400, 200, orientation: 6);
      final upright = img.decodeJpg(uprightWithDart(src))!;
      expect([upright.width, upright.height], [200, 400]);
      expect(jpegHasMetadata(uprightWithDart(src)), isFalse);
    });

    test('large photos are limited to the working size first', () {
      final src = _noisyJpeg(3000, 1000);
      final upright = img.decodeJpg(uprightWithDart(src))!;
      expect(upright.width, PhotoLimits.workingSide);
    });

    test('small photos are scaled up to 512', () {
      final out = cropAndEncode(_noisyJpeg(200, 200), const Rect.fromLTWH(0, 0, 200, 200));
      final d = img.decodeJpg(out)!;
      expect([d.width, d.height], [512, 512]);
    });

    test('unreadable data fails cleanly', () {
      expect(() => uprightWithDart(Uint8List.fromList([1, 2, 3, 4])), throwsFormatException);
    });
  });
}
