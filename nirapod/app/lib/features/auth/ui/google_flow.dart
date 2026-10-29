import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/net/api_error.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../nav/router.dart';
import '../data/auth_flow.dart';
import '../data/auth_service.dart';
import '../data/google_gateway.dart';
import 'auth_widgets.dart';

/// Runs Google sign-in end to end. Returns an i18n error key to show inline, or null.
/// New account: "Before we continue" sheet (18+/Terms/Privacy) -> profile setup (name/photo prefilled).
/// Existing account: home (or child home).
Future<String?> runGoogleSignIn(BuildContext context, WidgetRef ref) async {
  final auth = ref.read(authServiceProvider);
  try {
    var outcome = await auth.google();
    if (outcome is GoogleCancelled) return null;
    if (outcome is GoogleNeedsAgeTerms) {
      if (!context.mounted) return null;
      final ok = await showGoogleTermsSheet(context, ref.read(screenStringsProvider('google_terms')));
      if (ok != true) return null;
      outcome = await auth.google(identity: outcome.identity, adultAndTermsConfirmed: true);
    }
    if (outcome is GoogleSignedIn && context.mounted) {
      final s = outcome.session;
      context.go(locationFor(destinationAfterAuth(s.user, needsProfileSetup: s.needsProfileSetup)));
    }
    return null;
  } on GoogleUnavailable {
    return 'auth.err_google';
  } on ApiError catch (e) {
    if (e.code == 'AUTH_EMAIL_NOT_VERIFIED') return 'auth.err_google_unverified';
    if (e.kind == ApiErrorKind.network) return 'err.network';
    if (e.code == 'AUTH_INVALID_CREDENTIALS' || e.status == 401) return 'auth.err_google';
    return e.messageKey;
  } catch (_) {
    return 'auth.err_google';
  }
}

/// Bottom sheet "Before we continue" (overlay google_terms). Returns true when confirmed.
Future<bool?> showGoogleTermsSheet(BuildContext context, Strings s) => showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => GoogleTermsSheet(strings: s),
    );

class GoogleTermsSheet extends StatefulWidget {
  const GoogleTermsSheet({super.key, required this.strings});
  final Strings strings;

  @override
  State<GoogleTermsSheet> createState() => _GoogleTermsSheetState();
}

class _GoogleTermsSheetState extends State<GoogleTermsSheet> {
  bool _checked = false;
  bool _error = false;

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          Space.screenHorizontal,
          Space.xs,
          Space.screenHorizontal,
          Space.md + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AuthHeading(title: s.t('google.sheet_title'), subtitle: s.t('google.sheet_body')),
            AgeTermsCheckbox(
              value: _checked,
              error: _error,
              strings: s,
              onChanged: (v) => setState(() {
                _checked = v;
                if (v) _error = false;
              }),
            ),
            if (_error) ...[const SizedBox(height: Space.xs), InlineMessage(s.t('auth.err_age_terms'))],
            const SizedBox(height: Space.lg),
            AppButton(
              label: s.t('common.continue'),
              onPressed: () {
                if (!_checked) {
                  setState(() => _error = true);
                  return;
                }
                Navigator.of(context).pop(true);
              },
            ),
            const SizedBox(height: Space.xs),
            AppButton(label: s.t('common.cancel'), kind: ButtonKind.text, onPressed: () => Navigator.of(context).pop(false)),
          ],
        ),
      ),
    );
  }
}
