import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/i18n/locale_controller.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/motion/motion.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/brand/splash_brand.dart';
import '../../nav/router.dart';
import '../onboarding/onboarding_flow.dart';

/// Splash (at least 600 ms). Restores the session while the brand is shown, then follows
/// [splashDestination]. Visual: [SplashBrand] centred on the theme background, continuing the native
/// Android splash without a jump.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    unawaited(_decide());
  }

  Future<void> _decide() async {
    final results = await Future.wait<Object?>([Future<void>.delayed(Motion.splash), _restore()]);
    if (!mounted) return;
    final progress = ref.read(onboardingProgressProvider);
    final target = splashDestination(
      session: results[1]! as SessionState,
      onboardingDone: progress.done,
      role: progress.role,
    );
    context.go(locationFor(target));
  }

  Future<SessionState> _restore() async {
    try {
      return await ref.read(sessionControllerProvider.notifier).restore();
    } catch (_) {
      return const SignedOut();
    }
  }

  @override
  // SplashBrand is the whole body (no AppBar/SafeArea) so its centre matches the native splash, and it
  // paints its own background from the system brightness, so there is no colour flash.
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.colors.background,
    body: SplashBrand(tagline: ref.watch(screenStringsProvider('splash')).t('common.tagline')),
  );
}
