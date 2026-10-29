import 'dart:async';

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
import '../../core/net/api_error.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/trust/trust.dart';
import '../../core/tz/tz_utils.dart';
import '../../core/widgets/language_selector.dart';
import '../../nav/router.dart';
import '../family/data/family_models.dart';
import '../family/data/family_repo.dart';
import '../home/widgets/header_buttons.dart';
import '../home/widgets/profile_row.dart' show homeClockProvider;
import '../map/family_map.dart';
import '../map/map_screen.dart' show myPositionProvider, nearbyProvider;
import '../safety/data/safety_repo.dart';

/// Child home (no bottom bar, no bell, no log out): sharing status, a small "You are here" map with nearby
/// chips, and three large buttons: SOS, I arrived safely, Heading home. Plus "Who can see me" and Help.
class ChildHomeScreen extends ConsumerStatefulWidget {
  const ChildHomeScreen({super.key});
  @override
  ConsumerState<ChildHomeScreen> createState() => _ChildHomeScreenState();
}

class _ChildHomeScreenState extends ConsumerState<ChildHomeScreen> {
  FamilyMapController? _map;
  bool _sendingArrival = false;

  Future<void> _arrived() async {
    final s = ref.read(screenStringsProvider('child_home'));
    setState(() => _sendingArrival = true);
    unawaited(HapticFeedback.mediumImpact());
    try {
      final place = await ref.read(safetyRepoProvider).safeArrival();
      ref.invalidate(myTripProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(place == null ? s.t('kid.arrived_sent') : s.t('kid.arrived_sent_place', {'place': place})),
        ));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t(ApiError.from(e).messageKey))));
    } finally {
      if (mounted) setState(() => _sendingArrival = false);
    }
  }

  Future<void> _confirmExit() async {
    final s = ref.read(screenStringsProvider('child_home'));
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.t('dialog.exit_title')),
        content: Text(s.t('dialog.exit_body_child')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.t('common.stay'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.t('common.exit'))),
        ],
      ),
    );
    if (ok == true) await SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('child_home'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final session = ref.watch(sessionControllerProvider);
    final user = session is SignedIn ? session.user : null;
    final language = ref.watch(languageProvider);
    final now = ref.watch(homeClockProvider)();
    final zone = user?.timezone ?? 'UTC';
    final period = greetingPeriod(now, zone);
    final trip = ref.watch(myTripProvider).value;
    final me = ref.watch(myPositionProvider).value;
    final nearby = me == null ? const <NearbyPlace>[] : (ref.watch(nearbyProvider((me.latitude, me.longitude))).value ?? const <NearbyPlace>[]);
    final mapBuilder = ref.watch(familyMapBuilderProvider);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _confirmExit();
      },
      child: Scaffold(
        backgroundColor: c.background,
        body: SafeArea(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SizedBox(
              height: Sizes.headerHeight,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.md),
                child: Row(children: [
                  Semantics(label: 'Nirapod', image: true, child: SvgPicture.asset(BrandAssets.logoApp, width: Sizes.logoHeader, height: Sizes.logoHeader)),
                  const SizedBox(width: Space.xs),
                  Expanded(child: Text('Nirapod', style: t.titleMedium!.copyWith(fontSize: 20, fontWeight: FontWeight.w700), maxLines: 1)),
                  const ThemeToggleButton(),
                  const SizedBox(width: 10),
                  const LanguageFlagButton(),
                ]),
              ),
            ),
            Expanded(
              child: ListView(padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.md), children: [
                Text(s.t('greeting.${period.name}'), style: t.bodyMedium!.copyWith(color: c.muted)),
                Text(user?.name ?? '', style: t.headlineSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: Space.sm),
                // Sharing status: always visible, never hidden.
                Semantics(
                  container: true,
                  label: '${s.t('kid.sharing_on')}. ${s.t('kid.sharing_body')}',
                  excludeSemantics: true,
                  child: Container(
                    padding: const EdgeInsets.all(Space.sm),
                    decoration: BoxDecoration(
                      color: c.success.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(Radii.card),
                      border: Border.all(color: c.success.withValues(alpha: 0.4)),
                    ),
                    child: Row(children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: c.success, shape: BoxShape.circle),
                        child: const AppIcon(AppIcons.shieldCheck, color: Colors.white),
                      ),
                      const SizedBox(width: Space.sm),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(s.t('kid.sharing_on'), style: t.titleMedium!.copyWith(color: c.successText)),
                          Text(s.t('kid.sharing_body'), style: t.bodySmall),
                        ]),
                      ),
                    ]),
                  ),
                ),
                if (trip != null) ...[
                  const SizedBox(height: Space.xs),
                  Material(
                    color: c.accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(Radii.card),
                    child: ListTile(
                      leading: AppIcon(AppIcons.walk, color: c.primaryText),
                      title: Text(s.t('kid.walk_active', {'time': formatLocalTime(trip.expectedAt, zone, language: language, use24h: false)})),
                      trailing: AppIcon(AppIcons.chevronRight, color: c.muted),
                      onTap: () => context.push(locationFor('child_safe_walk')),
                    ),
                  ),
                ],
                const SizedBox(height: Space.sm),
                // "You are here" mini map.
                ClipRRect(
                  borderRadius: BorderRadius.circular(Radii.cardLarge),
                  child: SizedBox(
                    height: 150,
                    child: Stack(children: [
                      Positioned.fill(
                        child: me == null
                            ? ColoredBox(
                                color: c.primary.withValues(alpha: 0.08),
                                child: Center(child: Text(s.t('kid.no_map'), style: t.bodySmall)),
                              )
                            : mapBuilder(
                                FamilyMapData(
                                  compact: true,
                                  nearby: nearby,
                                  pins: [
                                    MapPin(id: user?.id ?? 'me', name: user?.name ?? '', lat: me.latitude, lng: me.longitude, accuracyM: me.accuracy, trust: Trust.live),
                                  ],
                                ),
                                (m) {
                                  _map = m;
                                  unawaited(m.focus(me.latitude, me.longitude, zoom: 16));
                                },
                                (_) {},
                              ),
                      ),
                      PositionedDirectional(
                        start: Space.xs,
                        top: Space.xs,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: Space.xs, vertical: 4),
                          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Radii.pill)),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            AppIcon(AppIcons.locationPinFilled, size: 14, color: c.primaryText),
                            const SizedBox(width: 4),
                            Text(s.t('kid.you_are_here'), style: t.labelMedium),
                          ]),
                        ),
                      ),
                    ]),
                  ),
                ),
                if (nearby.isNotEmpty) ...[
                  const SizedBox(height: Space.xs),
                  SizedBox(
                    height: 40,
                    child: ListView(scrollDirection: Axis.horizontal, children: [
                      for (final p in nearby.take(6))
                        Padding(
                          padding: const EdgeInsetsDirectional.only(end: Space.xs),
                          child: ActionChip(
                            label: Text('${p.name} · ${p.distanceM} m', maxLines: 1),
                            onPressed: () => _map?.focus(p.lat, p.lng, zoom: 17),
                          ),
                        ),
                    ]),
                  ),
                ],
                const SizedBox(height: Space.md),
                _BigAction(
                  key: const Key('child_sos'),
                  label: s.t('sos.button'),
                  sub: s.t('sos.press'),
                  icon: AppIcons.sos,
                  color: c.danger,
                  height: 88,
                  semantic: s.t('sos.button_a11y'),
                  onTap: () {
                    HapticFeedback.heavyImpact();
                    context.push(locationFor('child_sos'));
                  },
                ),
                const SizedBox(height: Space.sm),
                Row(children: [
                  Expanded(
                    child: _BigAction(
                      key: const Key('child_arrived'),
                      label: s.t('kid.arrived'),
                      icon: AppIcons.checkCircle,
                      color: c.primaryFill,
                      busy: _sendingArrival,
                      onTap: _sendingArrival ? null : _arrived,
                    ),
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: _BigAction(
                      key: const Key('child_heading_home'),
                      label: s.t('kid.heading_home'),
                      icon: AppIcons.walk,
                      color: const Color(0xFF0D9488),
                      onTap: () => context.push(locationFor('child_safe_walk')),
                    ),
                  ),
                ]),
                const SizedBox(height: Space.md),
                Wrap(alignment: WrapAlignment.center, children: [
                  TextButton.icon(
                    key: const Key('who_can_see_me'),
                    onPressed: () => context.push(locationFor('who_can_see_me')),
                    icon: AppIcon(AppIcons.eye, size: 18, color: c.primaryText),
                    label: Text(s.t('kid.who_can_see')),
                  ),
                  TextButton.icon(
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: Text(s.t('kid.help')),
                        content: Text(s.t('kid.help_body')),
                        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s.t('common.close')))],
                      ),
                    ),
                    icon: AppIcon(AppIcons.info, size: 18, color: c.primaryText),
                    label: Text(s.t('kid.help')),
                  ),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _BigAction extends StatelessWidget {
  const _BigAction({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
    this.sub,
    this.height = 96,
    this.semantic,
    this.busy = false,
  });
  final String label;
  final String? sub;
  final String icon;
  final Color color;
  final VoidCallback? onTap;
  final double height;
  final String? semantic;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      label: semantic ?? label,
      excludeSemantics: true,
      child: PressScale(
        onTap: onTap,
        child: Container(
          constraints: BoxConstraints(minHeight: height),
          padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.sm),
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(Radii.cardLarge),
            boxShadow: [BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 14, offset: const Offset(0, 6))],
          ),
          child: sub == null
              ? Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  busy
                      ? const SizedBox.square(dimension: 28, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3))
                      : AppIcon(icon, size: 30, color: Colors.white),
                  const SizedBox(height: 6),
                  Text(label, textAlign: TextAlign.center, style: t.labelLarge!.copyWith(color: Colors.white, fontSize: 16)),
                ])
              : Row(children: [
                  Container(
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
                    child: AppIcon(icon, size: 32, color: Colors.white),
                  ),
                  const SizedBox(width: Space.md),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(label, style: t.headlineSmall!.copyWith(color: Colors.white, fontWeight: FontWeight.w800, fontVariations: const [FontVariation('wght', 800)])),
                      Text(sub!, style: t.bodySmall!.copyWith(color: const Color(0xE6FFFFFF))),
                    ]),
                  ),
                ]),
        ),
      ),
    );
  }
}

/// "Who can see me": the adults of the family who can see this child's location. Nobody else.
class WhoCanSeeMeScreen extends ConsumerWidget {
  const WhoCanSeeMeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('child_home'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final family = ref.watch(familyProvider).value;
    final adults = (family?.members ?? const <FamilyMember>[]).where((m) => m.isAdult).toList();
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('kid.who_can_see')), backgroundColor: c.background),
      body: ListView(padding: const EdgeInsets.all(Space.screenHorizontal), children: [
        Text(s.t('kid.who_body'), style: t.bodyLarge),
        const SizedBox(height: Space.md),
        for (final m in adults)
          Card(
            child: ListTile(
              leading: RingAvatar(size: 44, url: m.avatarThumbUrl, initials: initialsOf(m.name)),
              title: Text(m.name),
              subtitle: Text(_role(s, m)),
            ),
          ),
      ]),
    );
  }

  String _role(Strings s, FamilyMember m) => m.relationship ?? (m.role == 'parent' ? s.t('home.role_parent') : s.t('home.role_guardian'));
}
