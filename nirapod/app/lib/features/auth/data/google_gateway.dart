import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../core/log/log.dart';

class GoogleIdentityResult {
  const GoogleIdentityResult({required this.idToken, this.displayName, this.photoUrl});
  final String idToken;
  final String? displayName;
  final String? photoUrl;
}

/// Google sign-in is unavailable on this device/build (no Play services, missing client id).
class GoogleUnavailable implements Exception {}

/// Wraps google_sign_in (Credential Manager on Android) so screens and tests do not depend on the plugin.
abstract class GoogleGateway {
  /// Returns null when the user cancels. Throws [GoogleUnavailable] when it cannot run.
  Future<GoogleIdentityResult?> signIn();
  Future<void> signOut();
}

class PluginGoogleGateway implements GoogleGateway {
  static const serverClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
  Future<void>? _init;

  Future<void> _ensureInit() => _init ??= GoogleSignIn.instance.initialize(
        serverClientId: serverClientId.isEmpty ? null : serverClientId,
      );

  @override
  Future<GoogleIdentityResult?> signIn() async {
    try {
      await _ensureInit();
      if (!GoogleSignIn.instance.supportsAuthenticate()) throw GoogleUnavailable();
      final account = await GoogleSignIn.instance.authenticate();
      final token = account.authentication.idToken;
      if (token == null) throw GoogleUnavailable();
      return GoogleIdentityResult(idToken: token, displayName: account.displayName, photoUrl: account.photoUrl);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled || e.code == GoogleSignInExceptionCode.interrupted) return null;
      Log.warn('google', 'sign-in failed: ${e.code.name}');
      throw GoogleUnavailable();
    } on GoogleUnavailable {
      rethrow;
    } catch (e) {
      Log.warn('google', 'sign-in unavailable: ${e.runtimeType}');
      _init = null;
      throw GoogleUnavailable();
    }
  }

  @override
  Future<void> signOut() async {
    try {
      await _ensureInit();
      await GoogleSignIn.instance.signOut();
    } catch (_) {}
  }
}

final googleGatewayProvider = Provider<GoogleGateway>((ref) => PluginGoogleGateway());
