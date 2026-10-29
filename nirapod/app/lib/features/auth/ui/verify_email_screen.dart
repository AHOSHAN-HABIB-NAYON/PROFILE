import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/net/api_error.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/widgets/auth_scaffold.dart';
import '../../../core/widgets/code_cells.dart';
import '../../../core/widgets/success_check.dart';
import '../../../nav/router.dart';
import '../data/auth_api.dart';
import '../data/auth_errors.dart';
import '../data/auth_flow.dart';
import '../data/auth_service.dart';
import 'auth_widgets.dart';

/// Maps a resend failure to a plain-language key.
String? resendErrorKey(Object e) {
  if (e is! ApiError) return 'err.unknown';
  if (e.kind == ApiErrorKind.rateLimited) return 'verify.err_resend_limit';
  return e.messageKey;
}

class VerifyEmailScreen extends ConsumerStatefulWidget {
  const VerifyEmailScreen({super.key, this.successDelay = const Duration(milliseconds: 900)});
  final Duration successDelay;

  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  final _cells = GlobalKey<CodeCellsState>();
  bool _loading = false;
  bool _locked = false;
  bool _done = false;
  String? _error;
  Map<String, Object> _errorArgs = const {};

  Future<void> _verify(String code) async {
    final email = ref.read(authFlowProvider).verifyEmail;
    if (email == null || _loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final s = await ref.read(authServiceProvider).verifyEmail(email, code);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _done = true;
      });
      await Future<void>.delayed(widget.successDelay);
      if (!mounted) return;
      context.go(locationFor(destinationAfterAuth(s.user, needsProfileSetup: s.needsProfileSetup || s.user.name == null)));
    } on ApiError catch (e) {
      if (!mounted) return;
      final (key, args) = codeErrorKey(e);
      setState(() {
        _loading = false;
        _error = key;
        _errorArgs = args;
        _locked = key == 'verify.err_locked';
      });
      if (!_locked) _cells.currentState?.clear();
    }
  }

  Future<String?> _resend() async {
    final email = ref.read(authFlowProvider).verifyEmail;
    if (email == null) return 'err.unknown';
    try {
      await ref.read(authApiProvider).resendCode(email: email, purpose: 'verify_email');
      setState(() {
        if (_error == 'verify.err_expired') _error = null;
      });
      return null;
    } catch (e) {
      return resendErrorKey(e);
    }
  }

  void _changeEmail() => context.canPop() ? context.pop() : context.go(locationFor('register'));

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('verify_email'));
    final email = ref.watch(authFlowProvider).verifyEmail;
    return AuthScaffold(
      backLabel: s.t('common.back'),
      body: _done ? _success(context, s) : _form(context, s, email),
    );
  }

  Widget _success(BuildContext context, Strings s) => Padding(
        padding: const EdgeInsets.only(top: Space.xxxl),
        child: Column(children: [
          SuccessCheck(semanticLabel: s.t('verify.verified')),
          const SizedBox(height: Space.lg),
          Semantics(liveRegion: true, child: Text(s.t('verify.verified'), style: Theme.of(context).textTheme.titleMedium)),
        ]),
      );

  Widget _form(BuildContext context, Strings s, String? email) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AuthHeading(
          title: s.t('verify.title'),
          // The address is user data: shown left-to-right inside any language.
          subtitle: s.t('verify.body', {'email': email == null ? '' : '\u2066$email\u2069'}),
        ),
        Text(s.t('verify.code_label'), style: Theme.of(context).textTheme.labelMedium!.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: Space.xs),
        CodeCells(
          key: _cells,
          enabled: !_loading && !_locked && email != null,
          error: _error != null,
          cellLabel: (n) => s.t('verify.digit', {'n': n}),
          onCompleted: _verify,
          onChanged: (v) {
            // clear() after a wrong code reports '' - keep the message until the user types again.
            if (v.isNotEmpty && _error != null && !_locked) setState(() => _error = null);
          },
        ),
        const SizedBox(height: Space.md),
        if (_loading) const Center(child: SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2))),
        if (_error != null) InlineMessage(s.t(_error!, _errorArgs)),
        const SizedBox(height: Space.md),
        ResendCodeButton(strings: s, onResend: _resend),
        AppButton(label: s.t('verify.change_email'), kind: ButtonKind.text, onPressed: _changeEmail),
        if (email == null)
          Text(s.t('err.unknown'), style: Theme.of(context).textTheme.bodySmall!.copyWith(color: context.colors.muted)),
      ],
    );
  }
}

