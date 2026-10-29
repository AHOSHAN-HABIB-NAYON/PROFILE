import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/motion/motion.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../nav/router.dart';
import '../onboarding_flow.dart';
import '../widgets/permission_page.dart';

/// "Who are you?" (no language selector). Four large cards in a 2x2 grid (one column when the
/// screen is narrow or text is very large). The choice only selects the UI; the server decides the
/// real role. Choosing saves [RoleChoice] and finishes onboarding on this device.
class RoleScreen extends ConsumerStatefulWidget {
  const RoleScreen({super.key});

  @override
  ConsumerState<RoleScreen> createState() => _RoleScreenState();
}

class _RoleScreenState extends ConsumerState<RoleScreen> {
  late RoleChoice? _selected = ref.read(onboardingProgressProvider).role;

  static const _cards = [
    (RoleChoice.parent, BrandAssets.illustrationParent, 'role.parent', 'role.parent_desc'),
    (RoleChoice.child, BrandAssets.illustrationChild, 'role.child', 'role.child_desc'),
    (RoleChoice.probashi, BrandAssets.illustrationProbashi, 'role.probashi', 'role.probashi_desc'),
    (RoleChoice.member, BrandAssets.illustrationMember, 'role.member', 'role.member_desc'),
  ];

  Future<void> _choose(RoleChoice role) async {
    setState(() => _selected = role);
    await ref.read(onboardingProgressProvider).chooseRole(role);
    if (mounted) unawaited(context.push(locationFor(loginScreenFor(role))));
  }

  Future<void> _logIn() async {
    final progress = ref.read(onboardingProgressProvider);
    await progress.finish();
    if (mounted) unawaited(context.push(locationFor(loginScreenFor(progress.role))));
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('role'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final scale = MediaQuery.textScalerOf(context).scale(16) / 16;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xl, Space.screenHorizontal, Space.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Semantics(header: true, child: Text(s.t('role.title'), style: t.headlineSmall)),
                    const SizedBox(height: Space.xxs),
                    Text(s.t('role.subtitle'), style: t.bodyLarge!.copyWith(color: c.muted)),
                    const SizedBox(height: Space.xl),
                    LayoutBuilder(
                      builder: (context, box) {
                        final columns = box.maxWidth / scale >= 280 ? 2 : 1;
                        final cards = [
                          for (final (role, icon, title, desc) in _cards)
                            _RoleCard(
                              key: Key('role_${role.name}'),
                              icon: icon,
                              title: s.t(title),
                              description: s.t(desc),
                              selected: _selected == role,
                              onTap: () => _choose(role),
                            ),
                        ];
                        return Semantics(
                          label: s.t('role.cards_a11y'),
                          container: true,
                          child: Column(
                            children: [
                              for (var i = 0; i < cards.length; i += columns) ...[
                                if (i > 0) const SizedBox(height: Space.sm),
                                IntrinsicHeight(
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.stretch,
                                    children: [
                                      for (var j = i; j < i + columns && j < cards.length; j++) ...[
                                        if (j > i) const SizedBox(width: Space.sm),
                                        Expanded(child: cards[j]),
                                      ],
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: Space.lg),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AppIcon(AppIcons.info, size: 20, color: c.muted),
                        const SizedBox(width: Space.xs),
                        Expanded(child: Text(s.t('role.note'), style: t.bodySmall)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, 0, Space.screenHorizontal, Space.sm),
              child: Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(s.t('role.already'), style: t.bodyMedium!.copyWith(color: c.muted)),
                  TextLink(key: const Key('role_log_in'), label: s.t('role.log_in'), onTap: _logIn),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    required this.selected,
    required this.onTap,
  });
  final String icon;
  final String title;
  final String description;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final d = Motion.of(context, Motion.navIconMorph);
    return Semantics(
      button: true,
      selected: selected,
      label: '$title. $description',
      excludeSemantics: true,
      child: PressScale(
        onTap: onTap,
        child: AnimatedContainer(
          duration: d,
          curve: Motion.decelerate,
          padding: const EdgeInsets.fromLTRB(Space.sm, Space.xxl, Space.sm, Space.xxl),
          decoration: BoxDecoration(
            color: selected ? c.primary.withValues(alpha: 0.08) : c.surface,
            borderRadius: BorderRadius.circular(Radii.cardLarge),
            border: Border.all(color: selected ? c.primaryText : c.border, width: selected ? 2 : 1),
            boxShadow: [BoxShadow(color: c.primary.withValues(alpha: 0.08), blurRadius: 16, offset: const Offset(0, 6))],
          ),
          child: Stack(
            children: [
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Original brand illustration (Design), decorative.
                  SvgPicture.asset(icon, width: 108, height: 108, excludeFromSemantics: true),
                  const SizedBox(height: Space.sm),
                  Text(title, style: t.titleMedium, textAlign: TextAlign.center),
                  const SizedBox(height: Space.xxs),
                  Text(description, style: t.bodySmall, textAlign: TextAlign.center),
                ],
              ),
              PositionedDirectional(
                top: 0,
                end: 0,
                child: AnimatedOpacity(
                  duration: d,
                  opacity: selected ? 1 : 0,
                  child: Container(
                    width: 24,
                    height: 24,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: c.primaryFill, shape: BoxShape.circle),
                    child: AppIcon(AppIcons.check, size: 16, color: c.onPrimaryFill),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
