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
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: c.background,
      body: DecoratedBox(
        // Soft brand wash at the top, plain background below.
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            // Mint all the way down so the picture's sky blends in (no white band).
            colors: [c.primary.withValues(alpha: dark ? 0.18 : 0.14), c.primary.withValues(alpha: dark ? 0.08 : 0.06)],
          ),
        ),
        child: SafeArea(
          bottom: false,
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
                    child: ConstrainedBox(
                      constraints: BoxConstraints(minHeight: box.maxHeight),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const SizedBox.shrink(),
                          // Text block: never overlaps the picture (they are separate rows).
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
                            child: Column(children: [
                              AnimatedLogo(size: 104, semanticLabel: s.t('welcome.title_a11y')),
                              const SizedBox(height: Space.lg),
                              Semantics(
                                header: true,
                                child: Text(
                                  s.t('common.app_name'),
                                  style: t.displaySmall!.copyWith(color: c.primaryText),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                              const SizedBox(height: Space.xxs),
                              Text(
                                s.t('common.tagline'),
                                style: t.titleMedium!.copyWith(color: c.text),
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: Space.sm),
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 320),
                                child: Text(
                                  s.t('common.promise'),
                                  style: t.bodyMedium!.copyWith(color: c.muted),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ]),
                          ),
                          const SizedBox(height: Space.md),
                          // Brand illustration: family in a green landscape, full width, below the text.
                          Semantics(
                            label: s.t('welcome.illustration_a11y'),
                            image: true,
                            excludeSemantics: true,
                            child: Opacity(
                              opacity: dark ? 0.6 : 1,
                              child: AspectRatio(
                                aspectRatio: 360 / 200,
                                child: SvgPicture.asset(BrandAssets.illustrationWelcome, fit: BoxFit.cover),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              // Ground colour of the illustration continues under the button: no seam, no empty band.
              ColoredBox(
                color: dark ? const Color(0xFFA7DEC6).withValues(alpha: 0.6 * 0.6) : const Color(0xFFA7DEC6),
                child: Padding(
                padding: EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.lg + MediaQuery.paddingOf(context).bottom),
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
              ),
            ],
          ),
        ),
      ),
    );
  }
}
