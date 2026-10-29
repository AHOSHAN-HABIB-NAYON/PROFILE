import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/net/api_error.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/widgets/auth_scaffold.dart';
import '../../../core/widgets/fields.dart';
import '../../../nav/router.dart';
import '../data/auth_api.dart';
import '../data/auth_errors.dart';
import '../data/auth_flow.dart';
import '../data/validators.dart';
import 'auth_widgets.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  late final _email = TextEditingController(text: ref.read(authFlowProvider).verifyEmail ?? '');
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _agreed = false;
  bool _submitted = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String? get _emailError => !_submitted || isValidEmail(_email.text) ? null : 'auth.err_email';
  String? get _passwordError => !_submitted || checkPassword(_password.text).ok ? null : 'auth.err_password';
  String? get _confirmError => !_submitted || _confirm.text == _password.text ? null : 'auth.err_mismatch';

  Future<void> _create() async {
    setState(() {
      _submitted = true;
      _error = null;
    });
    if (_emailError != null || _passwordError != null || _confirmError != null || !_agreed) return;
    final email = normalizeEmail(_email.text);
    setState(() => _loading = true);
    try {
      await ref.read(authApiProvider).register(email: email, password: _password.text, language: ref.read(languageProvider).code);
      ref.read(authFlowProvider.notifier).setVerifyEmail(email);
      if (!mounted) return;
      setState(() => _loading = false);
      await context.push(locationFor('verify_email'));
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = registerErrorKey(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('register'));
    String? t(String? k) => k == null ? null : s.t(k);
    return AuthScaffold(
      backLabel: s.t('common.back'),
      body: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AuthHeading(title: s.t('auth.register_title')),
            AppTextField(
              label: s.t('auth.email'),
              hint: s.t('auth.email_hint'),
              controller: _email,
              icon: AppIcons.message,
              error: t(_emailError),
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.email],
              onChanged: (_) => setState(() => _error = null),
            ),
            const SizedBox(height: Space.md),
            PasswordField(
              label: s.t('auth.password'),
              showLabel: s.t('auth.show_password'),
              hideLabel: s.t('auth.hide_password'),
              controller: _password,
              newPassword: true,
              error: t(_passwordError),
              textInputAction: TextInputAction.next,
              onChanged: (_) => setState(() => _error = null),
            ),
            PasswordRulesView(password: _password.text, strings: s),
            const SizedBox(height: Space.md),
            PasswordField(
              label: s.t('auth.confirm_password'),
              showLabel: s.t('auth.show_password'),
              hideLabel: s.t('auth.hide_password'),
              controller: _confirm,
              newPassword: true,
              error: t(_confirmError),
              textInputAction: TextInputAction.done,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: Space.md),
            AgeTermsCheckbox(
              value: _agreed,
              strings: s,
              error: _submitted && !_agreed,
              onChanged: (v) => setState(() => _agreed = v),
            ),
            if (_submitted && !_agreed) InlineMessage(s.t('auth.err_age_terms')),
            if (_error != null) ...[const SizedBox(height: Space.xs), InlineMessage(s.t(_error!))],
            const SizedBox(height: Space.lg),
            AppButton(label: s.t('auth.create_account'), loading: _loading, onPressed: _loading ? null : _create),
            const SizedBox(height: Space.md),
            FooterPrompt(
              question: s.t('auth.have_account'),
              action: s.t('auth.log_in'),
              onTap: () => context.canPop() ? context.pop() : context.go(locationFor(loginScreenFor(savedRoleChoiceOf(ref)))),
            ),
          ],
        ),
      ),
    );
  }
}
