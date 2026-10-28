import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/theme/app_theme.dart';

double _lin(double c) => c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
double _lum(Color c) => 0.2126 * _lin(c.r) + 0.7152 * _lin(c.g) + 0.0722 * _lin(c.b);
double contrast(Color a, Color b) {
  final x = _lum(a), y = _lum(b);
  return (math.max(x, y) + 0.05) / (math.min(x, y) + 0.05);
}

void main() {
  for (final (name, c) in [('light', AppColors.light), ('dark', AppColors.dark)]) {
    test('WCAG AA text contrast ($name)', () {
      final pairs = {
        'text/background': (c.text, c.background),
        'text/surface': (c.text, c.surface),
        'muted/background': (c.muted, c.background),
        'muted/surface': (c.muted, c.surface),
        'primaryText/surface': (c.primaryText, c.surface),
        'primaryText/background': (c.primaryText, c.background),
        'onPrimaryFill/primaryFill': (c.onPrimaryFill, c.primaryFill),
        'onDanger/danger': (c.onDanger, c.danger),
        'warningText/surface': (c.warningText, c.surface),
        'successText/surface': (c.successText, c.surface),
        'dangerText/surface': (c.dangerText, c.surface),
      };
      pairs.forEach((k, v) => expect(contrast(v.$1, v.$2), greaterThanOrEqualTo(4.5), reason: '$name $k'));
    });

    test('non-text UI contrast >= 3:1 ($name)', () {
      expect(contrast(c.primary, c.surface), greaterThanOrEqualTo(3.0));
      expect(contrast(c.danger, c.surface), greaterThanOrEqualTo(3.0));
    });
  }

  test('brand tokens are exactly the spec values', () {
    expect(AppColors.light.background, const Color(0xFFF6F8F7));
    expect(AppColors.light.surface, const Color(0xFFFFFFFF));
    expect(AppColors.light.border, const Color(0xFFE5EAE8));
    expect(AppColors.light.text, const Color(0xFF0F2A24));
    expect(AppColors.dark.background, const Color(0xFF0B1512));
    expect(AppColors.dark.surface, const Color(0xFF121F1B));
    expect(AppColors.dark.border, const Color(0xFF20322D));
    expect(AppColors.dark.text, const Color(0xFFE8F1EE));
    expect(AppColors.light.primary, const Color(0xFF059669));
    expect(AppColors.light.accent, const Color(0xFF14B8A6));
    expect(AppColors.light.danger, const Color(0xFFDC2626));
    expect(AppColors.light.warning, const Color(0xFFD97706));
  });
}
