import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../core/icons/app_icons.g.dart';
import '../../core/motion/motion.dart';
import '../../core/theme/app_theme.dart';

/// Splash (600 ms). Phase 0 always continues to Welcome; Phase 1 adds the session / onboarding checks.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer(Motion.splash, () {
      if (mounted) context.go('/welcome');
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: context.colors.background,
        body: Center(
          child: Semantics(
            label: 'Nirapod',
            image: true,
            child: SvgPicture.asset(BrandAssets.logoApp, width: 96, height: 96),
          ),
        ),
      );
}
