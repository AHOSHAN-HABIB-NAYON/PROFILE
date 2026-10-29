import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/net/api_error.dart';
import '../../../core/session/session.dart';
import '../../../core/state/buttons.dart';
import '../../../core/state/skeleton.dart';
import '../../../core/state/state_views.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/widgets/fields.dart';
import '../../../nav/router.dart';
import '../../home/widgets/header_buttons.dart';
import '../data/family_models.dart';
import '../data/family_repo.dart';

/// Family: members (owner badge), my sharing (consent, pause, stop), add child, invite adult (overseas),
/// transfer ownership, leave, report misuse.
class FamilyScreen extends ConsumerWidget {
  const FamilyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('family'));
    final c = context.colors;
    final session = ref.watch(sessionControllerProvider);
    final me = session is SignedIn ? session.user : null;
    final async = ref.watch(familyProvider);
    return Scaffold(
      appBar: AppBar(title: Text(s.t('family.title')), backgroundColor: c.background),
      body: switch (async) {
        AsyncData(:final value?) => () {
            final f = value;
            final mine = f.member(me?.id ?? '');
            final adult = mine?.isAdult ?? false;
            final owner = f.ownerMemberId == me?.id;
            return ListView(padding: const EdgeInsets.all(Space.screenHorizontal), children: [
              if (mine != null && adult) _SharingControl(family: f, me: mine, strings: s),
              const SizedBox(height: Space.sm),
              for (final m in f.members)
                Card(
                  child: ListTile(
                    leading: RingAvatar(size: 44, url: m.avatarThumbUrl, initials: initialsOf(m.name)),
                    title: Text(m.name),
                    subtitle: Text([
                      switch (m.role) { 'child' => s.t('home.role_child'), 'parent' => s.t('home.role_parent'), _ => s.t('home.role_guardian') },
                      if (m.isOverseas) s.t('home.overseas'),
                      if (m.id == f.ownerMemberId) s.t('family.owner'),
                    ].join(' · ')),
                    trailing: AppIcon(AppIcons.chevronRight, color: c.muted),
                    onTap: () => context.push(locationFor('member', param: m.id)),
                  ),
                ),
              const SizedBox(height: Space.sm),
              if (adult) ...[
                AppButton(label: s.t('family.add_child'), onPressed: () => context.push(locationFor('child_code_generate'))),
                const SizedBox(height: Space.xs),
                AppButton(label: s.t('family.invite_adult'), kind: ButtonKind.secondary, onPressed: () => showInviteSheet(context, ref, f, s)),
              ],
              if (owner && f.members.any((m) => m.isAdult && m.id != me?.id))
                TextButton(onPressed: () => _transfer(context, ref, f, s, me!.id), child: Text(s.t('family.transfer'))),
              if (adult) TextButton(onPressed: () => _leave(context, ref, f, s, me!.id), child: Text(s.t('family.leave'), style: TextStyle(color: c.dangerText))),
              const Divider(),
              ListTile(
                leading: AppIcon(AppIcons.shield, color: c.primaryText),
                title: Text(s.t('family.report')),
                onTap: () => context.push(locationFor('report_misuse')),
              ),
            ]);
          }(),
        AsyncData() => MessageView(icon: AppIcons.users, title: s.t('home.empty_parent_title'), body: s.t('home.empty_parent_body')),
        AsyncError() => MessageView(
            icon: AppIcons.alertCircle,
            title: s.t('state.error_title'),
            body: s.t('err.network'),
            action: AppButton(label: s.t('common.retry'), onPressed: () => ref.invalidate(familyProvider)),
          ),
        _ => const Padding(padding: EdgeInsets.all(Space.screenHorizontal), child: SkeletonList()),
      },
    );
  }

  Future<void> _transfer(BuildContext context, WidgetRef ref, Family f, Strings s, String myId) async {
    final target = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          Padding(padding: const EdgeInsets.all(Space.screenHorizontal), child: Text(s.t('family.transfer_pick'), style: Theme.of(ctx).textTheme.titleMedium)),
          for (final m in f.members.where((m) => m.isAdult && m.id != myId))
            ListTile(title: Text(m.name), onTap: () => Navigator.pop(ctx, m.id)),
        ]),
      ),
    );
    if (target == null) return;
    try {
      await ref.read(familyRepoProvider).transfer(f.id, target);
      ref.invalidate(familyProvider);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('family.transfer_done'))));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t(ApiError.from(e).messageKey))));
    }
  }

  Future<void> _leave(BuildContext context, WidgetRef ref, Family f, Strings s, String myId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.t('family.leave_title')),
        content: Text(s.t('family.leave_body')),
        actions: [
          FilledButton(autofocus: true, onPressed: () => Navigator.pop(ctx, false), child: Text(s.t('common.stay'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.t('family.leave'), style: TextStyle(color: ctx.colors.dangerText))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(familyRepoProvider).removeMember(f.id, myId);
      await ref.read(sessionControllerProvider.notifier).refreshMe();
      ref.invalidate(familyProvider);
      if (context.mounted) context.go(locationFor('home'));
    } catch (e) {
      final err = ApiError.from(e);
      final msg = err.details?['reason'] == 'owner_must_transfer' ? s.t('family.err_transfer_first') : s.t(err.messageKey);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }
}

class _SharingControl extends ConsumerWidget {
  const _SharingControl({required this.family, required this.me, required this.strings});
  final Family family;
  final FamilyMember me;
  final Strings strings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = strings;
    final t = Theme.of(context).textTheme;
    final c = context.colors;
    final st = me.sharingStatus;
    Future<void> set(String v) async {
      try {
        await ref.read(familyRepoProvider).patchMember(family.id, me.id, {'sharing_status': v});
        ref.invalidate(familyProvider);
      } catch (e) {
        if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t(ApiError.from(e).messageKey))));
      }
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Space.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.t('family.my_sharing'), style: t.titleMedium),
          const SizedBox(height: Space.xxs),
          Row(children: [
            AppIcon(st == 'active' ? AppIcons.locationPinFilled : AppIcons.lock, size: 18, color: st == 'active' ? c.successText : c.muted),
            const SizedBox(width: Space.xxs),
            Expanded(
              child: Text(switch (st) {
                'active' => s.t('family.sharing_active'),
                'paused' => s.t('family.sharing_paused'),
                'stopped' => s.t('family.sharing_stopped'),
                _ => s.t('family.sharing_pending'),
              }, style: t.bodyMedium),
            ),
          ]),
          const SizedBox(height: Space.sm),
          Wrap(spacing: Space.xs, runSpacing: Space.xs, children: [
            if (st != 'active') FilledButton(onPressed: () => set('active'), child: Text(s.t('family.share'))),
            if (st == 'active') OutlinedButton(onPressed: () => set('paused'), child: Text(s.t('family.pause'))),
            if (st == 'active' || st == 'paused') TextButton(onPressed: () => set('stopped'), child: Text(s.t('family.stop'))),
          ]),
        ]),
      ),
    );
  }
}

Future<void> showInviteSheet(BuildContext context, WidgetRef ref, Family f, Strings s) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: _InviteSheet(family: f, strings: s),
      ),
    );

class _InviteSheet extends ConsumerStatefulWidget {
  const _InviteSheet({required this.family, required this.strings});
  final Family family;
  final Strings strings;

  @override
  ConsumerState<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends ConsumerState<_InviteSheet> {
  final _email = TextEditingController();
  bool _overseas = false;
  bool _busy = false;
  Map<String, dynamic>? _result;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final t = Theme.of(context).textTheme;
    final r = _result;
    return SafeArea(
      child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(Space.screenHorizontal), children: [
        Text(s.t('family.invite_title'), style: t.headlineSmall),
        const SizedBox(height: Space.md),
        if (r == null) ...[
          AppTextField(label: s.t('family.invite_email'), controller: _email, keyboardType: TextInputType.emailAddress, icon: AppIcons.mail, error: _error),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(s.t('family.invite_overseas')), value: _overseas, onChanged: (v) => setState(() => _overseas = v)),
          const SizedBox(height: Space.sm),
          AppButton(
            label: s.t('family.invite_create'),
            loading: _busy,
            onPressed: () async {
              setState(() {
                _busy = true;
                _error = null;
              });
              try {
                final res = await ref.read(familyRepoProvider).invite(widget.family.id, email: _email.text.trim(), overseas: _overseas);
                setState(() => _result = res);
              } catch (e) {
                final err = ApiError.from(e);
                setState(() => _error = err.kind == ApiErrorKind.planLimit ? s.t('state.limit_body') : s.t(err.messageKey));
              } finally {
                if (mounted) setState(() => _busy = false);
              }
            },
          ),
        ] else ...[
          Text(s.t('family.invite_code'), style: t.labelMedium),
          const SizedBox(height: Space.xs),
          Directionality(
            textDirection: TextDirection.ltr,
            child: SelectableText(r['code'] as String, textAlign: TextAlign.center, style: t.displaySmall!.copyWith(letterSpacing: 6, fontFamily: 'Noto Sans')),
          ),
          if (r['email_sent'] == true) Padding(padding: const EdgeInsets.only(top: Space.xs), child: Text(s.t('family.invite_emailed'), style: t.bodySmall)),
          const SizedBox(height: Space.md),
          AppButton(
            label: s.t('family.invite_share'),
            onPressed: () => SharePlus.instance.share(ShareParams(text: s.t('family.invite_share_text', {'code': r['code'] as String, 'url': (r['invite_url'] as String?) ?? ''}))),
          ),
        ],
      ]),
    );
  }
}

/// Report misuse (abuse_reports).
class ReportMisuseScreen extends ConsumerStatefulWidget {
  const ReportMisuseScreen({super.key});

  @override
  ConsumerState<ReportMisuseScreen> createState() => _ReportMisuseScreenState();
}

class _ReportMisuseScreenState extends ConsumerState<ReportMisuseScreen> {
  String _cat = 'covert_tracking';
  final _details = TextEditingController();
  bool _busy = false;
  bool _sent = false;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('family'));
    final c = context.colors;
    const cats = {
      'covert_tracking': 'family.report_covert',
      'harassment': 'family.report_harassment',
      'unwanted_sharing': 'family.report_unwanted',
      'other': 'family.report_other',
    };
    return Scaffold(
      appBar: AppBar(title: Text(s.t('family.report_title')), backgroundColor: c.background),
      body: _sent
          ? MessageView(icon: AppIcons.checkCircle, title: s.t('family.report_sent'))
          : ListView(padding: const EdgeInsets.all(Space.screenHorizontal), children: [
              Text(s.t('family.report_body')),
              const SizedBox(height: Space.sm),
              RadioGroup<String>(
                groupValue: _cat,
                onChanged: (v) => setState(() => _cat = v ?? _cat),
                child: Column(children: [
                  for (final e in cats.entries) RadioListTile<String>(value: e.key, title: Text(s.t(e.value)), contentPadding: EdgeInsets.zero),
                ]),
              ),
              AppTextField(label: s.t('family.report_details'), controller: _details),
              const SizedBox(height: Space.md),
              AppButton(
                label: s.t('family.report_send'),
                loading: _busy,
                onPressed: () async {
                  setState(() => _busy = true);
                  try {
                    await ref.read(familyRepoProvider).report(_cat, details: _details.text);
                    setState(() => _sent = true);
                  } catch (e) {
                    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t(ApiError.from(e).messageKey))));
                  } finally {
                    if (mounted) setState(() => _busy = false);
                  }
                },
              ),
            ]),
    );
  }
}
