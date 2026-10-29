import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../nav/router.dart';
import '../data/validators.dart';

/// Title + optional subtitle at the top of an auth page. Text always wraps.
class AuthHeading extends StatelessWidget {
  const AuthHeading({super.key, required this.title, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Semantics(
        header: true,
        child: Text(title, style: t.headlineSmall!.copyWith(fontSize: 26, fontWeight: FontWeight.w700, fontVariations: const [FontVariation('wght', 700)])),
      ),
      if (subtitle != null) ...[
        const SizedBox(height: Space.xxs),
        Text(subtitle!, style: t.bodyMedium!.copyWith(color: context.colors.muted)),
      ],
      const SizedBox(height: Space.lg),
    ]);
  }
}

/// Inline plain-language message (icon + text, never colour alone), announced by TalkBack.
class InlineMessage extends StatelessWidget {
  const InlineMessage(this.text, {super.key, this.error = true});
  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = error ? c.dangerText : c.primaryText;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: Space.xs + 2),
        decoration: BoxDecoration(
          color: (error ? c.danger : c.primary).withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(Radii.input),
          border: Border.all(color: (error ? c.danger : c.primary).withValues(alpha: 0.3)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AppIcon(error ? AppIcons.alertCircle : AppIcons.checkCircle, size: 20, color: color),
          const SizedBox(width: Space.xs),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium!.copyWith(color: c.text))),
        ]),
      ),
    );
  }
}

/// "Continue with Google" with the SVG Google G.
class GoogleButton extends StatelessWidget {
  const GoogleButton({super.key, required this.label, required this.onPressed, this.loading = false});
  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) => AppButton(
        label: label,
        kind: ButtonKind.secondary,
        loading: loading,
        onPressed: onPressed,
        leading: SvgPicture.asset(BrandAssets.googleG, width: 20, height: 20, excludeFromSemantics: true),
      );
}

/// Strength meter + rule checklist for a new password.
class PasswordRulesView extends StatelessWidget {
  const PasswordRulesView({super.key, required this.password, required this.strings});
  final String password;
  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final c = context.colors;
    final check = checkPassword(password);
    final strength = passwordStrength(password);
    final level = switch (strength) {
      PasswordStrength.weak => s.t('auth.strength_weak'),
      PasswordStrength.fair => s.t('auth.strength_fair'),
      PasswordStrength.good => s.t('auth.strength_good'),
      PasswordStrength.strong => s.t('auth.strength_strong'),
    };
    final filled = password.isEmpty ? 0 : strength.index + 1;
    final color = switch (strength) {
      PasswordStrength.weak => c.danger,
      PasswordStrength.fair => c.warning,
      _ => c.success,
    };
    final t = Theme.of(context).textTheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: Space.xs),
      Semantics(
        label: password.isEmpty ? null : s.t('auth.strength', {'level': level}),
        excludeSemantics: true,
        child: Row(children: [
          for (var i = 0; i < 4; i++) ...[
            if (i > 0) const SizedBox(width: Space.xxs),
            Expanded(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                height: 4,
                decoration: BoxDecoration(color: i < filled ? color : c.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
          ],
        ]),
      ),
      if (password.isNotEmpty) ...[
        const SizedBox(height: Space.xxs),
        Text(s.t('auth.strength', {'level': level}), style: t.bodySmall!.copyWith(color: c.muted)),
      ],
      const SizedBox(height: Space.xs),
      _rule(context, s.t('auth.rule_length'), check.length),
      _rule(context, s.t('auth.rule_letter_number'), check.letterAndNumber),
      _rule(context, s.t('auth.rule_common'), password.isNotEmpty && check.notCommon),
    ]);
  }

  Widget _rule(BuildContext context, String text, bool ok) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Semantics(
        checked: ok,
        label: text,
        excludeSemantics: true,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AppIcon(ok ? AppIcons.checkCircle : AppIcons.info, size: 18, color: ok ? c.successText : c.muted),
          const SizedBox(width: Space.xs),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodySmall!.copyWith(color: ok ? c.text : c.muted))),
        ]),
      ),
    );
  }
}

/// Mandatory "I am 18 or older and I agree to the Terms and Privacy Policy" with tappable links.
class AgeTermsCheckbox extends StatefulWidget {
  const AgeTermsCheckbox({super.key, required this.value, required this.onChanged, required this.strings, this.error = false});
  final bool value;
  final ValueChanged<bool> onChanged;
  final Strings strings;
  final bool error;

  @override
  State<AgeTermsCheckbox> createState() => _AgeTermsCheckboxState();
}

class _AgeTermsCheckboxState extends State<AgeTermsCheckbox> {
  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final c = context.colors;
    final full = s.t('auth.age_terms');
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      MergeSemantics(
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox.square(
            dimension: Sizes.minTouchTarget,
            child: Checkbox(
              value: widget.value,
              isError: widget.error,
              activeColor: c.primaryFill,
              onChanged: (v) => widget.onChanged(v ?? false),
            ),
          ),
          const SizedBox(width: Space.xxs),
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => widget.onChanged(!widget.value),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(full, style: Theme.of(context).textTheme.bodyMedium),
              ),
            ),
          ),
        ]),
      ),
      Padding(
        padding: const EdgeInsetsDirectional.only(start: Sizes.minTouchTarget),
        child: Wrap(spacing: Space.sm, children: [
          TextLink(label: s.t('auth.terms'), onTap: () => context.push(locationFor('legal_terms'))),
          TextLink(label: s.t('auth.privacy'), onTap: () => context.push(locationFor('legal_privacy'))),
        ]),
      ),
    ]);
  }
}

/// Text-only link (48dp target, wraps).
class TextLink extends StatelessWidget {
  const TextLink({super.key, required this.label, required this.onTap, this.bold = true});
  final String label;
  final VoidCallback? onTap;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Radii.input),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: Sizes.minTouchTarget, minWidth: Sizes.minTouchTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.xxs),
            child: Align(
              widthFactor: 1,
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelLarge!.copyWith(
                      color: onTap == null ? c.muted : c.primaryText,
                      fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
                    ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "Question? Action" footer row that wraps on narrow screens.
class FooterPrompt extends StatelessWidget {
  const FooterPrompt({super.key, required this.question, required this.action, required this.onTap});
  final String question;
  final String action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(question, style: Theme.of(context).textTheme.bodyMedium!.copyWith(color: context.colors.muted)),
          TextLink(label: action, onTap: onTap),
        ],
      );
}

/// "Resend code" that unlocks after a 30 s countdown. Counts sends and stops at 5 per hour (the server
/// is the authority and also answers 429).
class ResendCodeButton extends StatefulWidget {
  const ResendCodeButton({super.key, required this.strings, required this.onResend, this.cooldown = const Duration(seconds: 30)});
  final Strings strings;

  /// Returns null on success or an i18n error key.
  final Future<String?> Function() onResend;
  final Duration cooldown;

  @override
  State<ResendCodeButton> createState() => _ResendCodeButtonState();
}

class _ResendCodeButtonState extends State<ResendCodeButton> {
  static const maxPerHour = 5;
  Timer? _t;
  late int _left = widget.cooldown.inSeconds;
  final _sent = <DateTime>[];
  bool _busy = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _sent.add(DateTime.now()); // the first code was sent when this screen opened
    _start();
  }

  void _start() {
    _t?.cancel();
    _left = widget.cooldown.inSeconds;
    _t = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _left--);
      if (_left <= 0) t.cancel();
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  Future<void> _resend() async {
    final hourAgo = DateTime.now().subtract(const Duration(hours: 1));
    _sent.removeWhere((d) => d.isBefore(hourAgo));
    if (_sent.length >= maxPerHour) {
      setState(() {
        _message = widget.strings.t('verify.err_resend_limit');
        _messageIsError = true;
      });
      return;
    }
    setState(() => _busy = true);
    final err = await widget.onResend();
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (err == null) {
        _sent.add(DateTime.now());
        _message = widget.strings.t('verify.resent');
        _messageIsError = false;
        _start();
      } else {
        _message = widget.strings.t(err);
        _messageIsError = true;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final waiting = _left > 0;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AppButton(
        kind: ButtonKind.text,
        loading: _busy,
        label: waiting ? s.t('verify.resend_in', {'seconds': _left}) : s.t('verify.resend'),
        onPressed: waiting || _busy ? null : _resend,
      ),
      if (_message != null) ...[
        const SizedBox(height: Space.xs),
        InlineMessage(_message!, error: _messageIsError),
      ],
    ]);
  }
}
