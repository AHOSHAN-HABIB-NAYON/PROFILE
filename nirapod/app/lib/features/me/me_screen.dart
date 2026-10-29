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
    Widget row(String icon, String title, {String? sub, VoidCallback? onTap, Color? color}) => ListTile(
          leading: AppIcon(icon, color: color ?? c.primaryText),
          title: Text(title, style: color == null ? null : TextStyle(color: color)),
          subtitle: sub == null ? null : Text(sub),
          trailing: onTap == null ? null : AppIcon(AppIcons.chevronRight, color: c.muted),
          onTap: onTap,
        );
    return Scaffold(
      appBar: AppBar(title: Text(s.t('me.title')), backgroundColor: c.background),
      body: ListView(padding: const EdgeInsets.symmetric(vertical: Space.md), children: [
        Center(child: RingAvatar(size: 112, url: u.avatarUrl ?? u.avatarThumbUrl, initials: initialsOf(u.name))),
        const SizedBox(height: Space.sm),
        Center(child: Text(u.name ?? '', style: t.headlineSmall, textAlign: TextAlign.center)),
        Center(
          child: Container(
            margin: const EdgeInsets.only(top: Space.xxs),
            padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: 2),
            decoration: BoxDecoration(color: c.accent.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(Radii.pill)),
            child: Text(role, style: t.labelMedium!.copyWith(color: c.primaryText)),
          ),
        ),
        const SizedBox(height: Space.md),
        row(AppIcons.user, s.t('me.edit_profile'), onTap: () => context.push(locationFor('profile_setup'))),
        if (u.email != null)
          row(AppIcons.message, s.t('me.email'), sub: '${u.email}${u.emailVerified ? '  ·  ${s.t('me.verified')}' : ''}'),
        row(AppIcons.lock, s.t('me.sign_in_method'), sub: u.authProvider == 'google' ? s.t('me.method_google') : s.t('me.method_email')),
        if (u.authProvider == 'email') row(AppIcons.lock, s.t('me.change_password'), onTap: () => context.push(locationFor('forgot_email'))),
        row(AppIcons.settings, s.t('me.devices'), onTap: () => context.push(locationFor('sessions'))),
        row(AppIcons.history, s.t('me.download'), onTap: () => context.push(locationFor('data_export'))),
        row(AppIcons.alertCircle, s.t('me.delete'), color: c.dangerText, onTap: () => context.push(locationFor('delete_account'))),
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
