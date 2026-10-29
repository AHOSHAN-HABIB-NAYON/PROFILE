import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/net/api_error.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/widgets/auth_scaffold.dart';
import '../../../core/widgets/code_cells.dart';
import '../../../core/widgets/fields.dart';
import '../../../core/widgets/success_check.dart';
import '../../../nav/router.dart';
import '../data/auth_api.dart';
import '../data/auth_flow.dart';
import '../data/validators.dart';
import 'auth_widgets.dart';
import 'verify_email_screen.dart' show resendErrorKey;

const _ns = 'forgot';

/// Step 1: email. The reply is ALWAYS "If this email exists, we sent a code" (no account enumeration).
class ForgotEmailScreen extends ConsumerStatefulWidget {
  const ForgotEmailScreen({super.key});

  @override
  ConsumerState<ForgotEmailScreen> createState() => _ForgotEmailScreenState();
}

class _ForgotEmailScreenState extends ConsumerState<ForgotEmailScreen> {
  late final _email = TextEditingController(text: ref.read(authFlowProvider).forgotEmail ?? '');
  String? _emailError;
  String? _error;
  bool _loading = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final email = normalizeEmail(_email.text);
    setState(() {
      _error = null;
      _emailError = isValidEmail(email) ? null : 'auth.err_email';
    });
    if (_emailError != null) return;
    setState(() => _loading = true);
    try {
      await ref.read(authApiProvider).forgot(email);
    } on ApiError catch (e) {
      // Only a network problem is shown; any server answer reads the same (no enumeration).
      if (e.kind == ApiErrorKind.network || e.kind == ApiErrorKind.rateLimited) {
        if (mounted) {
          setState(() {
            _loading = false;
            _error = e.messageKey;
          });
        }
        return;
      }
    }
    ref.read(authFlowProvider.notifier).setForgotEmail(email);
    if (!mounted) return;
    setState(() => _loading = false);
    await context.push(locationFor('forgot_code'));
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider(_ns));
    return AuthScaffold(
      backLabel: s.t('common.back'),
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        AuthHeading(title: s.t('forgot.title'), subtitle: s.t('forgot.email_body')),
        AppTextField(
          label: s.t('auth.email'),
          hint: s.t('auth.email_hint'),
          controller: _email,
          icon: AppIcons.message,
          error: _emailError == null ? null : s.t(_emailError!),
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _send(),
          onChanged: (_) {
            if (_emailError != null || _error != null) setState(() => _emailError = _error = null);
          },
        ),
        const SizedBox(height: Space.md),
        if (_error != null) ...[InlineMessage(s.t(_error!)), const SizedBox(height: Space.md)],
        AppButton(label: s.t('forgot.send'), loading: _loading, onPressed: _loading ? null : _send),
      ]),
    );
  }
}

/// Step 2: the 6-digit code from the email. Checked by the server together with the new password.
class ForgotCodeScreen extends ConsumerWidget {
  const ForgotCodeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider(_ns));
    final email = ref.watch(authFlowProvider).forgotEmail;
    return AuthScaffold(
      backLabel: s.t('common.back'),
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InlineMessage(s.t('forgot.sent'), error: false),
        const SizedBox(height: Space.lg),
        AuthHeading(title: s.t('forgot.code_title'), subtitle: s.t('forgot.code_body')),
        CodeCells(
          enabled: email != null,
          cellLabel: (n) => s.t('verify.digit', {'n': n}),
          onCompleted: (code) {
            ref.read(authFlowProvider.notifier).setForgotCode(code);
            context.push(locationFor('forgot_new'));
          },
        ),
        const SizedBox(height: Space.lg),
        ResendCodeButton(
          strings: s,
          onResend: () async {
            if (email == null) return 'err.unknown';
            try {
              await ref.read(authApiProvider).resendCode(email: email, purpose: 'reset_password');
              return null;
            } catch (e) {
              return resendErrorKey(e);
            }
          },
        ),
      ]),
    );
  }
}

/// Step 3: new password with the same rules and strength meter.
class ForgotNewPasswordScreen extends ConsumerStatefulWidget {
  const ForgotNewPasswordScreen({super.key});

  @override
  ConsumerState<ForgotNewPasswordScreen> createState() => _ForgotNewPasswordScreenState();
}

class _ForgotNewPasswordScreenState extends ConsumerState<ForgotNewPasswordScreen> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _submitted = false;
  bool _loading = false;
  String? _error;
  bool _codeProblem = false;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _submitted = true;
      _error = null;
      _codeProblem = false;
    });
    if (!checkPassword(_password.text).ok || _confirm.text != _password.text) return;
    final flow = ref.read(authFlowProvider);
    if (flow.forgotEmail == null || flow.forgotCode == null) {
      setState(() {
        _error = 'forgot.err_code';
        _codeProblem = true;
      });
      return;
    }
    setState(() => _loading = true);
    try {
      await ref.read(authApiProvider).reset(email: flow.forgotEmail!, code: flow.forgotCode!, newPassword: _password.text);
      if (!mounted) return;
      context.go(locationFor('forgot_done'));
    } on ApiError catch (e) {
      if (!mounted) return;
      final code = e.code == 'CODE_INVALID' || e.code == 'CODE_EXPIRED' || e.status == 410;
      setState(() {
        _loading = false;
        _codeProblem = code;
        _error = code
            ? 'forgot.err_code'
            : (e.code == 'AUTH_LOCKED' || e.status == 423)
                ? 'verify.err_locked'
                : e.code == 'VALIDATION_FAILED'
                    ? 'auth.err_password'
                    : e.messageKey;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider(_ns));
    final pwError = _submitted && !checkPassword(_password.text).ok ? s.t('auth.err_password') : null;
    final cfError = _submitted && _confirm.text != _password.text ? s.t('auth.err_mismatch') : null;
    return AuthScaffold(
      backLabel: s.t('common.back'),
      body: AutofillGroup(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          AuthHeading(title: s.t('forgot.new_title')),
          PasswordField(
            label: s.t('forgot.new_password'),
            showLabel: s.t('auth.show_password'),
            hideLabel: s.t('auth.hide_password'),
            controller: _password,
            newPassword: true,
            error: pwError,
            textInputAction: TextInputAction.next,
            onChanged: (_) => setState(() {}),
          ),
          PasswordRulesView(password: _password.text, strings: s),
          const SizedBox(height: Space.md),
          PasswordField(
            label: s.t('auth.confirm_password'),
            showLabel: s.t('auth.show_password'),
            hideLabel: s.t('auth.hide_password'),
            controller: _confirm,
            newPassword: true,
            error: cfError,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _save(),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Space.md),
          if (_error != null) ...[InlineMessage(s.t(_error!)), const SizedBox(height: Space.xs)],
          if (_codeProblem)
            AppButton(
              label: s.t('forgot.enter_code_again'),
              kind: ButtonKind.text,
              onPressed: () => context.canPop() ? context.pop() : context.go(locationFor('forgot_code')),
            ),
          const SizedBox(height: Space.xs),
          AppButton(label: s.t('forgot.save'), loading: _loading, onPressed: _loading ? null : _save),
        ]),
      ),
    );
  }
}

/// Step 4: success, then back to the login page the user came from.
class ForgotDoneScreen extends ConsumerWidget {
  const ForgotDoneScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider(_ns));
    final t = Theme.of(context).textTheme;
    return AuthScaffold(
      showBack: false,
      body: Padding(
        padding: const EdgeInsets.only(top: Space.xxl),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Center(child: SuccessCheck(semanticLabel: s.t('forgot.done_title'))),
          const SizedBox(height: Space.lg),
          Semantics(header: true, child: Text(s.t('forgot.done_title'), style: t.headlineSmall, textAlign: TextAlign.center)),
          const SizedBox(height: Space.xs),
          Text(s.t('forgot.done_body'), style: t.bodyMedium, textAlign: TextAlign.center),
          const SizedBox(height: Space.xl),
          AppButton(
            label: s.t('forgot.back_to_login'),
            onPressed: () {
              ref.read(authFlowProvider.notifier).clear();
              context.go(locationFor(loginScreenFor(savedRoleChoiceOf(ref))));
            },
          ),
        ]),
      ),
    );
  }
}
