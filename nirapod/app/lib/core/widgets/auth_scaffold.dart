import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../i18n/locale_controller.dart';
import '../icons/app_icon.dart';
import '../icons/app_icons.g.dart';
import '../motion/motion.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';
import 'language_selector.dart';

/// Page frame for login / register / verify / forgot and similar screens: a brand band (back button,
/// app tile, name and tagline, language pill) above a white sheet with rounded top corners that holds
/// the page, and an optional footer pinned to the bottom of the sheet. Fits one screen; scrolls only
/// when the text size or keyboard needs it.
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
    final common = ref.watch(screenStringsProvider('_default'));
    final dark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    final canBack = showBack && context.canPop();
    // Brand band: deep green -> teal (same in both themes, white text on it).
    const top = Color(0xFF065F46);
    const bottom = Color(0xFF0D9488);
    return Scaffold(
      backgroundColor: top,
      resizeToAvoidBottomInset: true,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [top, bottom]),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header: back (if any), app tile, name + tagline, language pill.
            Padding(
              padding: EdgeInsets.fromLTRB(Space.md, mq.padding.top + Space.sm, Space.md, Space.lg),
              child: Row(
                children: [
                  if (canBack) ...[
                    Semantics(
                      button: true,
                      label: backLabel ?? common.t('common.back'),
                      excludeSemantics: true,
                      child: PressScale(
                        key: const Key('auth_back'),
                        onTap: () => context.pop(),
                        child: Container(
                          width: 40,
                          height: 40,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), shape: BoxShape.circle),
                          child: const AppIcon(AppIcons.arrowLeft, size: 22, color: Colors.white),
                        ),
                      ),
                    ),
                    const SizedBox(width: Space.sm),
                  ],
                  Container(
                    width: 48,
                    height: 48,
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 10, offset: Offset(0, 3))],
                    ),
                    child: SvgPicture.asset(BrandAssets.logoApp, excludeFromSemantics: true),
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                      Text(
                        common.t('common.app_name'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium!.copyWith(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              fontVariations: const [FontVariation('wght', 700)],
                            ),
                      ),
                      Text(
                        common.t('common.tagline'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall!.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                      ),
                    ]),
                  ),
                  if (showLanguage)
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 150),
                      child: const FittedBox(fit: BoxFit.scaleDown, child: LanguagePill()),
                    ),
                ],
              ),
            ),
            // White sheet with rounded top corners holds the page.
            Expanded(
              child: Material(
                color: dark ? c.background : c.surface,
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xl, Space.screenHorizontal, Space.md),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          if (title != null) ...[
                            Semantics(header: true, child: Text(title!, style: Theme.of(context).textTheme.headlineSmall)),
                            const SizedBox(height: Space.md),
                          ],
                          body,
                        ]),
                      ),
                    ),
                    if (footer != null)
                      Padding(
                        padding: EdgeInsets.fromLTRB(Space.screenHorizontal, 0, Space.screenHorizontal, Space.sm + mq.padding.bottom),
                        child: footer,
                      )
                    else
                      SizedBox(height: mq.padding.bottom),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
