import 'package:flutter/material.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';

/// "Exit app?" with Stay (default) and Exit. Child devices: "Location sharing keeps running".
Future<bool> showExitDialog(BuildContext context, Strings s, {required bool child}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: ctx.colors.surface,
      title: Text(s.t('dialog.exit_title')),
      content: Text(child ? s.t('dialog.exit_body_child') : s.t('dialog.exit_body')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.t('common.exit'), style: TextStyle(color: ctx.colors.text))),
        FilledButton(autofocus: true, onPressed: () => Navigator.pop(ctx, false), child: Text(s.t('common.stay'))),
      ],
    ),
  );
  return r ?? false;
}

/// "Log out?" sheet: Stay (primary, default focus) and Log out (danger outline).
Future<bool> showLogoutSheet(BuildContext context, Strings s) async {
  final r = await showModalBottomSheet<bool>(
    context: context,
    builder: (ctx) {
      final c = ctx.colors;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, 0, Space.screenHorizontal, Space.lg),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(s.t('dialog.logout_title'), style: Theme.of(ctx).textTheme.headlineSmall),
            const SizedBox(height: Space.xs),
            Text(s.t('dialog.logout_body'), style: Theme.of(ctx).textTheme.bodyMedium),
            const SizedBox(height: Space.lg),
            Focus(autofocus: true, child: AppButton(label: s.t('common.stay'), onPressed: () => Navigator.pop(ctx, false))),
            const SizedBox(height: Space.xs),
            OutlinedButton(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(Sizes.minTouchTarget),
                side: BorderSide(color: c.danger),
                foregroundColor: c.dangerText,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.input)),
              ),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(s.t('dialog.logout_confirm')),
            ),
          ]),
        ),
      );
    },
  );
  return r ?? false;
}
