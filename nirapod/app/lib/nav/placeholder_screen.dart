import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/i18n/locale_controller.dart';
import '../core/state/buttons.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/tokens.g.dart';
import 'nav_types.dart';
import 'router.dart';
import 'routes.g.dart';

/// Phase 0 stand-in for every screen. It renders the buttons listed for the screen in
/// NAVIGATION_MAP, wired to their destinations, so the whole navigation skeleton is walkable.
/// Screen titles and button labels here are developer labels from the contract (English only);
/// real screens use i18n strings.
class PlaceholderScreen extends ConsumerWidget {
  const PlaceholderScreen({super.key, required this.spec});
  final ScreenSpec spec;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('placeholder'));
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: spec.adultShell ? null : AppBar(title: Text(spec.title), backgroundColor: context.colors.background),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Space.screenHorizontal),
          children: [
            if (spec.adultShell) Text(spec.title, style: t.headlineSmall),
            Text('${spec.path} · phase ${spec.phase}', style: t.bodySmall),
            const SizedBox(height: Space.xs),
            Text(s.t('common.coming_soon'), style: t.bodyMedium),
            const SizedBox(height: Space.md),
            for (final b in spec.buttons)
              Padding(
                padding: const EdgeInsets.only(bottom: Space.xs),
                child: AppButton(
                  label: '${b.label}  →  ${b.to}',
                  kind: ButtonKind.secondary,
                  onPressed: () => followButton(context, b),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Executes a button destination from the navigation contract.
void followButton(BuildContext context, ButtonSpec b) {
  final to = b.to;
  if (to == 'back' || to == 'close') {
    if (context.canPop()) context.pop();
    return;
  }
  if (to.startsWith('sheet:') || to.startsWith('dialog:')) {
    final o = overlayById(to.split(':')[1]);
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(Space.screenHorizontal),
          children: [
            Text('${o.title} (${o.kind})', style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: Space.sm),
            for (final ob in o.buttons)
              Padding(
                padding: const EdgeInsets.only(bottom: Space.xs),
                child: AppButton(
                  label: '${ob.label}  →  ${ob.to}',
                  kind: ButtonKind.secondary,
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    if (ob.to != 'close') followButton(context, ob);
                  },
                ),
              ),
          ],
        ),
      ),
    );
    return;
  }
  if (to.startsWith('system:') || to.startsWith('action:')) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(to)));
    return;
  }
  if (adultTabs.contains(to)) {
    context.go(locationFor(to));
  } else {
    context.push(locationFor(to));
  }
}
