import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/i18n/strings.dart';
import 'photo_controller.dart';
import 'photo_sheet.dart';

final imageSourcePickerProvider = Provider<ImageSourcePicker>((ref) => systemPicker);

/// Avatar tap: sheet -> camera / gallery / Google photo / remove -> crop -> preview -> upload.
/// [upload] false keeps the photo local (child before joining). Problems show as a snackbar and never
/// block the screen.
Future<void> runPhotoFlow(
  BuildContext context,
  WidgetRef ref,
  Strings s, {
  String? googlePhotoUrl,
  required bool canRemove,
  bool upload = true,
}) async {
  final action = await showPhotoSourceSheet(context, s, canUseGoogle: googlePhotoUrl != null, canRemove: canRemove);
  if (action == null || !context.mounted) return;
  final ctl = ref.read(photoControllerProvider.notifier);
  if (action == PhotoAction.remove) {
    if (upload) {
      unawaited(ctl.remove());
    } else {
      ctl.skip();
    }
    return;
  }
  final picker = ref.read(imageSourcePickerProvider);
  final PickResult r;
  if (action == PhotoAction.google) {
    r = await googlePhoto(googlePhotoUrl!);
  } else {
    r = await pickAndCrop(context, s, action == PhotoAction.camera ? ImageSource.camera : ImageSource.gallery, picker: picker);
  }
  if (!context.mounted) return;
  switch (r) {
    case PickDone(:final jpeg):
      unawaited(ctl.setPhoto(jpeg, upload: upload));
    case PickFailed(:final messageKey):
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s.t(messageKey))));
    case PickCancelled():
      break;
  }
}
