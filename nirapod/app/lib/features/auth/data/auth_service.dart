import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../family/data/sharing.dart' show adultBackgroundProvider;

import '../../../core/i18n/locale_controller.dart';
import '../../../core/log/log.dart';
import '../../../core/net/api_error.dart';
import '../../../core/net/providers.dart';
import '../../../core/net/token_store.dart';
import '../../../core/prefs/prefs.dart';
import '../../../core/session/session.dart';
import '../profile/profile_repo.dart';
import '../profile/travel_prompt.dart';
import '../profile/travel_service.dart';
import 'auth_api.dart';
import 'auth_flow.dart';
import 'device_identity.dart';
import 'google_gateway.dart';

/// Result of a Google attempt.
sealed class GoogleOutcome {
  const GoogleOutcome();
}

class GoogleCancelled extends GoogleOutcome {
  const GoogleCancelled();
}

class GoogleNeedsAgeTerms extends GoogleOutcome {
  const GoogleNeedsAgeTerms(this.identity);
  final GoogleIdentityResult identity;
}

class GoogleSignedIn extends GoogleOutcome {
  const GoogleSignedIn(this.session);
  final AuthSession session;
}

/// Everything that turns a server reply into an app session, plus restore and sign-out.
class AuthService {
  AuthService(this._ref);
  final Ref _ref;

  static const childEphemeralKey = 'auth_child_ephemeral';

  AuthApi get _api => _ref.read(authApiProvider);
  TokenStore get _tokens => _ref.read(tokenStoreProvider);
  String get _language => _ref.read(languageProvider).code;
  Future<Map<String, dynamic>> _device() => _ref.read(deviceIdentityProvider).deviceInfo();

  /// Stores the token pair, caches the user and signs the app in.
  Future<AuthSession> completeSession(AuthSession s) async {
    await _tokens.write(Tokens(access: s.accessToken, refresh: s.refreshToken));
    await _ref.read(profileRepoProvider).cacheUser(s.user);
    _ref.read(sessionControllerProvider.notifier).signedIn(s.user, needsProfileSetup: s.needsProfileSetup);
    _startBackground();
    return s;
  }

  void _startBackground() {
    unawaited(_ref.read(profileRepoProvider).sync());
    final w = _ref.read(travelWatcherProvider);
    w.prompter ??= (country) => showTravelPrompt(_ref, country);
    w.start();
  }

  Future<AuthSession> login(String email, String password) async =>
      completeSession(await _api.login(email: email, password: password, device: await _device()));

  Future<AuthSession> verifyEmail(String email, String code) async =>
      completeSession(await _api.verifyEmail(email: email, code: code, device: await _device()));

  /// Google sign-in. A NEW account first needs the 18+/Terms/Privacy sheet ([GoogleNeedsAgeTerms]).
  Future<GoogleOutcome> google({GoogleIdentityResult? identity, bool adultAndTermsConfirmed = false}) async {
    final id = identity ?? await _ref.read(googleGatewayProvider).signIn();
    if (id == null) return const GoogleCancelled();
    try {
      final s = await _api.google(
        idToken: id.idToken,
        language: _language,
        device: await _device(),
        adultAndTermsConfirmed: adultAndTermsConfirmed,
      );
      if (s.isNewAccount || s.needsProfileSetup) {
        _ref.read(authFlowProvider.notifier).setGooglePrefill(
              name: s.user.name ?? id.displayName,
              photoUrl: s.user.avatarUrl ?? id.photoUrl,
            );
      }
      final session = s.isNewAccount && !s.user.isChild
          ? AuthSession(accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user, needsProfileSetup: true, isNewAccount: true)
          : s;
      return GoogleSignedIn(await completeSession(session));
    } on ApiError catch (e) {
      if (!adultAndTermsConfirmed && e.code == 'CONSENT_REQUIRED') return GoogleNeedsAgeTerms(id);
      rethrow;
    }
  }

  Future<AuthSession> joinAsChild({
    required String code,
    required String firstName,
    required bool remember,
    String? timezone,
    String? countryIso2,
  }) async {
    final s = await _api.child(code: code, firstName: firstName, device: await _device(), timezone: timezone, countryIso2: countryIso2);
    final prefs = _ref.read(prefsProvider);
    if (remember) {
      await prefs.remove(childEphemeralKey);
    } else {
      await prefs.setBool(childEphemeralKey, true);
    }
    return completeSession(s);
  }

  /// SessionController.restoreImpl. Never throws.
  Future<SessionState> restore() async {
    try {
      final prefs = _ref.read(prefsProvider);
      final t = await _tokens.read();
      if (t == null) return const SignedOut();
      if (prefs.getBool(childEphemeralKey) ?? false) {
        // Child chose not to be remembered on this phone: the previous session ends at restart.
        await prefs.remove(childEphemeralKey);
        await _clearLocal(keepDevice: true);
        return const SignedOut();
      }
      try {
        final user = await _api.me();
        await _ref.read(profileRepoProvider).cacheUser(user);
        _startBackgroundLater();
        return SignedIn(user, needsProfileSetup: user.name == null && !user.isChild);
      } on ApiError catch (e) {
        if (e.kind == ApiErrorKind.network) {
          // Offline start: keep tokens; show the cached account (screens show the offline banner).
          final cached = _ref.read(profileRepoProvider).cachedUser();
          if (cached != null) {
            _startBackgroundLater();
            return SignedIn(cached, needsProfileSetup: cached.name == null && !cached.isChild);
          }
          return const SignedOut();
        }
        await _clearLocal(keepDevice: true);
        return const SignedOut();
      }
    } catch (e) {
      Log.warn('auth', 'restore failed: ${e.runtimeType}');
      return const SignedOut();
    }
  }

  void _startBackgroundLater() => scheduleMicrotask(() {
        try {
          _startBackground();
        } catch (_) {}
      });

  /// SessionController.signOutImpl: revoke on the server (refresh + FCM token), then clear this phone.
  Future<void> signOut() async {
    try {
      await _api.logout().timeout(const Duration(seconds: 8));
    } catch (_) {
      // Offline or already revoked: the local session still ends.
    }
    unawaited(_ref.read(googleGatewayProvider).signOut());
    // Adult "share when the app is closed" ends with the session.
    await _ref.read(adultBackgroundProvider).disable().catchError((Object _) {});
    await _clearLocal(keepDevice: true);
  }

  Future<void> _clearLocal({required bool keepDevice}) async {
    _ref.read(travelWatcherProvider).stop();
    await _tokens.clear();
    await _ref.read(profileRepoProvider).clearLocal();
    final prefs = _ref.read(prefsProvider);
    for (final k in [TravelWatcher.lastDeviceZoneKey, childCodeCacheKey]) {
      await prefs.remove(k);
    }
    _ref.read(authFlowProvider.notifier).clear();
  }
}

/// Cached last child code (so re-opening the screen does not revoke a code the parent already shared).
const childCodeCacheKey = 'auth_child_code_cache';

final authServiceProvider = Provider<AuthService>(AuthService.new);
