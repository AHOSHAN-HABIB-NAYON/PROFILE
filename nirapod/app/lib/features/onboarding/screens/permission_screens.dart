import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../nav/router.dart';
import '../data/permission_gateway.dart';
import '../demos/how_location_demo.dart';
import '../demos/location_map_demo.dart';
import '../demos/notifications_demo.dart';
import '../onboarding_flow.dart';
import '../widgets/permission_page.dart';
import 'permission_step.dart';

/// Marks [pageId] finished and opens [nextId].
Future<void> _next(BuildContext context, WidgetRef ref, String pageId, String nextId) async {
  await ref.read(onboardingProgressProvider).completePage(pageId);
  if (context.mounted) unawaited(context.push(locationFor(nextId)));
}

/// Permission page 1: notifications (POST_NOTIFICATIONS on Android 13+; older Android reports granted).
class PermNotificationsScreen extends ConsumerStatefulWidget {
  const PermNotificationsScreen({super.key});

  @override
  ConsumerState<PermNotificationsScreen> createState() => _PermNotificationsState();
}

class _PermNotificationsState extends PermissionStepState<PermNotificationsScreen> {
  @override
  OnbPermission get permission => OnbPermission.notification;

  @override
  Future<void> advance() => _next(context, ref, 'perm_notifications', 'perm_how_location');

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('permissions'));
    return PermissionPageScaffold(
      progress: StepProgress(strings: s, current: 1),
      demo: NotificationsDemo(strings: s),
      title: s.t('perm.notif_title'),
      body: s.t('perm.notif_body'),
      extra: [
        if (showDenied)
          DeniedPanel(
            title: s.t('perm.denied_title'),
            body: s.t('perm.denied_notif'),
            settingsLabel: s.t('common.open_settings'),
            onOpenSettings: openSettings,
          )
        else if (granted)
          GrantedNote(label: s.t('perm.already_allowed')),
      ],
      primaryLabel: s.t('perm.allow'),
      onPrimary: onContinue,
      busy: busy,
      notNowLabel: showDenied ? null : s.t('common.not_now'),
      onNotNow: advance,
    );
  }
}

/// Permission page 2: how location works (story only, no system dialog).
class PermHowLocationScreen extends ConsumerWidget {
  const PermHowLocationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('permissions'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    Widget point(String icon, String text) => Padding(
          padding: const EdgeInsets.only(bottom: Space.xs),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AppIcon(icon, size: 22, color: c.primaryText),
            const SizedBox(width: Space.sm),
            Expanded(child: Text(text, style: t.bodyMedium)),
          ]),
        );
    void go() => _next(context, ref, 'perm_how_location', 'perm_location');
    return PermissionPageScaffold(
      progress: StepProgress(strings: s, current: 2),
      demo: HowLocationDemo(strings: s),
      title: s.t('perm.how_title'),
      body: s.t('perm.how_body'),
      extra: [
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          point(AppIcons.locationPin, s.t('perm.how_point_live')),
          point(AppIcons.bell, s.t('perm.how_point_alerts')),
          point(AppIcons.shieldCheck, s.t('perm.how_point_control')),
        ]),
        Container(
          padding: const EdgeInsets.all(Space.md),
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: BorderRadius.circular(Radii.card),
            border: Border.all(color: c.border),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            point(AppIcons.users, s.t('perm.how_who')),
            point(AppIcons.lock, s.t('perm.how_stop')),
          ]),
        ),
      ],
      primaryLabel: s.t('common.continue'),
      onPrimary: go,
      notNowLabel: s.t('common.not_now'),
      onNotNow: go,
    );
  }
}

/// Permission page 3: location while using the app (system precise-location dialog).
class PermLocationScreen extends ConsumerStatefulWidget {
  const PermLocationScreen({super.key});

  @override
  ConsumerState<PermLocationScreen> createState() => _PermLocationState();
}

class _PermLocationState extends PermissionStepState<PermLocationScreen> {
  @override
  OnbPermission get permission => OnbPermission.locationWhenInUse;

  @override
  Future<void> advance() => _next(context, ref, 'perm_location', 'role');

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('permissions'));
    return PermissionPageScaffold(
      progress: StepProgress(strings: s, current: 3),
      demo: LocationMapDemo(strings: s),
      title: s.t('perm.loc_title'),
      body: s.t('perm.loc_body'),
      extra: [
        if (showDenied)
          DeniedPanel(
            title: s.t('perm.denied_title'),
            body: s.t('perm.denied_location'),
            settingsLabel: s.t('common.open_settings'),
            onOpenSettings: openSettings,
          )
        else if (granted)
          GrantedNote(label: s.t('perm.already_allowed')),
      ],
      primaryLabel: s.t('perm.allow'),
      onPrimary: onContinue,
      busy: busy,
      notNowLabel: showDenied ? null : s.t('common.not_now'),
      onNotNow: advance,
    );
  }
}
