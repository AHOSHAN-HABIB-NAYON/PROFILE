import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// Semantic colors for one brightness. Text roles use the AA-safe variants (DECISIONS D-004).
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.background,
    required this.surface,
    required this.border,
    required this.inputBorder,
    required this.text,
    required this.muted,
    required this.primary,
    required this.primaryText,
    required this.primaryFill,
    required this.primaryFillPressed,
    required this.onPrimaryFill,
    required this.accent,
    required this.danger,
    required this.dangerText,
    required this.onDanger,
    required this.warning,
    required this.warningText,
    required this.success,
    required this.successText,
  });

  final Color background, surface, border, inputBorder, text, muted;
  final Color primary, primaryText, primaryFill, primaryFillPressed, onPrimaryFill, accent;
  final Color danger, dangerText, onDanger, warning, warningText, success, successText;

  static const light = AppColors(
    background: LightColors.background,
    surface: LightColors.surface,
    border: LightColors.border,
    inputBorder: LightColors.inputBorder,
    text: LightColors.text,
    muted: LightColors.mutedText,
    primary: BrandColors.primary,
    primaryText: LightColors.primaryText,
    primaryFill: LightColors.primaryFill,
    primaryFillPressed: LightColors.primaryFillPressed,
    onPrimaryFill: BrandColors.onPrimary,
    accent: BrandColors.accent,
    danger: BrandColors.danger,
    dangerText: LightColors.dangerText,
    onDanger: BrandColors.onDanger,
    warning: BrandColors.warning,
    warningText: LightColors.warningText,
    success: BrandColors.success,
    successText: LightColors.successText,
  );

  static const dark = AppColors(
    background: DarkColors.background,
    surface: DarkColors.surface,
    border: DarkColors.border,
    inputBorder: DarkColors.inputBorder,
    text: DarkColors.text,
    muted: DarkColors.mutedText,
    primary: BrandColors.primary,
    primaryText: DarkColors.primaryText,
    primaryFill: DarkColors.primaryFill,
    primaryFillPressed: DarkColors.primaryFillPressed,
    onPrimaryFill: DarkColors.onPrimaryFill,
    accent: BrandColors.accent,
    danger: BrandColors.danger,
    dangerText: DarkColors.dangerText,
    onDanger: BrandColors.onDanger,
    warning: BrandColors.warning,
    warningText: DarkColors.warningText,
    success: BrandColors.success,
    successText: DarkColors.successText,
  );

  @override
  AppColors copyWith() => this;

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColors(
      background: l(background, other.background),
      surface: l(surface, other.surface),
      border: l(border, other.border),
      inputBorder: l(inputBorder, other.inputBorder),
      text: l(text, other.text),
      muted: l(muted, other.muted),
      primary: l(primary, other.primary),
      primaryText: l(primaryText, other.primaryText),
      primaryFill: l(primaryFill, other.primaryFill),
      primaryFillPressed: l(primaryFillPressed, other.primaryFillPressed),
      onPrimaryFill: l(onPrimaryFill, other.onPrimaryFill),
      accent: l(accent, other.accent),
      danger: l(danger, other.danger),
      dangerText: l(dangerText, other.dangerText),
      onDanger: l(onDanger, other.onDanger),
      warning: l(warning, other.warning),
      warningText: l(warningText, other.warningText),
      success: l(success, other.success),
      successText: l(successText, other.successText),
    );
  }
}

extension AppThemeContext on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
}

/// Font family and line-height choice per script of the selected language.
String fontFamilyFor(String script) => switch (script) {
      'bengali' => FontFamilies.bengali,
      'arabic' => FontFamilies.arabic,
      'urdu' => FontFamilies.urdu,
      'devanagari' => FontFamilies.devanagari,
      _ => FontFamilies.latin,
    };

/// Fallback chain so mixed-script names (e.g. a Bengali name in an English UI) still render.
const fontFallback = <String>[
  FontFamilies.latin,
  FontFamilies.bengali,
  FontFamilies.arabic,
  FontFamilies.devanagari,
];

TextStyle _style(TypeStep s, Color color, {required bool tall}) => TextStyle(
      fontSize: s.size,
      fontWeight: FontWeight.values[(s.weight ~/ 100) - 1],
      // Variable fonts: set the wght axis explicitly so weights render the same on every device.
      fontVariations: [FontVariation('wght', s.weight.toDouble())],
      height: tall ? s.lineHeightBengali : s.lineHeight,
      color: color,
      fontFamilyFallback: fontFallback,
    );

ThemeData buildTheme({required Brightness brightness, required String script}) {
  final c = brightness == Brightness.dark ? AppColors.dark : AppColors.light;
  // Bengali, Devanagari and Nastaliq need taller lines so marks are never clipped.
  final tall = script == 'bengali' || script == 'devanagari' || script == 'urdu';
  final text = TextTheme(
    displaySmall: _style(TypeScale.display, c.text, tall: tall),
    headlineSmall: _style(TypeScale.title, c.text, tall: tall),
    titleMedium: _style(TypeScale.subtitle, c.text, tall: tall),
    bodyLarge: _style(TypeScale.body, c.text, tall: tall),
    bodyMedium: _style(TypeScale.body, c.text, tall: tall),
    bodySmall: _style(TypeScale.caption, c.muted, tall: tall),
    labelLarge: _style(TypeStep(TypeScale.body.size, 600, TypeScale.body.lineHeight, TypeScale.body.lineHeightBengali), c.text, tall: tall),
    labelMedium: _style(TypeScale.caption, c.text, tall: tall),
    // The remaining Material styles get the same fonts and fallback chain (৳, Bengali names, etc. never show as boxes).
    headlineMedium: _style(TypeScale.display, c.text, tall: tall),
    titleLarge: _style(TypeScale.title, c.text, tall: tall),
    titleSmall: _style(TypeStep(TypeScale.body.size, 600, TypeScale.body.lineHeight, TypeScale.body.lineHeightBengali), c.text, tall: tall),
    labelSmall: _style(const TypeStep(12, 500, 1.35, 1.5), c.muted, tall: tall),
  );
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.primaryFill,
    onPrimary: c.onPrimaryFill,
    secondary: c.accent,
    onSecondary: brightness == Brightness.dark ? DarkColors.background : LightColors.text,
    error: c.danger,
    onError: c.onDanger,
    surface: c.surface,
    onSurface: c.text,
    outline: c.border,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.background,
    fontFamily: fontFamilyFor(script),
    textTheme: text,
    extensions: [c],
    splashFactory: NoSplash.splashFactory, // press feedback is our own scale + haptic
    materialTapTargetSize: MaterialTapTargetSize.padded,
    dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.card),
        side: BorderSide(color: c.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.sm),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.input), borderSide: BorderSide(color: c.inputBorder)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.input), borderSide: BorderSide(color: c.inputBorder)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.input), borderSide: BorderSide(color: c.primary, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.input), borderSide: BorderSide(color: c.danger)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surface,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.cardLarge))),
    ),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
    }),
  );
}
