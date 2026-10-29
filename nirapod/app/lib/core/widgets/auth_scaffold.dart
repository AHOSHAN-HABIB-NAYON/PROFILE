import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../i18n/locale_controller.dart';
import '../icons/app_icon.dart';
import '../icons/app_icons.g.dart';
import '../motion/motion.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';
import 'language_selector.dart';

/// Page frame for Welcome / login / register / verify / forgot screens: back button (optional) at the
/// start, language pill at the end (top-right in LTR, top-left in RTL), scrollable body with 20dp padding.
/// [showLanguage] must be true ONLY on screens allowed by the navigation contract.
class AuthScaffold extends ConsumerWidget {
  const AuthScaffold({
    super.key,
    required this.body,
    this.showBack = true,
    this.showLanguage = true,
    this.backLabel,
    this.title,
    this.footer,
  });

  final Widget body;
  final bool showBack;
  final bool showLanguage;
  /// Defaults to the translated common.back.
  final String? backLabel;
  final String? title;
  final Widget? footer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Column(
          children: [
            ConstrainedBox(
              // min, not fixed: long Bengali titles at 200% text must not be clipped.
              constraints: const BoxConstraints(minHeight: Sizes.headerHeight),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.sm),
                child: Row(
                  children: [
                    if (showBack && context.canPop())
                      Semantics(
                        button: true,
                        label: backLabel ?? ref.watch(screenStringsProvider('_default')).t('common.back'),
                        excludeSemantics: true,
                        child: PressScale(
                          onTap: () => context.pop(),
                          child: Center(child: AppIcon(AppIcons.arrowLeft, color: c.text)),
                        ),
                      ),
                    if (title != null)
                      Expanded(
                        child: Semantics(
                          header: true,
                          child: Text(title!, style: Theme.of(context).textTheme.titleMedium, maxLines: 2),
                        ),
                      )
                    else
                      const Spacer(),
                    if (showLanguage) const LanguagePill(),
                  ],
                ),
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.xl),
                child: body,
              ),
            ),
            if (footer != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, 0, Space.screenHorizontal, Space.md),
                child: footer,
              ),
          ],
        ),
      ),
    );
  }
}
