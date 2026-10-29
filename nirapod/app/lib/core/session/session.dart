import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../net/providers.dart';
import '../prefs/prefs.dart';

/// Real role, decided by the SERVER from the account and family membership.
enum AppRole { parent, guardian, child }

/// What the user picked on "Who are you?". Only selects the UI; never trusted as the real role.
enum RoleChoice { parent, probashi, member, child }

RoleChoice? roleChoiceFromName(String? s) => RoleChoice.values.where((r) => r.name == s).firstOrNull;

/// Account as returned by GET /me (docs/CONTRACTS/openapi.yaml, schema Me).
class AuthUser {
  const AuthUser({
    required this.id,
    this.email,
    this.emailVerified = false,
    this.authProvider = 'email',
    this.name,
    this.avatarUrl,
    this.avatarThumbUrl,
    this.countryIso2,
    this.timezone,
    this.tzAuto = true,
    this.detectedSource,
    this.language = 'en',
    this.role,
    this.isOverseas = false,
    this.familyId,
  });

  final String id;
  final String? email;
  final bool emailVerified;
  final String authProvider; // email | google | device
  final String? name;
  final String? avatarUrl;
  final String? avatarThumbUrl;
  final String? countryIso2;
  final String? timezone;
  final bool tzAuto;
  final String? detectedSource;
  final String language;
  final AppRole? role;
  final bool isOverseas;
  final String? familyId;

  bool get isChild => role == AppRole.child || authProvider == 'device';

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: j['id'] as String,
        email: j['email'] as String?,
        emailVerified: j['email_verified'] as bool? ?? false,
        authProvider: j['auth_provider'] as String? ?? 'email',
        name: j['name'] as String?,
        avatarUrl: j['avatar_url'] as String?,
        avatarThumbUrl: j['avatar_thumb_url'] as String?,
        countryIso2: j['country_iso2'] as String?,
        timezone: j['timezone'] as String?,
        tzAuto: j['tz_auto'] as bool? ?? true,
        detectedSource: j['detected_source'] as String?,
        language: j['language'] as String? ?? 'en',
        role: AppRole.values.where((r) => r.name == j['role']).firstOrNull,
        isOverseas: j['is_overseas'] as bool? ?? false,
        familyId: j['family_id'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id, 'email': email, 'email_verified': emailVerified, 'auth_provider': authProvider, 'name': name,
        'avatar_url': avatarUrl, 'avatar_thumb_url': avatarThumbUrl, 'country_iso2': countryIso2,
        'timezone': timezone, 'tz_auto': tzAuto, 'detected_source': detectedSource, 'language': language,
        'role': role?.name, 'is_overseas': isOverseas, 'family_id': familyId,
      };
}

sealed class SessionState {
  const SessionState();
}

/// Not yet restored from secure storage (only during splash).
class SessionUnknown extends SessionState {
  const SessionUnknown();
}

class SignedOut extends SessionState {
  const SignedOut();
}

class SignedIn extends SessionState {
  const SignedIn(this.user, {this.needsProfileSetup = false});
  final AuthUser user;
  final bool needsProfileSetup;
}

/// Contract between features. The auth feature (lib/features/auth) provides the implementation by
/// overriding [sessionControllerProvider]'s notifier behaviour in [SessionController.restore] etc.
/// Splash calls [restore]; login/register/verify/google/child flows call [signedIn]; logout calls [signOut].
class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() => const SessionUnknown();

  /// Reads tokens from the Keystore and, if valid, loads /me. Must never throw; on any failure -> SignedOut.
  /// Default (Phase 0) behaviour: SignedOut. Replaced by the auth feature via [restoreImpl].
  Future<SessionState> restore() async {
    final impl = restoreImpl;
    state = impl == null ? const SignedOut() : await impl(ref);
    return state;
  }

  void signedIn(AuthUser user, {bool needsProfileSetup = false}) =>
      state = SignedIn(user, needsProfileSetup: needsProfileSetup);

  void updateUser(AuthUser user) {
    final s = state;
    state = SignedIn(user, needsProfileSetup: s is SignedIn && s.needsProfileSetup);
  }

  void profileCompleted() {
    final s = state;
    if (s is SignedIn) state = SignedIn(s.user);
  }

  /// Logout: the auth feature sets [signOutImpl] (revoke refresh + FCM token, clear cache).
  Future<void> signOut() async {
    await signOutImpl?.call(ref);
    state = const SignedOut();
  }

  /// Reloads GET /me (e.g. after creating or joining a family) and updates the session. Returns null on error.
  Future<AuthUser?> refreshMe() async {
    try {
      final j = await ref.read(apiClientProvider).get<Map<String, dynamic>>('/me');
      final u = AuthUser.fromJson(j);
      updateUser(u);
      return u;
    } catch (_) {
      return null;
    }
  }

  /// Tokens were rejected by the server (refresh failed): no server call, just end the session.
  void signedOutLocally() => state = const SignedOut();

  static Future<SessionState> Function(Ref ref)? restoreImpl;
  static Future<void> Function(Ref ref)? signOutImpl;
}

final sessionControllerProvider = NotifierProvider<SessionController, SessionState>(SessionController.new);

/// The role picked on "Who are you?" (UI only; the real role comes from the server).
final roleChoiceProvider = Provider<RoleChoice?>((ref) => roleChoiceFromName(ref.read(prefsProvider).getString(PrefKeys.roleChoice)));
