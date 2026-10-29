import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/net/api_error.dart';
import '../../../core/prefs/prefs.dart';
import '../../../core/session/session.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/widgets/auth_scaffold.dart';
import '../../../core/widgets/fields.dart';
import '../../../nav/router.dart';
import '../data/auth_api.dart';
import '../data/auth_errors.dart';
import '../data/auth_flow.dart';
import '../data/auth_service.dart';
import '../data/validators.dart';
import 'auth_widgets.dart';
import 'google_flow.dart';

/// Login for Parent / Probashi / Other family member (screens login_parent, login_probashi, login_member).
/// The role only selects the UI; the real role comes from the server.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, required this.role});
  final RoleChoice role;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _invite = TextEditingController();
  String? _emailError;
  String? _passwordError;
  String? _error;
  bool _loading = false;
  bool _googleLoading = false;

  @override
  void initState() {
    super.initState();
    // Remember the role so "Back to log in" and the next app start return to this page.
    unawaited(ref.read(prefsProvider).setString(PrefKeys.roleChoice, widget.role.name));
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _invite.dispose();
    super.dispose();
  }

  String get _titleKey => switch (widget.role) {
        RoleChoice.probashi => 'auth.login_probashi',
        RoleChoice.member => 'auth.login_member',
        _ => 'auth.login_parent',
      };

  Future<void> _login() async {
    final email = normalizeEmail(_email.text);
    setState(() {
      _error = null;
      _emailError = isValidEmail(email) ? null : 'auth.err_email';
      _passwordError = _password.text.isEmpty ? 'auth.err_required' : null;
    });
    if (_emailError != null || _passwordError != null) return;
    setState(() => _loading = true);
    try {
      final s = await ref.read(authServiceProvider).login(email, _password.text);
      await _acceptInvite();
      if (!mounted) return;
      context.go(locationFor(destinationAfterAuth(s.user, needsProfileSetup: s.needsProfileSetup)));
    } on ApiError catch (e) {
      if (!mounted) return;
      if (loginFailureKind(e) == LoginFailure.verifyEmail) {
        ref.read(authFlowProvider.notifier).setVerifyEmail(email);
        unawaited(ref.read(authApiProvider).resendCode(email: email, purpose: 'verify_email').catchError((Object _) {}));
        setState(() => _loading = false);
        unawaited(context.push(locationFor('verify_email')));
        return;
      }
      setState(() {
        _loading = false;
        _error = loginErrorKey(e);
      });
    }
  }

  /// Other family member: optional invite code, accepted right after login.
  Future<void> _acceptInvite() async {
    if (widget.role != RoleChoice.member) return;
    final code = normalizeFamilyCode(_invite.text);
    if (code.isEmpty) return;
    try {
      await ref.read(authApiProvider).acceptInvite(code);
    } on ApiError catch (_) {
      if (!mounted) return;
      final s = ref.read(screenStringsProvider('login'));
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s.t('auth.err_invite'))));
    }
  }

  Future<void> _google() async {
    setState(() {
      _googleLoading = true;
      _error = null;
    });
    final err = await runGoogleSignIn(context, ref);
    if (err == null && widget.role == RoleChoice.member) await _acceptInvite();
    if (!mounted) return;
    setState(() {
      _googleLoading = false;
      _error = err;
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('login'));
    final busy = _loading || _googleLoading;
    return AuthScaffold(
      backLabel: s.t('common.back'),
      footer: Column(mainAxisSize: MainAxisSize.min, children: [
        FooterPrompt(
          question: s.t('auth.new_here'),
          action: s.t('auth.create_account'),
          onTap: () => context.push(locationFor('register')),
        ),
        TextLink(label: s.t('auth.change_role'), bold: false, onTap: () => context.go(locationFor('role'))),
      ]),
      body: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AuthHeading(title: s.t(_titleKey), subtitle: s.t('auth.welcome_back')),
            AppTextField(
              label: s.t('auth.email'),
              hint: s.t('auth.email_hint'),
              controller: _email,
              icon: AppIcons.mail,
              error: _emailError == null ? null : s.t(_emailError!),
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.email],
              enabled: !busy,
              onChanged: (_) {
                if (_emailError != null || _error != null) setState(() => _emailError = _error = null);
              },
            ),
            const SizedBox(height: Space.md),
            PasswordField(
              label: s.t('auth.password'),
              showLabel: s.t('auth.show_password'),
              hideLabel: s.t('auth.hide_password'),
              controller: _password,
              error: _passwordError == null ? null : s.t(_passwordError!),
              textInputAction: widget.role == RoleChoice.member ? TextInputAction.next : TextInputAction.done,
              onSubmitted: (_) => widget.role == RoleChoice.member ? null : _login(),
              onChanged: (_) {
                if (_passwordError != null || _error != null) setState(() => _passwordError = _error = null);
              },
            ),
            if (widget.role == RoleChoice.member) ...[
              const SizedBox(height: Space.md),
              AppTextField(
                label: s.t('auth.invite_code'),
                hint: s.t('auth.invite_code_hint'),
                controller: _invite,
                icon: AppIcons.users,
                maxLength: 8,
                enabled: !busy,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9 -]'))],
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _login(),
              ),
            ],
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextLink(label: s.t('auth.forgot'), onTap: busy ? null : () => context.push(locationFor('forgot_email'))),
            ),
            if (_error != null) ...[InlineMessage(s.t(_error!)), const SizedBox(height: Space.md)],
            AppButton(label: s.t('auth.log_in'), loading: _loading, onPressed: busy ? null : _login),
            OrDivider(s.t('auth.or')),
            GoogleButton(label: s.t('auth.google'), loading: _googleLoading, onPressed: busy ? null : _google),
          ],
        ),
      ),
    );
  }
}
