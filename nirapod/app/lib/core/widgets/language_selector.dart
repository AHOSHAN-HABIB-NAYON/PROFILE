import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../i18n/languages.dart';
import '../i18n/locale_controller.dart';
import '../icons/app_icon.dart';
import '../icons/app_icons.g.dart';
import '../motion/motion.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';

/// Language pill for Welcome, login, register, verification and forgot-password pages:
/// SVG flag + native language name + chevron, 36dp high, radius 18, hairline border.
/// Place it at the END of a Row so it sits top-right in LTR and top-left in RTL.
/// ONLY allowed on the screens listed in docs/CONTRACTS/navigation.json (languageSelector: true).
class LanguagePill extends ConsumerWidget {
  const LanguagePill({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lang = ref.watch(languageProvider);
    final s = ref.watch(screenStringsProvider('_default'));
    final c = context.colors;
    return Semantics(
      button: true,
      label: s.t('a11y.language_button', {'language': lang.nativeName}),
      excludeSemantics: true,
      child: PressScale(
        onTap: () => showLanguageSheet(context),
        child: Center(
          child: Container(
            height: Sizes.languagePillHeight,
            padding: const EdgeInsetsDirectional.only(start: 6, end: 8),
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: BorderRadius.circular(Radii.languagePill),
              border: Border.all(color: c.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ClipOval(child: SvgPicture.asset(lang.flagAsset, width: 22, height: 22)),
                const SizedBox(width: 6),
                Text(lang.nativeName, style: Theme.of(context).textTheme.labelMedium),
                const SizedBox(width: 2),
                AppIcon(AppIcons.chevronDown, size: 18, color: c.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 44dp circular flag button for the Home and Child home headers.
class LanguageFlagButton extends ConsumerWidget {
  const LanguageFlagButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lang = ref.watch(languageProvider);
    final s = ref.watch(screenStringsProvider('_default'));
    final c = context.colors;
    return Semantics(
      button: true,
      label: s.t('a11y.language_button', {'language': lang.nativeName}),
      excludeSemantics: true,
      child: PressScale(
        onTap: () => showLanguageSheet(context),
        child: Container(
          width: Sizes.headerButton,
          height: Sizes.headerButton,
          padding: const EdgeInsets.all(9),
          decoration: BoxDecoration(
            color: c.surface,
            shape: BoxShape.circle,
            border: Border.all(color: c.border),
          ),
          child: ClipOval(child: SvgPicture.asset(lang.flagAsset)),
        ),
      ),
    );
  }
}

/// Bottom sheet "Language": one 56dp row per ENABLED language (flag, native name, English name in
/// parentheses, radio). Selecting applies instantly, closes the sheet and saves the choice.
/// [onSelected] lets signed-in screens also save the language on the account.
Future<void> showLanguageSheet(BuildContext context, {ValueChanged<String>? onSelected}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    sheetAnimationStyle: AnimationStyle(duration: Motion.of(context, Motion.languageSheet), curve: Motion.decelerate),
    builder: (_) => _LanguageSheet(onSelected: onSelected),
  );
}

class _LanguageSheet extends ConsumerStatefulWidget {
  const _LanguageSheet({this.onSelected});
  final ValueChanged<String>? onSelected;

  @override
  ConsumerState<_LanguageSheet> createState() => _LanguageSheetState();
}

class _LanguageSheetState extends ConsumerState<_LanguageSheet> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 400))..forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final current = ref.watch(languageProvider);
    final enabled = ref.watch(enabledLanguagesProvider);
    final s = ref.watch(screenStringsProvider('language_sheet'));
    final langs = supportedLanguages.where((l) => enabled.contains(l.code)).toList();
    final reduce = Motion.reduced(context);
    final c = context.colors;
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, 0, Space.screenHorizontal, Space.xs),
            child: Semantics(
              header: true,
              child: Text(s.t('lang.sheet_title'), style: Theme.of(context).textTheme.headlineSmall),
            ),
          ),
          Flexible(
            child: RadioGroup<String>(
              groupValue: current.code,
              onChanged: (code) async {
                if (code == null) return;
                await ref.read(languageProvider.notifier).select(code);
                widget.onSelected?.call(code);
                if (context.mounted) Navigator.of(context).pop();
              },
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (var i = 0; i < langs.length; i++)
                    _staggered(
                      i,
                      reduce,
                      RadioListTile<String>(
                        value: langs[i].code,
                        controlAffinity: ListTileControlAffinity.trailing,
                        activeColor: c.primaryText,
                        contentPadding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
                        visualDensity: VisualDensity.standard,
                        secondary: ClipOval(child: SvgPicture.asset(langs[i].flagAsset, width: 28, height: 28)),
                        title: Text(
                          langs[i].code == 'en'
                              ? langs[i].nativeName
                              : '${langs[i].nativeName} (${langs[i].englishName})',
                          style: Theme.of(context).textTheme.bodyLarge,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: Space.xs),
        ],
      ),
    );
  }

  /// Rows appear with a 30 ms stagger.
  Widget _staggered(int i, bool reduce, Widget child) {
    if (reduce) {
      return ConstrainedBox(
        constraints: const BoxConstraints(minHeight: Sizes.bottomSheetRow),
        child: child,
      );
    }
    final start = (i * MotionMs.languageRowStaggerMs) / 400.0;
    final a = CurvedAnimation(
      parent: _c,
      curve: Interval(start.clamp(0, 0.8), (start + 0.5).clamp(0, 1), curve: Motion.decelerate),
    );
    return FadeTransition(
      opacity: a,
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.15), end: Offset.zero).animate(a),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: Sizes.bottomSheetRow),
          child: child,
        ),
      ),
    );
  }
}
