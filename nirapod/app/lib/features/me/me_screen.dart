import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/session/session.dart';
import '../../core/state/buttons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../nav/router.dart';
import '../home/widgets/dialogs.dart';
import '../home/widgets/header_buttons.dart';
import '../settings/settings_screens.dart' show SettingsGroup, SettingsRow;

/// Profile page: avatar, name, email (verified), sign-in method, role badge, edit profile (photo, name,
/// country, time zone via Profile setup), password, devices and sessions, data export, delete, Log out.
class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('me'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final session = ref.watch(sessionControllerProvider);
    if (session is! SignedIn) return const Scaffold(body: SizedBox());
    final u = session.user;
    final role = u.isOverseas
        ? s.t('me.role_overseas')
        : switch (u.role) {
            AppRole.parent => s.t('me.role_parent'),
            AppRole.guardian => s.t('me.role_guardian'),
            AppRole.child => s.t('me.role_child'),
            null => '—',
          };
    return Scaffold(
      appBar: AppBar(title: Text(s.t('me.title')), backgroundColor: c.background),
      body: ListView(padding: const EdgeInsets.only(bottom: Space.md), children: [
        // Header card: photo, name, role, email
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.md, Space.xs, Space.md, 0),
          child: Container(
            padding: const EdgeInsets.all(Space.md),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [c.primary.withValues(alpha: 0.14), c.accent.withValues(alpha: 0.08)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(Radii.cardLarge),
              border: Border.all(color: c.primary.withValues(alpha: 0.25)),
            ),
            child: Row(children: [
              InkWell(
                customBorder: const CircleBorder(),
                onTap: () => context.push(locationFor('profile_setup')),
                child: RingAvatar(size: 76, url: u.avatarUrl ?? u.avatarThumbUrl, initials: initialsOf(u.name)),
              ),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u.name ?? '', style: t.titleLarge!.copyWith(fontWeight: FontWeight.w700), maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: 2),
                    decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Radii.pill), border: Border.all(color: c.border)),
                    child: Text(role, style: t.labelMedium!.copyWith(color: c.primaryText)),
                  ),
                  if (u.email != null) ...[
                    const SizedBox(height: 6),
                    Row(children: [
                      Flexible(child: Text(u.email!, style: t.bodySmall!.copyWith(color: c.muted), maxLines: 1, overflow: TextOverflow.ellipsis)),
                      if (u.emailVerified) ...[const SizedBox(width: 4), AppIcon(AppIcons.checkCircle, size: 14, color: c.successText)],
                    ]),
                  ],
                ]),
              ),
            ]),
          ),
        ),
        SettingsGroup(title: s.t('me.account'), children: [
          SettingsRow(icon: AppIcons.user, title: s.t('me.edit_profile'), onTap: () => context.push(locationFor('profile_setup'))),
          SettingsRow(icon: AppIcons.shieldCheck, title: s.t('me.sign_in_method'), subtitle: u.authProvider == 'google' ? s.t('me.method_google') : s.t('me.method_email')),
          if (u.authProvider == 'email') SettingsRow(icon: AppIcons.lock, title: s.t('me.change_password'), onTap: () => context.push(locationFor('change_password'))),
          SettingsRow(icon: AppIcons.phone, title: s.t('me.devices'), onTap: () => context.push(locationFor('sessions'))),
        ]),
        SettingsGroup(title: s.t('me.your_data'), children: [
          SettingsRow(icon: AppIcons.history, title: s.t('me.download'), onTap: () => context.push(locationFor('data_export'))),
          SettingsRow(icon: AppIcons.alertCircle, title: s.t('me.delete'), danger: true, onTap: () => context.push(locationFor('delete_account'))),
        ]),
        Padding(
          padding: const EdgeInsets.all(Space.screenHorizontal),
          child: AppButton(
            label: s.t('me.logout'),
            kind: ButtonKind.secondary,
            onPressed: () async {
              if (!await showLogoutSheet(context, s)) return;
              await ref.read(sessionControllerProvider.notifier).signOut();
              if (context.mounted) context.go(locationFor('welcome'));
            },
          ),
        ),
      ]),
    );
  }
}
