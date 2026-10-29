import '../../../core/net/api_error.dart';

/// What a login attempt failure means for the screen.
enum LoginFailure { message, verifyEmail }

/// Plain-language i18n key for a login error (never raw server text).
String loginErrorKey(ApiError e) => switch (e.code) {
      'AUTH_INVALID_CREDENTIALS' => 'auth.err_invalid',
      'AUTH_LOCKED' => 'auth.err_locked',
      'AUTH_EMAIL_NOT_VERIFIED' => 'auth.err_not_verified',
      _ when e.status == 423 => 'auth.err_locked',
      _ => e.messageKey,
    };

LoginFailure loginFailureKind(ApiError e) =>
    e.code == 'AUTH_EMAIL_NOT_VERIFIED' ? LoginFailure.verifyEmail : LoginFailure.message;

String registerErrorKey(ApiError e) => switch (e.code) {
      'CONFLICT' => 'auth.err_email_taken',
      _ when e.status == 409 => 'auth.err_email_taken',
      'VALIDATION_FAILED' => _validationField(e) == 'email' ? 'auth.err_email' : 'auth.err_password',
      _ => e.messageKey,
    };

String? _validationField(ApiError e) {
  final d = e.details;
  if (d == null) return null;
  final f = d['field'] ?? d['fields'];
  if (f is String) return f;
  if (f is List && f.isNotEmpty) return '${f.first}';
  if (f is Map && f.isNotEmpty) return '${f.keys.first}';
  return null;
}

/// Tries left after a wrong code, read from error details (`attempts_left` or `tries_left`).
int? triesLeft(ApiError e) {
  final d = e.details;
  final v = d?['attempts_left'] ?? d?['tries_left'] ?? d?['remaining_attempts'];
  return v is int ? v : (v is String ? int.tryParse(v) : null);
}

/// Message for a 6-digit email code failure: (key, args).
(String, Map<String, Object>) codeErrorKey(ApiError e) {
  if (e.code == 'AUTH_LOCKED' || e.status == 423) return ('verify.err_locked', const {});
  if (e.code == 'CODE_EXPIRED' || e.status == 410) return ('verify.err_expired', const {});
  if (e.code == 'CODE_INVALID' || e.code == 'VALIDATION_FAILED') {
    final left = triesLeft(e);
    if (left != null && left <= 0) return ('verify.err_locked', const {});
    return ('verify.err_wrong', {'left': left ?? 4});
  }
  return (e.messageKey, const {});
}

String childCodeErrorKey(ApiError e) => switch (e.code) {
      'CODE_INVALID' || 'NOT_FOUND' || 'VALIDATION_FAILED' => 'child.err_code',
      'CODE_EXPIRED' => 'child.err_expired',
      _ when e.status == 410 => 'child.err_expired',
      _ => e.messageKey,
    };

/// The Google endpoint asks for the 18+/Terms/Privacy confirmation for a NEW account.
bool needsAgeTerms(ApiError e) =>
    e.code == 'CONSENT_REQUIRED' && (e.details?['needs'] == null || e.details?['needs'] == 'age_terms');
