import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/log/log.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import 'crop_screen.dart';
import 'photo_pipeline.dart';

enum PhotoAction { camera, gallery, google, remove }

/// Bottom sheet "Profile photo" (overlay photo_source). Strings come from the `profile_setup` screen set.
Future<PhotoAction?> showPhotoSourceSheet(
  BuildContext context,
  Strings s, {
  required bool canUseGoogle,
  required bool canRemove,
}) {
  return showModalBottomSheet<PhotoAction>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, 0, Space.screenHorizontal, Space.xs),
              child: Semantics(header: true, child: Text(s.t('profile.photo_title'), style: Theme.of(ctx).textTheme.titleMedium)),
            ),
            _row(ctx, AppIcons.camera, s.t('profile.photo_take'), PhotoAction.camera),
            _row(ctx, AppIcons.image, s.t('profile.photo_gallery'), PhotoAction.gallery),
            if (canUseGoogle) _row(ctx, AppIcons.user, s.t('profile.photo_google'), PhotoAction.google),
            if (canRemove) _row(ctx, AppIcons.close, s.t('profile.photo_remove'), PhotoAction.remove, danger: true),
            const SizedBox(height: Space.xs),
          ],
        ),
      ),
    ),
  );
}

Widget _row(BuildContext context, String icon, String label, PhotoAction a, {bool danger = false}) {
  final c = context.colors;
  final color = danger ? c.dangerText : c.text;
  return Semantics(
    button: true,
    label: label,
    excludeSemantics: true,
    child: InkWell(
      onTap: () => Navigator.of(context).pop(a),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: Sizes.bottomSheetRow),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal, vertical: Space.xs),
          child: Row(children: [
            AppIcon(icon, color: color),
            const SizedBox(width: Space.md),
            Expanded(child: Text(label, style: Theme.of(context).textTheme.bodyLarge!.copyWith(color: color))),
          ]),
        ),
      ),
    ),
  );
}

/// Outcome of picking + cropping.
sealed class PickResult {
  const PickResult();
}

class PickCancelled extends PickResult {
  const PickCancelled();
}

class PickFailed extends PickResult {
  const PickFailed(this.messageKey);
  final String messageKey;
}

class PickDone extends PickResult {
  const PickDone(this.jpeg);
  final Uint8List jpeg;
}

/// Picker used by the flow (overridable in tests).
typedef ImageSourcePicker = Future<XFile?> Function(ImageSource source);

Future<XFile?> systemPicker(ImageSource source) =>
    // Camera = system camera intent; gallery = system photo picker. No CAMERA or storage permission.
    ImagePicker().pickImage(source: source, requestFullMetadata: false);

/// Checks type + size, applies EXIF rotation and lets the user crop (circular, pinch-zoom and drag).
Future<PickResult> pickAndCrop(BuildContext context, Strings s, ImageSource source, {ImageSourcePicker picker = systemPicker}) async {
  XFile? file;
  try {
    file = await picker(source);
  } catch (e) {
    Log.warn('photo', 'picker failed: ${e.runtimeType}');
    return const PickFailed('profile.photo_denied');
  }
  if (file == null) return const PickCancelled();
  try {
    final length = await file.length();
    final head = await _head(file);
    final invalid = validatePhotoInput(length: length, head: head);
    if (invalid != null) return PickFailed(invalid);
    final upright = await makeUpright(await file.readAsBytes());
    if (!context.mounted) return const PickCancelled();
    final out = await Navigator.of(context).push<Uint8List>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => CropScreen(image: upright, strings: s)),
    );
    return out == null ? const PickCancelled() : PickDone(out);
  } catch (e) {
    Log.warn('photo', 'process failed: ${e.runtimeType}');
    return const PickFailed('profile.photo_error_read');
  }
}

Future<Uint8List> _head(XFile f) async {
  final b = BytesBuilder();
  await for (final chunk in f.openRead(0, 32)) {
    b.add(chunk);
  }
  return b.takeBytes();
}

/// Downloads the Google profile picture and center-crops it to the same 512x512 JPEG.
Future<PickResult> googlePhoto(String url) async {
  try {
    // Ask Google for a larger picture than the default thumbnail.
    final big = url.replaceAll(RegExp(r'=s\d+(-c)?$'), '=s1024-c');
    final res = await Dio().get<List<int>>(big, options: Options(responseType: ResponseType.bytes, receiveTimeout: const Duration(seconds: 15)));
    final bytes = Uint8List.fromList(res.data ?? const []);
    final invalid = validatePhotoInput(length: bytes.length, head: bytes.length > 32 ? bytes.sublist(0, 32) : bytes);
    if (invalid != null) return PickFailed(invalid);
    final upright = await makeUpright(bytes);
    final size = await imageSizeOf(upright);
    return PickDone(await cropAndEncodeAsync(upright, centerSquare(size)));
  } catch (e) {
    Log.warn('photo', 'google photo failed: ${e.runtimeType}');
    return const PickFailed('profile.photo_error_read');
  }
}
