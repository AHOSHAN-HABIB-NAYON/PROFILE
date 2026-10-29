import 'dart:isolate';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image/image.dart' as img;
import 'package:flutter/widgets.dart' show Matrix4, Rect, Size;

/// Client side of the photo pipeline (spec Phase 1 item 7):
/// accept JPEG/PNG/WebP/HEIC up to 10 MB -> upright (EXIF orientation applied) -> circular crop chosen by
/// the user -> 512x512 JPEG, quality about 82, at most 200 KB, ALL metadata stripped.
abstract final class PhotoLimits {
  static const maxInputBytes = 10 * 1024 * 1024;
  static const outputSide = 512;
  static const maxOutputBytes = 200 * 1024;
  static const quality = 82;

  /// Longest side used for the crop preview (keeps memory small; still > 512 after zoom 4x on a crop).
  static const workingSide = 2048;
}

enum PhotoType { jpeg, png, webp, heic }

/// Detects the type from magic bytes (never from the file name).
PhotoType? sniffImageType(Uint8List b) {
  if (b.length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return PhotoType.jpeg;
  if (b.length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return PhotoType.png;
  if (b.length >= 12 &&
      String.fromCharCodes(b.sublist(0, 4)) == 'RIFF' &&
      String.fromCharCodes(b.sublist(8, 12)) == 'WEBP') {
    return PhotoType.webp;
  }
  if (b.length >= 12 && String.fromCharCodes(b.sublist(4, 8)) == 'ftyp') {
    final brand = String.fromCharCodes(b.sublist(8, 12));
    if (const {'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif'}.contains(brand)) return PhotoType.heic;
  }
  return null;
}

/// Null when the file is acceptable, otherwise the i18n key of the plain-language reason.
String? validatePhotoInput({required int length, required Uint8List head}) {
  if (length > PhotoLimits.maxInputBytes) return 'profile.photo_too_big';
  if (length == 0 || sniffImageType(head) == null) return 'profile.photo_type';
  return null;
}

/// Converts any accepted input into an upright JPEG (EXIF orientation applied, metadata dropped) no
/// larger than [PhotoLimits.workingSide]. Uses the platform codec (HEIC support), falling back to
/// package:image where the plugin is not available.
Future<Uint8List> makeUpright(Uint8List input) async {
  try {
    final out = await FlutterImageCompress.compressWithList(
      input,
      minWidth: PhotoLimits.workingSide,
      minHeight: PhotoLimits.workingSide,
      quality: 92,
      autoCorrectionAngle: true,
      keepExif: false,
      format: CompressFormat.jpeg,
    );
    if (out.isNotEmpty) return await _limitSide(out);
  } catch (_) {
    // MissingPluginException (tests) or a codec failure: fall back below.
  }
  return Isolate.run(() => uprightWithDart(input));
}

Future<Uint8List> _limitSide(Uint8List jpeg) async => Isolate.run(() {
      final d = img.decodeJpg(jpeg);
      if (d == null) throw const FormatException('decode');
      if (math.max(d.width, d.height) <= PhotoLimits.workingSide) return jpeg;
      return uprightWithDart(jpeg);
    });

/// Pure-Dart upright conversion (JPEG/PNG/WebP). Throws [FormatException] if the image cannot be read.
Uint8List uprightWithDart(Uint8List input) {
  final decoded = img.decodeImage(input);
  if (decoded == null) throw const FormatException('decode');
  var im = img.bakeOrientation(decoded);
  final longest = math.max(im.width, im.height);
  if (longest > PhotoLimits.workingSide) {
    final f = PhotoLimits.workingSide / longest;
    im = img.copyResize(im, width: (im.width * f).round(), height: (im.height * f).round(), interpolation: img.Interpolation.average);
  }
  im.exif = img.ExifData();
  return img.encodeJpg(im, quality: 92);
}

/// Crop square (in image pixels) for an image shown in a square viewport of [viewport] dp with
/// BoxFit.cover sizing, transformed by an InteractiveViewer [matrix] (scale + translation).
Rect cropRectFor({required Size image, required double viewport, required Matrix4 matrix}) {
  final k = viewport / math.min(image.width, image.height); // dp per image pixel at scale 1
  final s = matrix.getMaxScaleOnAxis();
  final t = matrix.getTranslation();
  var side = viewport / s / k;
  side = math.min(side, math.min(image.width, image.height));
  var left = (-t.x / s) / k;
  var top = (-t.y / s) / k;
  left = left.clamp(0, image.width - side).toDouble();
  top = top.clamp(0, image.height - side).toDouble();
  return Rect.fromLTWH(left, top, side, side);
}

/// Center square crop (used for the Google photo, which needs no manual crop).
Rect centerSquare(Size image) {
  final side = math.min(image.width, image.height);
  return Rect.fromLTWH((image.width - side) / 2, (image.height - side) / 2, side, side);
}

/// Crops [upright] to [crop], resizes to 512x512 and encodes a metadata-free JPEG <= 200 KB.
Uint8List cropAndEncode(Uint8List upright, Rect crop) {
  final src = img.decodeImage(upright);
  if (src == null) throw const FormatException('decode');
  final int x = crop.left.round().clamp(0, src.width - 1);
  final int y = crop.top.round().clamp(0, src.height - 1);
  final int side = crop.width.round().clamp(1, math.min(src.width - x, src.height - y));
  var out = img.copyCrop(src, x: x, y: y, width: side, height: side);
  out = img.copyResize(
    out,
    width: PhotoLimits.outputSide,
    height: PhotoLimits.outputSide,
    interpolation: side > PhotoLimits.outputSide ? img.Interpolation.average : img.Interpolation.cubic,
  );
  out.exif = img.ExifData();
  out.iccProfile = null;
  out.textData = null;
  var q = PhotoLimits.quality;
  var bytes = img.encodeJpg(out, quality: q);
  while (bytes.length > PhotoLimits.maxOutputBytes && q > 40) {
    q -= 8;
    bytes = img.encodeJpg(out, quality: q);
  }
  return bytes;
}

Future<Uint8List> cropAndEncodeAsync(Uint8List upright, Rect crop) => Isolate.run(() => cropAndEncode(upright, crop));

Future<Size> imageSizeOf(Uint8List bytes) => Isolate.run(() {
      final d = img.decodeImage(bytes);
      if (d == null) throw const FormatException('decode');
      return Size(d.width.toDouble(), d.height.toDouble());
    });

/// True when a JPEG contains an APP1 Exif/XMP segment or an APP2 ICC segment (used by tests and as a
/// last safety check before upload).
bool jpegHasMetadata(Uint8List b) {
  var i = 2;
  while (i + 4 < b.length && b[i] == 0xFF) {
    final marker = b[i + 1];
    if (marker == 0xDA) break; // start of scan
    final len = (b[i + 2] << 8) | b[i + 3];
    if (marker == 0xE1 || marker == 0xE2 || marker == 0xED) return true;
    i += 2 + len;
  }
  return false;
}
