import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/family/data/sharing.dart';
import '../../features/onboarding/data/permission_gateway.dart';
import '../i18n/strings.dart';
import '../icons/app_icon.dart';
import '../icons/app_icons.g.dart';
import '../state/buttons.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';

/// Current state of one permission; re-read when the app comes back to the foreground (the user may have
/// changed it in Settings).
final permissionStatusProvider = FutureProvider.family<PermResult, OnbPermission>((ref, p) async {
  final listener = AppLifecycleListener(onResume: () => ref.invalidateSelf());
  ref.onDispose(listener.dispose);
  return ref.read(permissionGatewayProvider).status(p);
});

/// "Allow where it is needed": a card shown on the screen that needs a permission the user skipped during
/// onboarding. Allow -> the real system dialog; blocked -> Open Settings. Hidden once granted.
class PermissionNeededCard extends ConsumerWidget {
  const PermissionNeededCard({super.key, required this.permission, required this.strings, this.critical = false});
  final OnbPermission permission;
  final Strings strings;

  /// Red styling (child phone without background location: the family cannot see them).
  final bool critical;

  (String, String, String) get _texts => switch (permission) {
        OnbPermission.locationWhenInUse => ('permneed.location_title', 'permneed.location_body', AppIcons.locationPin),
        OnbPermission.locationAlways => ('permneed.always_title', 'permneed.always_body', AppIcons.locationPin),
        OnbPermission.notification => ('permneed.notif_title', 'permneed.notif_body', AppIcons.bell),
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(permissionStatusProvider(permission)).value;
    if (st == null || st.isGranted) return const SizedBox.shrink();
    final s = strings;
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final (title, body, icon) = _texts;
    final tone = critical ? c.danger : c.warning;
    final blocked = st == PermResult.permanentlyDenied;
    final gw = ref.read(permissionGatewayProvider);
    return Semantics(
      container: true,
      child: Container(
        key: Key('perm_need_${permission.name}'),
        margin: const EdgeInsets.only(bottom: Space.sm),
        padding: const EdgeInsets.all(Space.sm),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(Radii.card),
          border: Border.all(color: tone.withValues(alpha: 0.45)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: tone.withValues(alpha: 0.18), shape: BoxShape.circle),
            child: AppIcon(icon, size: 20, color: critical ? c.dangerText : c.warningText),
          ),
          const SizedBox(width: Space.sm),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.t(title), style: t.titleMedium),
              const SizedBox(height: 2),
              Text(s.t(blocked ? 'permneed.blocked' : body), style: t.bodySmall),
              const SizedBox(height: Space.xs),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: AppButton(
                  key: Key('perm_need_allow_${permission.name}'),
                  label: s.t(blocked ? 'permneed.open_settings' : 'permneed.allow'),
                  kind: critical ? ButtonKind.danger : ButtonKind.primary,
                  onPressed: () async {
                    if (blocked) {
                      await gw.openSettings();
                    } else {
                      // "All the time" needs "while in use" first on Android 10+.
                      if (permission == OnbPermission.locationAlways &&
                          !(await gw.status(OnbPermission.locationWhenInUse)).isGranted) {
                        await gw.request(OnbPermission.locationWhenInUse);
                      }
                      final r = await gw.request(permission);
                      if (r.isGranted && permission != OnbPermission.notification) {
                        unawaited(ref.read(childTrackingProvider).ensureStarted());
                      }
                    }
                    ref.invalidate(permissionStatusProvider(permission));
                  },
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
