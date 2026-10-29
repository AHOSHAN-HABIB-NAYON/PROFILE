import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/net/api_error.dart';
import '../../core/net/providers.dart';
import '../../core/state/buttons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/widgets/fields.dart';
import '../../nav/router.dart';
import '../auth/data/validators.dart';
import '../auth/ui/auth_widgets.dart';

/// Profile > Change password (email accounts): current password, new password with the same rules, confirm.
/// Other devices are signed out on success.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _submitted = false;
  bool _loading = false;
  String? _currentError;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _submitted = true;
      _error = null;
      _currentError = null;
    });
    if (_current.text.isEmpty || !checkPassword(_password.text).ok || _confirm.text != _password.text) return;
    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).post<dynamic>('/auth/change-password', data: {'current_password': _current.text, 'new_password': _password.text});
      if (!mounted) return;
      final s = ref.read(screenStringsProvider('change_password'));
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('chpw.done'))));
      context.canPop() ? context.pop() : context.go(locationFor('profile'));
    } catch (e) {
      final err = ApiError.from(e);
      if (!mounted) return;
      setState(() {
        if (err.code == 'AUTH_INVALID_CREDENTIALS') {
          _currentError = 'chpw.wrong_current';
        } else if (err.code == 'VALIDATION_FAILED') {
          _error = 'auth.err_password';
        } else {
          _error = err.messageKey;
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('change_password'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final pwError = _submitted && !checkPassword(_password.text).ok ? s.t('auth.err_password') : null;
    final cfError = _submitted && _confirm.text != _password.text ? s.t('auth.err_mismatch') : null;
    final curError = _currentError != null ? s.t(_currentError!) : (_submitted && _current.text.isEmpty ? s.t('chpw.need_current') : null);
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('chpw.title')), backgroundColor: c.background),
      body: SafeArea(
        top: false,
        child: Column(children: [
          Expanded(
            child: AutofillGroup(
              child: ListView(padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.sm, Space.screenHorizontal, Space.md), children: [
                Row(children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.12), shape: BoxShape.circle),
                    alignment: Alignment.center,
                    child: AppIcon(AppIcons.lock, size: 22, color: c.primaryText),
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(child: Text(s.t('chpw.intro'), style: t.bodyMedium!.copyWith(color: c.muted))),
                ]),
                const SizedBox(height: Space.lg),
                PasswordField(
                  label: s.t('chpw.current'),
                  showLabel: s.t('auth.show_password'),
                  hideLabel: s.t('auth.hide_password'),
                  controller: _current,
                  error: curError,
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => setState(() => _currentError = null),
                ),
                const SizedBox(height: Space.md),
                PasswordField(
                  label: s.t('chpw.new'),
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
                if (_error != null) ...[const SizedBox(height: Space.sm), InlineMessage(s.t(_error!))],
                const SizedBox(height: Space.sm),
                Text(s.t('chpw.others_signed_out'), style: t.bodySmall!.copyWith(color: c.muted)),
              ]),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.md),
            child: AppButton(label: s.t('chpw.save'), loading: _loading, onPressed: _loading ? null : _save),
          ),
        ]),
      ),
    );
  }
}
