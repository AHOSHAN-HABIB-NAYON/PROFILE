import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/i18n/locale_controller.dart';
import '../core/icons/app_icon.dart';
import '../core/icons/app_icons.g.dart';
import '../core/motion/motion.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/tokens.g.dart';

class _Tab {
  const _Tab(this.key, this.outline, this.filled);
  final String key;
  final String outline;
  final String filled;
}

const _tabs = [
  _Tab('nav.home', AppIcons.home, AppIcons.homeFilled),
  _Tab('nav.map', AppIcons.map, AppIcons.mapFilled),
  _Tab('nav.history', AppIcons.history, AppIcons.historyFilled),
  _Tab('nav.premium', AppIcons.crown, AppIcons.crownFilled),
  _Tab('nav.settings', AppIcons.settings, AppIcons.settingsFilled),
];

/// Adult shell with the 5-tab bottom bar: Home, Map, History, Premium, Settings.
class AdultShell extends ConsumerWidget {
  const AdultShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('placeholder'));
    return Scaffold(
      body: shell,
      bottomNavigationBar: BottomBar(
        index: shell.currentIndex,
        labels: [for (final t in _tabs) s.t(t.key)],
        onTap: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
      ),
    );
  }
}

class BottomBar extends StatelessWidget {
  const BottomBar({super.key, required this.index, required this.labels, required this.onTap});
  final int index;
  final List<String> labels;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final morph = Motion.of(context, Motion.navIconMorph);
    final slide = Motion.of(context, Motion.navIndicator);
    return Container(
      decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
      child: SafeArea(
        top: false,
        child: LayoutBuilder(builder: (context, box) {
          final w = box.maxWidth / _tabs.length;
          final rtl = Directionality.of(context) == TextDirection.rtl;
          final start = (rtl ? (_tabs.length - 1 - index) : index) * w;
          return Stack(children: [
            // Sliding indicator (260 ms).
            AnimatedPositioned(
              duration: slide,
              curve: Motion.decelerate,
              left: start + w * 0.25,
              width: w * 0.5,
              top: 0,
              height: 3,
              child: DecoratedBox(decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(2))),
            ),
            Row(children: [
              for (var i = 0; i < _tabs.length; i++)
                Expanded(
                  child: Semantics(
                    selected: i == index,
                    button: true,
                    label: labels[i],
                    excludeSemantics: true,
                    child: InkResponse(
                      onTap: () => onTap(i),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 64),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          // Outline-to-filled morph (220 ms cross-fade + scale).
                          AnimatedSwitcher(
                            duration: morph,
                            transitionBuilder: (child, a) => FadeTransition(
                              opacity: a,
                              child: ScaleTransition(scale: Tween(begin: 0.85, end: 1.0).animate(a), child: child),
                            ),
                            child: AppIcon(
                              i == index ? _tabs[i].filled : _tabs[i].outline,
                              key: ValueKey(i == index),
                              color: i == index ? c.primaryText : c.muted,
                            ),
                          ),
                          const SizedBox(height: Space.xxs),
                          Text(
                            labels[i],
                            maxLines: 1,
                            overflow: TextOverflow.fade,
                            softWrap: false,
                            style: Theme.of(context).textTheme.labelMedium!.copyWith(
                                  color: i == index ? c.primaryText : c.muted,
                                  fontWeight: i == index ? FontWeight.w600 : FontWeight.w400,
                                ),
                          ),
                        ]),
                      ),
                    ),
                  ),
                ),
            ]),
          ]);
        }),
      ),
    );
  }
}
