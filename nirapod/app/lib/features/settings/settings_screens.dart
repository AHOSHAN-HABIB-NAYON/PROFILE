import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/strings.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/net/api_error.dart';
import '../../core/net/providers.dart';
import '../../core/session/session.dart';
import '../../core/state/buttons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/widgets/fields.dart';
import '../../nav/router.dart';
import '../family/data/family_repo.dart';
import '../home/widgets/header_buttons.dart';
import 'app_info.dart';

/// A rounded group of rows (settings list pattern), with a small caption above it.
class SettingsGroup extends StatelessWidget {
  const SettingsGroup({super.key, required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.md, Space.md, Space.md, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.only(left: Space.xxs, bottom: Space.xs),
          child: Text(title, style: t.labelLarge!.copyWith(color: c.muted)),
        ),
        Material(
          color: c.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.card), side: BorderSide(color: c.border)),
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) Divider(height: 1, indent: 60, color: c.border),
              children[i],
            ],
          ]),
        ),
      ]),
    );
  }
}

/// One settings row: tinted icon tile, title, optional trailing widget (chevron by default).
class SettingsRow extends StatelessWidget {
  const SettingsRow({super.key, required this.icon, required this.title, this.onTap, this.trailing, this.danger = false, this.subtitle});
  final String icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final tint = danger ? c.dangerText : c.primaryText;
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: Space.xs),
          child: Row(children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: tint.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(10)),
              alignment: Alignment.center,
              child: AppIcon(icon, size: 20, color: tint),
            ),
            const SizedBox(width: Space.sm),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(title, style: t.bodyLarge!.copyWith(color: danger ? c.dangerText : null, fontWeight: FontWeight.w500)),
                if (subtitle != null) Text(subtitle!, style: t.bodySmall!.copyWith(color: c.muted)),
              ]),
            ),
            trailing ?? (onTap == null ? const SizedBox() : AppIcon(AppIcons.chevronRight, size: 20, color: c.muted)),
          ]),
        ),
      ),
    );
  }
}

/// Settings tab (adult shell). No map options and no language row (language lives in the header pill).
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('settings'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final session = ref.watch(sessionControllerProvider);
    final user = session is SignedIn ? session.user : null;
    final dark = ref.watch(themeControllerProvider) == ThemeMode.dark;
    final version = ref.watch(appVersionProvider).value;
    void go(String id) => context.push(locationFor(id));
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('set.title')), backgroundColor: c.background, automaticallyImplyLeading: false),
      body: ListView(padding: const EdgeInsets.only(bottom: Space.xl), children: [
        if (user != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.md, Space.xs, Space.md, 0),
            child: Material(
              color: c.surface,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.card), side: BorderSide(color: c.border)),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => go('profile'),
                child: Padding(
                  padding: const EdgeInsets.all(Space.sm),
                  child: Row(children: [
                    RingAvatar(size: 56, url: user.avatarThumbUrl ?? user.avatarUrl, initials: initialsOf(user.name)),
                    const SizedBox(width: Space.sm),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(user.name ?? '', style: t.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(user.email ?? s.t('set.view_profile'), style: t.bodySmall!.copyWith(color: c.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ]),
                    ),
                    AppIcon(AppIcons.chevronRight, size: 20, color: c.muted),
                  ]),
                ),
              ),
            ),
          ),
        SettingsGroup(title: s.t('set.general'), children: [
          SettingsRow(
            icon: dark ? AppIcons.moon : AppIcons.sun,
            title: s.t('set.dark_mode'),
            onTap: () => ref.read(themeControllerProvider.notifier).toggle(),
            trailing: Switch(value: dark, onChanged: (_) => ref.read(themeControllerProvider.notifier).toggle()),
          ),
          SettingsRow(icon: AppIcons.bell, title: s.t('set.notifications'), onTap: () => go('settings_notifications')),
        ]),
        SettingsGroup(title: s.t('set.family_safety'), children: [
          SettingsRow(icon: AppIcons.users, title: s.t('set.family'), onTap: () => go('family')),
          SettingsRow(icon: AppIcons.locationPin, title: s.t('set.places'), onTap: () => go('places')),
          SettingsRow(icon: AppIcons.phone, title: s.t('set.emergency_contacts'), onTap: () => go('emergency_contacts')),
          SettingsRow(icon: AppIcons.shield, title: s.t('set.report_misuse'), onTap: () => go('report_misuse')),
        ]),
        SettingsGroup(title: s.t('set.support'), children: [
          SettingsRow(icon: AppIcons.info, title: s.t('set.help'), onTap: () => go('help')),
          SettingsRow(icon: AppIcons.message, title: s.t('set.chat'), onTap: () => go('chat')),
          SettingsRow(icon: AppIcons.star, title: s.t('set.rate'), onTap: () => ref.read(reviewServiceProvider).openStore()),
        ]),
        SettingsGroup(title: s.t('set.legal'), children: [
          SettingsRow(icon: AppIcons.shieldCheck, title: s.t('set.privacy'), onTap: () => go('legal_privacy')),
          SettingsRow(icon: AppIcons.layers, title: s.t('set.terms'), onTap: () => go('legal_terms')),
        ]),
        SettingsGroup(title: s.t('set.your_data'), children: [
          SettingsRow(icon: AppIcons.history, title: s.t('set.download'), onTap: () => go('data_export')),
          SettingsRow(icon: AppIcons.alertCircle, title: s.t('set.delete'), danger: true, onTap: () => go('delete_account')),
        ]),
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.xl, Space.lg, Space.xl, 0),
          child: Column(children: [
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              AppIcon(AppIcons.lock, size: 16, color: c.successText),
              const SizedBox(width: Space.xxs),
              Flexible(child: Text(s.t('set.privacy_note'), style: t.bodySmall!.copyWith(color: c.muted), textAlign: TextAlign.center)),
            ]),
            if (version != null) ...[
              const SizedBox(height: Space.xs),
              Text(s.t('set.version', {'version': version}), style: t.bodySmall!.copyWith(color: c.muted)),
            ],
          ]),
        ),
      ]),
    );
  }
}

/// A simple screen body: icon badge, title, text lines, and a pinned action.
class _InfoPage extends StatelessWidget {
  const _InfoPage({required this.title, required this.icon, required this.heading, required this.lines, required this.footer, this.danger = false});
  final String title;
  final String icon;
  final String heading;
  final List<Widget> lines;
  final Widget footer;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final tint = danger ? c.dangerText : c.primaryText;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(title), backgroundColor: c.background),
      body: SafeArea(
        top: false,
        child: Column(children: [
          Expanded(
            child: ListView(padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.md, Space.screenHorizontal, Space.md), children: [
              Center(
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), shape: BoxShape.circle),
                  alignment: Alignment.center,
                  child: AppIcon(icon, size: 32, color: tint),
                ),
              ),
              const SizedBox(height: Space.md),
              Text(heading, style: t.titleLarge, textAlign: TextAlign.center),
              const SizedBox(height: Space.md),
              ...lines,
            ]),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.md), child: footer),
        ]),
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet(this.icon, this.text, {this.color});
  final String icon;
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.sm),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 2), child: AppIcon(icon, size: 20, color: color ?? c.primaryText)),
        const SizedBox(width: Space.sm),
        Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium)),
      ]),
    );
  }
}

class DataExportScreen extends ConsumerStatefulWidget {
  const DataExportScreen({super.key});
  @override
  ConsumerState<DataExportScreen> createState() => _DataExportScreenState();
}

class _DataExportScreenState extends ConsumerState<DataExportScreen> {
  bool _busy = false;
  bool _sent = false;

  Future<void> _request(Strings s) async {
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).post<dynamic>('/me/data-export');
      if (mounted) setState(() => _sent = true);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t(ApiError.from(e).messageKey))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('data_export'));
    final c = context.colors;
    final session = ref.watch(sessionControllerProvider);
    final email = session is SignedIn ? session.user.email : null;
    return _InfoPage(
      title: s.t('export.title'),
      icon: AppIcons.history,
      heading: s.t('export.title'),
      lines: [
        _Bullet(AppIcons.user, s.t('export.intro')),
        _Bullet(AppIcons.mail, s.t('export.how')),
        _Bullet(AppIcons.lock, s.t('export.others'), color: c.successText),
        if (_sent && email != null)
          Container(
            padding: const EdgeInsets.all(Space.sm),
            decoration: BoxDecoration(color: c.success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(Radii.input)),
            child: Row(children: [
              AppIcon(AppIcons.checkCircle, color: c.successText),
              const SizedBox(width: Space.xs),
              Expanded(child: Text(s.t('export.sent', {'email': email}), style: TextStyle(color: c.successText, fontWeight: FontWeight.w600))),
            ]),
          ),
        if (email == null) _Bullet(AppIcons.info, s.t('export.no_email'), color: c.warningText),
      ],
      footer: AppButton(label: s.t('export.request'), loading: _busy, onPressed: email == null || _sent ? null : () => _request(s)),
    );
  }
}

class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});
  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _ctrl = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _delete(Strings s, bool usesPassword) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.t('delacc.confirm_title')),
        content: Text(s.t('delacc.confirm_body')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.t('common.cancel'))),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(s.t('delacc.button'), style: TextStyle(color: ctx.colors.dangerText)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(apiClientProvider).post<dynamic>('/me/delete', data: usesPassword ? {'password': _ctrl.text} : {'confirm': _ctrl.text.trim()});
      await ref.read(sessionControllerProvider.notifier).signOut();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('delacc.done'))));
      context.go(locationFor('welcome'));
    } catch (e) {
      final err = ApiError.from(e);
      if (mounted) {
        setState(() => _error = s.t(switch (err.code) {
              'AUTH_INVALID_CREDENTIALS' => 'delacc.wrong_password',
              'VALIDATION_FAILED' => 'delacc.type_delete',
              _ => err.messageKey,
            }));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('delete_account'));
    final c = context.colors;
    final session = ref.watch(sessionControllerProvider);
    final user = session is SignedIn ? session.user : null;
    final family = ref.watch(familyProvider).value;
    final usesPassword = user?.authProvider == 'email';
    final owner = family != null && family.ownerMemberId == user?.id;
    final otherAdults = family?.members.where((m) => m.isAdult && m.id != user?.id).length ?? 0;
    final ready = usesPassword ? _ctrl.text.length >= 6 : _ctrl.text.trim().toUpperCase() == 'DELETE';
    return _InfoPage(
      title: s.t('delacc.title'),
      icon: AppIcons.alertCircle,
      heading: s.t('delacc.warning'),
      danger: true,
      lines: [
        _Bullet(AppIcons.close, s.t('delacc.what'), color: c.dangerText),
        if (owner) _Bullet(AppIcons.users, s.t(otherAdults > 0 ? 'delacc.owner_transfer' : 'delacc.owner_alone'), color: c.warningText),
        _Bullet(AppIcons.crown, s.t('delacc.billing'), color: c.warningText),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: () => context.push(locationFor('data_export')),
            icon: AppIcon(AppIcons.history, size: 18, color: c.primaryText),
            label: Text(s.t('delacc.export_first')),
          ),
        ),
        const SizedBox(height: Space.xs),
        if (usesPassword)
          PasswordField(
            label: s.t('delacc.password'),
            showLabel: s.t('auth.show_password'),
            hideLabel: s.t('auth.hide_password'),
            controller: _ctrl,
            error: _error,
            onChanged: (_) => setState(() {}),
          )
        else
          AppTextField(label: s.t('delacc.type_delete'), controller: _ctrl, error: _error, onChanged: (_) => setState(() {})),
      ],
      footer: AppButton(label: s.t('delacc.button'), kind: ButtonKind.danger, loading: _busy, onPressed: ready ? () => _delete(s, usesPassword) : null),
    );
  }
}

class HelpArticle {
  const HelpArticle(this.title, this.body, this.category);
  final String title;
  final String body;
  final String category;
}

/// Admin-written articles from the server; the built-in FAQ when there are none (or offline).
final helpArticlesProvider = FutureProvider.autoDispose<List<HelpArticle>>((ref) async {
  final lang = ref.watch(languageProvider).code;
  try {
    final list = await ref.read(apiClientProvider).get<List<dynamic>>('/help/articles', query: {'language': lang});
    final out = [
      for (final e in list.cast<Map<dynamic, dynamic>>())
        HelpArticle('${e['title'] ?? ''}', '${e['body'] ?? ''}', '${e['category'] ?? 'start'}'),
    ];
    if (out.isNotEmpty) return out;
  } catch (_) {}
  return const [];
});

const builtInFaq = [
  ('start', 'faq.start_1'),
  ('location', 'faq.loc_1'),
  ('location', 'faq.loc_2'),
  ('safety', 'faq.sos_1'),
  ('family', 'faq.fam_1'),
  ('billing', 'faq.bill_1'),
  ('privacy', 'faq.priv_1'),
];

class HelpScreen extends ConsumerStatefulWidget {
  const HelpScreen({super.key});
  @override
  ConsumerState<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends ConsumerState<HelpScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('help'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final remote = ref.watch(helpArticlesProvider).value ?? const [];
    final all = remote.isNotEmpty
        ? remote
        : [for (final (cat, k) in builtInFaq) HelpArticle(s.t('${k}_q'), s.t('${k}_a'), cat)];
    final q = _q.trim().toLowerCase();
    final items = q.isEmpty ? all : all.where((a) => a.title.toLowerCase().contains(q) || a.body.toLowerCase().contains(q)).toList();
    String catLabel(String cat) {
      final k = 'help.cat_$cat';
      final v = s.t(k);
      return v == k ? cat : v;
    }

    final cats = <String>{for (final a in items) a.category}.toList();
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('help.title')), backgroundColor: c.background),
      body: ListView(padding: const EdgeInsets.only(bottom: Space.xl), children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.md, Space.xs, Space.md, 0),
          child: TextField(
            onChanged: (v) => setState(() => _q = v),
            decoration: InputDecoration(
              hintText: s.t('help.search'),
              prefixIcon: Padding(padding: const EdgeInsets.all(12), child: AppIcon(AppIcons.search, size: 20, color: c.muted)),
              filled: true,
              fillColor: c.surface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.pill), borderSide: BorderSide(color: c.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.pill), borderSide: BorderSide(color: c.border)),
            ),
          ),
        ),
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.all(Space.xl),
            child: Text(s.t('help.empty'), textAlign: TextAlign.center, style: t.bodyMedium!.copyWith(color: c.muted)),
          ),
        for (final cat in cats)
          SettingsGroup(title: catLabel(cat), children: [
            for (final a in items.where((x) => x.category == cat))
              Theme(
                data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  title: Text(a.title, style: t.bodyLarge!.copyWith(fontWeight: FontWeight.w500)),
                  childrenPadding: const EdgeInsets.fromLTRB(Space.md, 0, Space.md, Space.md),
                  expandedCrossAxisAlignment: CrossAxisAlignment.start,
                  children: [Text(a.body, style: t.bodyMedium!.copyWith(color: c.muted))],
                ),
              ),
          ]),
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.md, Space.lg, Space.md, 0),
          child: Container(
            padding: const EdgeInsets.all(Space.md),
            decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(Radii.card)),
            child: Row(children: [
              AppIcon(AppIcons.message, color: c.primaryText),
              const SizedBox(width: Space.sm),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.t('help.still_need'), style: t.titleSmall),
                  const SizedBox(height: Space.xxs),
                  TextButton(
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 36), alignment: AlignmentDirectional.centerStart),
                    onPressed: () => context.push(locationFor('chat')),
                    child: Text(s.t('help.chat')),
                  ),
                ]),
              ),
              AppIcon(AppIcons.chevronRight, color: c.primaryText),
            ]),
          ),
        ),
      ]),
    );
  }
}

/// Blocking screen when this app version is below the admin's minimum.
class UpdateRequiredScreen extends ConsumerWidget {
  const UpdateRequiredScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('update'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final cfg = ref.watch(appConfigProvider).value;
    final lang = ref.watch(languageProvider).code;
    final custom = cfg?.updateMessage(lang) ?? '';
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.screenHorizontal),
          child: Column(children: [
            const Spacer(),
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.12), shape: BoxShape.circle),
              alignment: Alignment.center,
              child: AppIcon(AppIcons.refresh, size: 44, color: c.primaryText),
            ),
            const SizedBox(height: Space.lg),
            Text(s.t('upd.title'), style: t.headlineSmall, textAlign: TextAlign.center),
            const SizedBox(height: Space.xs),
            Text(custom.isNotEmpty ? custom : s.t('upd.required'), style: t.bodyMedium!.copyWith(color: c.muted), textAlign: TextAlign.center),
            const Spacer(),
            AppButton(label: s.t('upd.button'), large: true, onPressed: () => ref.read(reviewServiceProvider).openStore(url: cfg?.playStoreUrl)),
          ]),
        ),
      ),
    );
  }
}

/// Wraps the app: blocks below min_version; offers a dismissible prompt below latest_version (once per version).
class UpdateGate extends ConsumerStatefulWidget {
  const UpdateGate({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<UpdateGate> createState() => _UpdateGateState();
}

class _UpdateGateState extends ConsumerState<UpdateGate> {
  bool _dismissed = false;

  @override
  Widget build(BuildContext context) {
    final version = ref.watch(appVersionProvider).value;
    if (version == null) return widget.child;
    final cfg = ref.watch(appConfigProvider).value;
    if (cfg == null) return widget.child;
    if (compareVersions(version, cfg.minVersion) < 0) return const UpdateRequiredScreen();
    final prompts = ref.watch(updatePromptStoreProvider);
    final offer = !_dismissed && compareVersions(version, cfg.latestVersion) < 0 && !prompts.dismissed(cfg.latestVersion);
    if (!offer) return widget.child;
    final s = ref.watch(screenStringsProvider('update'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Stack(fit: StackFit.expand, children: [
      widget.child,
      PositionedDirectional(
        start: Space.md,
        end: Space.md,
        bottom: MediaQuery.paddingOf(context).bottom + 84,
        child: Material(
          elevation: 6,
          color: c.surface,
          shadowColor: Colors.black26,
          borderRadius: BorderRadius.circular(Radii.card),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Space.sm, Space.sm, Space.sm, Space.xs),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Row(children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.12), shape: BoxShape.circle),
                  alignment: Alignment.center,
                  child: AppIcon(AppIcons.refresh, size: 20, color: c.primaryText),
                ),
                const SizedBox(width: Space.sm),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Text(s.t('upd.available'), style: t.titleSmall),
                    Text(s.t('upd.available_body'), style: t.bodySmall!.copyWith(color: c.muted)),
                  ]),
                ),
              ]),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: Wrap(spacing: Space.xs, children: [
                  TextButton(
                    onPressed: () {
                      prompts.dismiss(cfg.latestVersion);
                      setState(() => _dismissed = true);
                    },
                    child: Text(s.t('upd.later')),
                  ),
                  TextButton(
                    onPressed: () => ref.read(reviewServiceProvider).openStore(url: cfg.playStoreUrl),
                    child: Text(s.t('upd.button'), style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ]),
              ),
            ]),
          ),
        ),
      ),
    ]);
  }
}
