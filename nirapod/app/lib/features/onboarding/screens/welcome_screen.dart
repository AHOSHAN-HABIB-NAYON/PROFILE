import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/icons/app_icons.g.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/widgets/brand/animated_logo.dart';
import '../../../core/widgets/language_selector.dart';
import '../../../nav/router.dart';
import '../demos/welcome_backdrop.dart';
import '../onboarding_flow.dart';

/// Welcome (first page): language pill top-right (top-left in RTL), animated logo (900 ms draw-on),
/// "Nirapod", tagline, one-sentence promise and a large "Get Started" that resumes the onboarding.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('welcome'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Scaffold(
      backgroundColor: c.background,
      body: Stack(
        children: [
          Positioned.fill(
            child: Semantics(
              label: s.t('welcome.illustration_a11y'),
              image: true,
              excludeSemantics: true,
              child: Stack(
                children: [
                  const Positioned.fill(child: WelcomeBackdrop()),
                  // Brand illustration (Design): family in a green landscape, anchored to the bottom.
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: Opacity(
                      opacity: Theme.of(context).brightness == Brightness.dark ? 0.55 : 1,
                      child: SvgPicture.asset(
                        BrandAssets.illustrationWelcome,
                        width: double.infinity,
                        fit: BoxFit.fitWidth,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                const SizedBox(
                  height: Sizes.headerHeight,
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: Space.sm),
                    child: Row(children: [Spacer(), LanguagePill()]),
                  ),
                ),
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, box) => SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(minHeight: box.maxHeight),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            AnimatedLogo(size: 120, semanticLabel: s.t('welcome.title_a11y')),
                            const SizedBox(height: Space.xl),
                            Semantics(
                              header: true,
                              child: Text(s.t('common.app_name'), style: t.displaySmall, textAlign: TextAlign.center),
                            ),
                            const SizedBox(height: Space.xxs),
                            Text(
                              s.t('common.tagline'),
                              style: t.titleMedium!.copyWith(color: c.primaryText),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: Space.md),
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 340),
                              child: Text(
                                s.t('common.promise'),
                                style: t.bodyLarge!.copyWith(color: c.muted),
                                textAlign: TextAlign.center,
                              ),
                            ),
                            const SizedBox(height: Space.xl),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    Space.screenHorizontal,
                    Space.xs,
                    Space.screenHorizontal,
                    Space.lg,
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    child: AppButton(
                      key: const Key('get_started'),
                      label: s.t('welcome.get_started'),
                      large: true,
                      onPressed: () => context.push(locationFor(ref.read(onboardingProgressProvider).resumeScreen)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
