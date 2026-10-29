import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/i18n/languages.dart';
import 'core/i18n/locale_controller.dart';
import 'core/motion/motion.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/family/data/sharing.dart';
import 'nav/router.dart';

final routerProvider = Provider<GoRouter>((ref) => createRouter());

class NirapodApp extends ConsumerWidget {
  const NirapodApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final language = ref.watch(languageProvider);
    final mode = ref.watch(themeControllerProvider);
    ref.watch(backgroundHooksProvider);
    return MaterialApp.router(
      title: 'Nirapod',
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
      theme: buildTheme(brightness: Brightness.light, script: language.script),
      darkTheme: buildTheme(brightness: Brightness.dark, script: language.script),
      themeMode: mode,
      // Theme change cross-fades in 250 ms with no flash (ThemeData lerp, background included).
      themeAnimationDuration: Motion.themeCrossFade,
      themeAnimationCurve: Motion.standard,
      locale: language.locale,
      supportedLocales: [for (final l in supportedLanguages) l.locale],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => LanguageFade(languageCode: language.code, child: child ?? const SizedBox()),
    );
  }
}

/// Fades the app in over 250 ms when the language changes, so labels never visibly jump.
class LanguageFade extends StatefulWidget {
  const LanguageFade({super.key, required this.languageCode, required this.child});
  final String languageCode;
  final Widget child;

  @override
  State<LanguageFade> createState() => _LanguageFadeState();
}

class _LanguageFadeState extends State<LanguageFade> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Motion.themeCrossFade, value: 1);

  @override
  void didUpdateWidget(LanguageFade old) {
    super.didUpdateWidget(old);
    if (old.languageCode != widget.languageCode) {
      _c
        ..duration = Motion.of(context, Motion.themeCrossFade)
        ..forward(from: 0.35);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(opacity: CurvedAnimation(parent: _c, curve: Motion.decelerate), child: widget.child);
}
