import 'package:flutter/material.dart';

import '../motion/motion.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';

enum ButtonKind { primary, secondary, danger, text }

/// Buttons from the component set. Labels wrap instead of truncating (Bengali/Arabic are 30-40% longer).
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.kind = ButtonKind.primary,
    this.loading = false,
    this.leading,
    this.large = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final ButtonKind kind;
  final bool loading;
  final Widget? leading;

  /// 56dp / radius 18 (Welcome "Get Started" and other hero actions).
  final bool large;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final enabled = onPressed != null && !loading;
    final (bg, fg, border) = switch (kind) {
      ButtonKind.primary => (c.primaryFill, c.onPrimaryFill, null),
      ButtonKind.danger => (c.danger, c.onDanger, null),
      ButtonKind.secondary => (c.surface, c.primaryText, c.border),
      ButtonKind.text => (Colors.transparent, c.primaryText, null),
    };
    final style = Theme.of(context).textTheme.labelLarge!.copyWith(color: fg);
    final child = Container(
      constraints: BoxConstraints(minHeight: large ? Sizes.primaryButtonHeight : Sizes.minTouchTarget),
      padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
      decoration: BoxDecoration(
        color: enabled ? bg : bg.withValues(alpha: kind == ButtonKind.text ? 0 : 0.5),
        borderRadius: BorderRadius.circular(large ? Radii.buttonLarge : Radii.input),
        border: border == null ? null : Border.all(color: border),
      ),
      alignment: Alignment.center,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (loading) ...[
            SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2, color: fg)),
            const SizedBox(width: Space.xs),
          ] else if (leading != null) ...[
            leading!,
            const SizedBox(width: Space.xs),
          ],
          Flexible(child: Text(label, style: style, textAlign: TextAlign.center, softWrap: true)),
        ],
      ),
    );
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: PressScale(onTap: enabled ? onPressed : null, child: child),
    );
  }
}
