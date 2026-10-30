import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/strings.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/motion/motion.dart';
import '../../core/session/session.dart';
import '../../core/state/buttons.dart';
import '../../core/state/skeleton.dart';
import '../../core/state/state_views.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/trust/trust.dart';
import '../../core/widgets/code_cells.dart';
import '../../core/widgets/language_selector.dart';
import '../../nav/router.dart';
import '../alerts/alerts_screens.dart';
import '../../core/permissions/permission_card.dart';
import '../onboarding/data/permission_gateway.dart';
import '../family/data/family_models.dart';
import '../family/data/family_repo.dart';
import '../family/data/realtime.dart';
import '../family/data/sharing.dart';
import '../map/family_map.dart';
import '../map/live_watch.dart';
import '../map/map_prefs.dart';
import 'widgets/dialogs.dart';
import 'widgets/header_buttons.dart';
import 'widgets/member_card.dart';
import 'widgets/profile_row.dart';

/// Unread alerts count (Phase 5 fills it from /notifications).
final unreadAlertsProvider = Provider<int>((ref) => ref.watch(unreadAlertsCountProvider));

List<MapPin> pinsFor(Family family, Map<String, MemberLive> live, DateTime now) => [
      for (final m in family.members)
        if (live[m.id]?.point case final p?)
          MapPin(id: m.id, name: m.name, photoUrl: m.avatarThumbUrl, lat: p.lat, lng: p.lng, accuracyM: p.accuracyM, trust: trustFor(lastUpdate: live[m.id]!.lastUpdateAt, now: now)),
    ];

/// Adult Home: header (logo + name; theme toggle, language flag, bell), profile row, sharing consent card,
/// map preview, member cards, quick actions, and the overseas "Family status" summary.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('home'));
    final session = ref.watch(sessionControllerProvider);
    final c = context.colors;
    ref.watch(realtimeProvider); // keeps the socket connected while signed in
    if (session is! SignedIn) return const Scaffold(body: SizedBox());
    final user = session.user;
    final familyAsync = ref.watch(familyProvider);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await showExitDialog(context, s, child: false)) await SystemNavigator.pop();
      },
      child: Scaffold(
        backgroundColor: c.background,
        body: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(familyProvider);
              await ref.read(liveProvider.notifier).refresh();
            },
            child: ListView(
              padding: const EdgeInsets.only(bottom: Space.xl),
              children: [
                _Header(strings: s),
                ProfileRow(
                  user: user,
                  strings: s,
                  sharing: familyAsync.value?.member(user.id)?.sharingStatus == 'active',
                  onTap: () => context.push(locationFor('profile')),
                ),
                // Skipped during onboarding? Ask here, where it matters.
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
                  child: Column(children: [
                    PermissionNeededCard(permission: OnbPermission.notification, strings: s),
                    PermissionNeededCard(permission: OnbPermission.locationWhenInUse, strings: s),
                  ]),
                ),
                switch (familyAsync) {
                  AsyncData(value: null) => _EmptyFamily(strings: s, user: user),
                  AsyncData(:final value?) => _FamilyBody(family: value, user: user, strings: s),
                  AsyncError() => Padding(
                      padding: const EdgeInsets.all(Space.screenHorizontal),
                      child: MessageView(
                        icon: AppIcons.alertCircle,
                        title: s.t('state.error_title'),
                        body: s.t('err.network'),
                        action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: () => ref.invalidate(familyProvider)),
                      ),
                    ),
                  _ => const Padding(padding: EdgeInsets.all(Space.screenHorizontal), child: SkeletonList()),
                },
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.strings});
  final Strings strings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context).textTheme;
    return SizedBox(
      height: Sizes.headerHeight,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.md),
        child: Row(children: [
          Semantics(
            label: 'Nirapod',
            image: true,
            child: SvgPicture.asset(BrandAssets.logoApp, width: Sizes.logoHeader, height: Sizes.logoHeader),
          ),
          const SizedBox(width: Space.xs),
          Expanded(
            child: Text('Nirapod', style: t.titleMedium!.copyWith(fontSize: 20, fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          const ThemeToggleButton(),
          const SizedBox(width: 10),
          const LanguageFlagButton(),
          const SizedBox(width: 10),
          NotificationBell(unread: ref.watch(unreadAlertsProvider), onTap: () => context.push(locationFor('alerts'))),
        ]),
      ),
    );
  }
}

class _FamilyBody extends ConsumerWidget {
  const _FamilyBody({required this.family, required this.user, required this.strings});
  final Family family;
  final AuthUser user;
  final Strings strings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = strings;
    final t = Theme.of(context).textTheme;
    final c = context.colors;
    final live = ref.watch(liveProvider).value ?? const {};
    final now = ref.watch(homeClockProvider)();
    final lang = ref.watch(languageProvider);
    final me = family.member(user.id);
    // Adults who agreed share while the app is open; pausing or stopping ends it.
    if (me != null && me.isAdult && me.sharingStatus == 'active') {
      ref.read(adultSharingProvider).start();
    } else {
      ref.read(adultSharingProvider).stop();
    }
    final use24h = MediaQuery.alwaysUse24HourFormatOf(context);
    final pins = pinsFor(family, live, now);
    final attention = family.members.where((m) {
      if (m.id == user.id) return false;
      final l = live[m.id];
      final tr = trustFor(lastUpdate: l?.lastUpdateAt, now: now, reason: reasonFrom(l?.unavailableReason));
      return m.isChild && (tr == Trust.stale || tr == Trust.unavailable);
    }).length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (me != null && me.isAdult && me.sharingStatus != 'active') _SharingCard(family: family, me: me, strings: s),
        if (user.isOverseas) ...[
          const SizedBox(height: Space.sm),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(Space.md),
              child: Row(children: [
                AppIcon(attention == 0 ? AppIcons.shieldCheck : AppIcons.alertCircle, color: attention == 0 ? c.successText : c.warningText),
                const SizedBox(width: Space.sm),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.t('home.family_status'), style: t.titleMedium),
                    Text(attention == 0 ? s.t('home.status_ok') : s.t('home.status_attention', {'count': attention}), style: t.bodySmall),
                  ]),
                ),
              ]),
            ),
          ),
        ],
        const SizedBox(height: Space.sm),
        Semantics(
          button: true,
          label: s.t('home.map_preview_a11y'),
          child: GestureDetector(
            onTap: () => context.go(locationFor('map')),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(Radii.cardLarge),
              child: SizedBox(
                height: 168,
                child: AbsorbPointer(
                  child: LiveWatch(
                    child: FamilyMapView(
                      data: FamilyMapData(pins: pins, prefs: const MapPrefs(kind: MapKind.normal), compact: true, connectFromId: user.id),
                      onReady: (_) {},
                      onPinTap: (_) {},
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: Space.md),
        _QuickActions(strings: s),
        const SizedBox(height: Space.md),
        Row(children: [
          Expanded(child: Semantics(header: true, child: Text(s.t('home.family_members'), style: t.titleMedium))),
          TextButton(onPressed: () => context.push(locationFor('family')), child: Text(s.t('home.view_all'), style: TextStyle(color: c.primaryText))),
        ]),
        for (final m in family.members) ...[
          MemberCard(
            member: m,
            live: live[m.id],
            strings: s,
            language: lang,
            now: now,
            use24h: use24h,
            viewerZone: user.timezone ?? 'UTC',
            isMe: m.id == user.id,
            showLocalTime: user.isOverseas || m.isOverseas || (m.timezone != null && m.timezone != user.timezone),
            onTap: () => context.push(locationFor('member', param: m.id)),
          ),
          const SizedBox(height: Space.xs),
        ],
      ]),
    );
  }
}

class _SharingCard extends ConsumerStatefulWidget {
  const _SharingCard({required this.family, required this.me, required this.strings});
  final Family family;
  final FamilyMember me;
  final Strings strings;

  @override
  ConsumerState<_SharingCard> createState() => _SharingCardState();
}

class _SharingCardState extends ConsumerState<_SharingCard> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final t = Theme.of(context).textTheme;
    final paused = widget.me.sharingStatus == 'paused';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Space.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(paused ? s.t('home.sharing_paused') : s.t('home.sharing_pending_title'), style: t.titleMedium),
          const SizedBox(height: Space.xxs),
          Text(s.t('home.sharing_pending_body'), style: t.bodySmall),
          const SizedBox(height: Space.sm),
          AppButton(
            label: s.t('home.sharing_accept'),
            loading: _busy,
            onPressed: () async {
              setState(() => _busy = true);
              try {
                await ref.read(familyRepoProvider).patchMember(widget.family.id, widget.me.id, {'sharing_status': 'active'});
                ref.invalidate(familyProvider);
              } catch (_) {
                if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('err.network'))));
              } finally {
                if (mounted) setState(() => _busy = false);
              }
            },
          ),
        ]),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.strings});
  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final c = context.colors;
    final items = [
      (AppIcons.locationPin, 'home.quick_places', 'places'),
      (AppIcons.bell, 'home.quick_alerts', 'alerts'),
      (AppIcons.walk, 'home.quick_safe_walk', 'safe_walk'),
      (AppIcons.message, 'home.quick_chat', 'chat'),
      (AppIcons.users, 'home.quick_family', 'family'),
    ];
    return Row(children: [
      for (final (icon, key, dest) in items)
        Expanded(
          child: Semantics(
            button: true,
            label: s.t(key),
            excludeSemantics: true,
            child: PressScale(
              onTap: () => context.push(locationFor(dest)),
              child: Column(children: [
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.12), shape: BoxShape.circle),
                  child: AppIcon(icon, color: c.primaryText),
                ),
                const SizedBox(height: Space.xxs),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 3), child: FittedBox(fit: BoxFit.scaleDown, child: Text(s.t(key), style: Theme.of(context).textTheme.labelMedium, textAlign: TextAlign.center, maxLines: 1, softWrap: false))),
              ]),
            ),
          ),
        ),
    ]);
  }
}

/// Empty states by role replace extra pages.
class _EmptyFamily extends ConsumerStatefulWidget {
  const _EmptyFamily({required this.strings, required this.user});
  final Strings strings;
  final AuthUser user;

  @override
  ConsumerState<_EmptyFamily> createState() => _EmptyFamilyState();
}

class _EmptyFamilyState extends ConsumerState<_EmptyFamily> {
  bool _busy = false;
  String? _error;
  String _code = '';

  Future<void> _run(Future<void> Function() f) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await f();
      final me = await ref.read(sessionControllerProvider.notifier).refreshMe();
      if (me == null) ref.invalidate(familyProvider);
    } catch (_) {
      setState(() => _error = widget.strings.t('err.unknown'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final t = Theme.of(context).textTheme;
    final roleChoice = ref.watch(roleChoiceProvider);
    final probashi = widget.user.isOverseas || roleChoice == RoleChoice.probashi;
    final member = roleChoice == RoleChoice.member;
    final repo = ref.read(familyRepoProvider);
    return Padding(
      padding: const EdgeInsets.all(Space.screenHorizontal),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(
              member ? s.t('home.empty_member_title') : (probashi ? s.t('home.empty_probashi_title') : s.t('home.empty_parent_title')),
              style: t.headlineSmall,
            ),
            const SizedBox(height: Space.xs),
            Text(
              member ? s.t('home.empty_member_body') : (probashi ? s.t('home.empty_probashi_body') : s.t('home.empty_parent_body')),
              style: t.bodyMedium,
            ),
            const SizedBox(height: Space.md),
            if (!member)
              AppButton(
                label: probashi ? s.t('home.create_circle') : s.t('home.empty_parent_cta'),
                loading: _busy,
                onPressed: () => _run(() async {
                  await repo.create();
                  if (context.mounted) await context.push(locationFor('child_code_generate'));
                }),
              ),
            if (member || probashi) ...[
              const SizedBox(height: Space.md),
              Text(s.t('home.invite_code'), style: t.labelMedium),
              const SizedBox(height: Space.xs),
              CodeCells(alphanumeric: true, autofocus: false, onChanged: (v) => _code = v, onCompleted: (v) => _code = v),
              const SizedBox(height: Space.sm),
              AppButton(
                label: s.t('home.join'),
                kind: member ? ButtonKind.primary : ButtonKind.secondary,
                loading: _busy,
                onPressed: () => _code.length == 6 ? _run(() => repo.acceptInvite(_code)) : null,
              ),
            ],
            if (_error != null) Padding(padding: const EdgeInsets.only(top: Space.xs), child: Text(_error!, style: t.bodySmall!.copyWith(color: context.colors.dangerText))),
          ]),
        ),
      ),
    );
  }
}
