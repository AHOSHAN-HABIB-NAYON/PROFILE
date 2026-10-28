import 'package:flutter/material.dart';

import '../../../core/i18n/numerals.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/motion/motion.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';

String localDigits(Strings s, Object n) => localizeDigits('$n', s.language == 'bn' ? 'beng' : 'latn');

/// "Step x of 3" + dots. Dots mirror in RTL with the Row.
class StepProgress extends StatelessWidget {
  const StepProgress({super.key, required this.strings, required this.current, this.total = 3});
  final Strings strings;
  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final label = strings.t('perm.step', {'current': localDigits(strings, current), 'total': localDigits(strings, total)});
    final d = Motion.of(context, Motion.navIndicator);
    return Semantics(
      label: label,
      excludeSemantics: true,
      child: Row(
        children: [
          Flexible(child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
          const SizedBox(width: Space.sm),
          for (var i = 1; i <= total; i++)
            AnimatedContainer(
              duration: d,
              curve: Motion.decelerate,
              margin: const EdgeInsetsDirectional.only(end: 6),
              width: i == current ? 22 : 8,
              height: 8,
              decoration: BoxDecoration(
                color: i <= current ? c.primaryText : c.border,
                borderRadius: BorderRadius.circular(Radii.pill),
              ),
            ),
        ],
      ),
    );
  }
}

/// Friendly "permission is off" panel with "Open Settings". Icon + text, never color alone.
class DeniedPanel extends StatelessWidget {
  const DeniedPanel({super.key, required this.title, required this.body, required this.settingsLabel, required this.onOpenSettings});
  final String title;
  final String body;
  final String settingsLabel;
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Semantics(
      container: true,
      liveRegion: true,
      child: Container(
        key: const Key('denied_panel'),
        padding: const EdgeInsets.all(Space.md),
        decoration: BoxDecoration(
          color: c.warning.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(Radii.card),
          border: Border.all(color: c.warning.withValues(alpha: 0.45)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              AppIcon(AppIcons.lock, size: 20, color: c.warningText),
              const SizedBox(width: Space.xs),
              Expanded(child: Text(title, style: t.titleMedium)),
            ]),
            const SizedBox(height: Space.xs),
            Text(body, style: t.bodyMedium),
            const SizedBox(height: Space.sm),
            AppButton(label: settingsLabel, kind: ButtonKind.secondary, onPressed: onOpenSettings, leading: AppIcon(AppIcons.settings, size: 20, color: c.primaryText)),
          ],
        ),
      ),
    );
  }
}

/// Small text link ("Not now") with a 48dp target.
class TextLink extends StatelessWidget {
  const TextLink({super.key, required this.label, required this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: PressScale(
          onTap: onTap,
          haptic: false,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.xs),
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelLarge!.copyWith(color: context.colors.primaryText),
              ),
            ),
          ),
        ),
      );
}

/// Layout shared by every permission page: progress, demo, title, benefit sentence, extra content,
/// then a pinned footer with the primary action and the "Not now" link. No language selector here.
class PermissionPageScaffold extends StatelessWidget {
  const PermissionPageScaffold({
    super.key,
    required this.demo,
    required this.title,
    required this.body,
    required this.primaryLabel,
    required this.onPrimary,
    this.progress,
    this.extra = const [],
    this.notNowLabel,
    this.onNotNow,
    this.busy = false,
  });

  final Widget? progress;
  final Widget demo;
  final String title;
  final String body;
  final List<Widget> extra;
  final String primaryLabel;
  final VoidCallback? onPrimary;
  final String? notNowLabel;
  final VoidCallback? onNotNow;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.md, Space.screenHorizontal, Space.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (progress != null) ...[progress!, const SizedBox(height: Space.md)],
                    demo,
                    const SizedBox(height: Space.xl),
                    Semantics(header: true, child: Text(title, style: t.headlineSmall)),
                    const SizedBox(height: Space.xs),
                    Text(body, style: t.bodyLarge!.copyWith(color: c.muted)),
                    for (final w in extra) ...[const SizedBox(height: Space.md), w],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppButton(key: const Key('perm_primary'), label: primaryLabel, large: true, loading: busy, onPressed: onPrimary),
                  if (notNowLabel != null) TextLink(key: const Key('perm_not_now'), label: notNowLabel!, onTap: busy ? null : onNotNow),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Small "Already allowed" note (check icon + text).
class GrantedNote extends StatelessWidget {
  const GrantedNote({super.key, required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Row(children: [
      AppIcon(AppIcons.checkCircle, size: 20, color: c.successText),
      const SizedBox(width: Space.xs),
      Expanded(child: Text(label, style: Theme.of(context).textTheme.bodyMedium!.copyWith(color: c.successText))),
    ]);
  }
}
