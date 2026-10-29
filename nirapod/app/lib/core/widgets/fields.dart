import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../icons/app_icon.dart';
import '../icons/app_icons.g.dart';
import '../motion/motion.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';

/// Text input with a visible label above (never placeholder-only), optional leading icon and an inline
/// plain-language error. Errors are announced by TalkBack.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.error,
    this.icon,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.onChanged,
    this.onSubmitted,
    this.obscure = false,
    this.suffix,
    this.enabled = true,
    this.maxLength,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.focusNode,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? error;
  final String? icon;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool obscure;
  final Widget? suffix;
  final bool enabled;
  final int? maxLength;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: t.labelMedium!.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: Space.xxs + 2),
        TextField(
          controller: controller,
          focusNode: focusNode,
          enabled: enabled,
          obscureText: obscure,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          autofillHints: autofillHints,
          onChanged: onChanged,
          onSubmitted: onSubmitted,
          maxLength: maxLength,
          inputFormatters: inputFormatters,
          textCapitalization: textCapitalization,
          style: t.bodyLarge,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: t.bodyLarge!.copyWith(color: c.muted),
            counterText: '',
            prefixIcon: icon == null
                ? null
                : Padding(
                    padding: const EdgeInsets.all(12),
                    child: AppIcon(icon!, size: 20, color: c.muted),
                  ),
            suffixIcon: suffix,
            errorText: error,
            errorMaxLines: 3,
            errorStyle: t.bodySmall!.copyWith(color: c.dangerText),
          ),
        ),
      ],
    );
  }
}

/// Password input with an animated eye toggle (eye <-> eye-off cross-fade, 48dp target).
class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.label,
    required this.showLabel,
    required this.hideLabel,
    this.controller,
    this.error,
    this.onChanged,
    this.onSubmitted,
    this.textInputAction,
    this.newPassword = false,
  });

  final String label;
  final String showLabel;
  final String hideLabel;
  final TextEditingController? controller;
  final String? error;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final TextInputAction? textInputAction;
  final bool newPassword;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _visible = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppTextField(
      label: widget.label,
      controller: widget.controller,
      error: widget.error,
      icon: AppIcons.lock,
      obscure: !_visible,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      textInputAction: widget.textInputAction,
      keyboardType: TextInputType.visiblePassword,
      autofillHints: [widget.newPassword ? AutofillHints.newPassword : AutofillHints.password],
      suffix: Semantics(
        button: true,
        label: _visible ? widget.hideLabel : widget.showLabel,
        excludeSemantics: true,
        child: PressScale(
          haptic: false,
          onTap: () => setState(() => _visible = !_visible),
          // Fixed 48dp square at the end of the field (Center alone would take the whole width).
          child: SizedBox.square(
            dimension: 48,
            child: Center(
            child: AnimatedSwitcher(
              duration: Motion.of(context, const Duration(milliseconds: 200)),
              transitionBuilder: (child, a) => FadeTransition(
                opacity: a,
                child: ScaleTransition(scale: a, child: child),
              ),
              child: AppIcon(
                _visible ? AppIcons.eyeOff : AppIcons.eye,
                key: ValueKey(_visible),
                size: 20,
                color: c.muted,
              ),
            ),
          ),
          ),
        ),
      ),
    );
  }
}

/// "—— or ——" divider.
class OrDivider extends StatelessWidget {
  const OrDivider(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Space.sm),
    child: Row(
      children: [
        const Expanded(child: Divider()),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.sm),
          child: Text(text, style: Theme.of(context).textTheme.bodySmall),
        ),
        const Expanded(child: Divider()),
      ],
    ),
  );
}
