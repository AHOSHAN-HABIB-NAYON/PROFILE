import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/net/api_client.dart';
import '../../../core/net/api_error.dart';
import '../../../core/net/providers.dart';
import '../../../core/session/session.dart';

/// Server reply for every sign-in (OpenAPI schema Session).
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    this.needsProfileSetup = false,
    this.isNewAccount = false,
  });

  final String accessToken;
  final String refreshToken;
  final AuthUser user;
  final bool needsProfileSetup;
  final bool isNewAccount;

  factory AuthSession.fromJson(Map<String, dynamic> j) {
    final user = AuthUser.fromJson((j['user'] as Map).cast<String, dynamic>());
    return AuthSession(
      accessToken: j['access_token'] as String,
      refreshToken: j['refresh_token'] as String,
      user: user,
      needsProfileSetup: j['needs_profile_setup'] as bool? ?? (user.name == null && !user.isChild),
      isNewAccount: j['is_new_account'] as bool? ?? false,
    );
  }
}

class SessionInfo {
  const SessionInfo({required this.id, this.deviceModel, this.appVersion, this.lastUsedAt, this.current = false});
  final String id;
  final String? deviceModel;
  final String? appVersion;
  final DateTime? lastUsedAt;
  final bool current;

  factory SessionInfo.fromJson(Map<String, dynamic> j) => SessionInfo(
        id: j['id'] as String,
        deviceModel: j['device_model'] as String?,
        appVersion: j['app_version'] as String?,
        lastUsedAt: DateTime.tryParse(j['last_used_at'] as String? ?? ''),
        current: j['current'] as bool? ?? false,
      );
}

class ChildCode {
  const ChildCode({required this.code, required this.expiresAt, required this.joinUrl});
  final String code;
  final DateTime expiresAt;
  final String joinUrl;

  factory ChildCode.fromJson(Map<String, dynamic> j) {
    final code = j['code'] as String;
    return ChildCode(
      code: code,
      expiresAt: DateTime.tryParse(j['expires_at'] as String? ?? '') ?? DateTime.now().add(const Duration(hours: 24)),
      joinUrl: j['join_url'] as String? ?? 'https://nirapod.app/join?code=$code',
    );
  }

  Map<String, dynamic> toJson() => {'code': code, 'expires_at': expiresAt.toUtc().toIso8601String(), 'join_url': joinUrl};
}

/// Phase 1 endpoints of docs/CONTRACTS/openapi.yaml. JSON is snake_case. Every method throws [ApiError].
class AuthApi {
  AuthApi(this._c);
  final ApiClient _c;

  Map<String, dynamic> _map(Object? data) => data is Map ? data.cast<String, dynamic>() : <String, dynamic>{};

  Future<AuthSession> login({required String email, required String password, required Map<String, dynamic> device}) async =>
      AuthSession.fromJson(_map(await _c.post<dynamic>('/auth/login', data: {'email': email, 'password': password, 'device': device})));

  Future<void> register({required String email, required String password, required String language}) =>
      _c.post<dynamic>('/auth/register', data: {
        'email': email,
        'password': password,
        'adult_and_terms_confirmed': true,
        'language': language,
      });

  Future<AuthSession> verifyEmail({required String email, required String code, required Map<String, dynamic> device}) async =>
      AuthSession.fromJson(_map(await _c.post<dynamic>('/auth/verify-email', data: {'email': email, 'code': code, 'device': device})));

  /// purpose: verify_email | reset_password
  Future<void> resendCode({required String email, required String purpose}) =>
      _c.post<dynamic>('/auth/resend-code', data: {'email': email, 'purpose': purpose});

  Future<AuthSession> google({
    required String idToken,
    required String language,
    required Map<String, dynamic> device,
    bool adultAndTermsConfirmed = false,
  }) async =>
      AuthSession.fromJson(_map(await _c.post<dynamic>('/auth/google', data: {
        'id_token': idToken,
        'language': language,
        'device': device,
        if (adultAndTermsConfirmed) 'adult_and_terms_confirmed': true,
      })));

  Future<AuthSession> child({
    required String code,
    required String firstName,
    required Map<String, dynamic> device,
    String? timezone,
    String? countryIso2,
  }) async =>
      AuthSession.fromJson(_map(await _c.post<dynamic>('/auth/child', data: {
        'code': code,
        'first_name': firstName,
        'device': device,
        'timezone': ?timezone,
        'country_iso2': ?countryIso2,
      })));

  Future<void> forgot(String email) => _c.post<dynamic>('/auth/forgot', data: {'email': email});

  Future<void> reset({required String email, required String code, required String newPassword}) =>
      _c.post<dynamic>('/auth/reset', data: {'email': email, 'code': code, 'new_password': newPassword});

  Future<void> logout() => _c.post<dynamic>('/auth/logout');

  Future<List<SessionInfo>> sessions() async {
    final data = await _c.get<dynamic>('/auth/sessions');
    final list = data is List ? data : (data is Map ? (data['sessions'] as List?) ?? const [] : const []);
    return [for (final s in list) SessionInfo.fromJson((s as Map).cast<String, dynamic>())];
  }

  Future<void> revokeSession(String id) => _c.delete<dynamic>('/auth/sessions/$id');

  Future<AuthUser> me() async => AuthUser.fromJson(_map(await _c.get<dynamic>('/me')));

  /// Fields: name, country_iso2, timezone, tz_auto, detected_source, language.
  Future<AuthUser> patchProfile(Map<String, dynamic> fields) async =>
      AuthUser.fromJson(_map(await _c.patch<dynamic>('/me/profile', data: fields)));

  /// Multipart field `photo` (image/jpeg). Returns {avatar_url, avatar_thumb_url}.
  Future<Map<String, dynamic>> uploadPhoto(Uint8List jpeg, {void Function(double fraction)? onProgress}) async {
    try {
      final form = FormData.fromMap({
        'photo': MultipartFile.fromBytes(jpeg, filename: 'avatar.jpg', contentType: DioMediaType('image', 'jpeg')),
      });
      final res = await _c.dio.post<dynamic>('/me/photo', data: form, onSendProgress: (sent, total) {
        if (total > 0) onProgress?.call(sent / total);
      });
      return _map(res.data);
    } catch (e) {
      throw ApiError.from(e);
    }
  }

  Future<void> deletePhoto() => _c.delete<dynamic>('/me/photo');

  /// Returns the new family id.
  Future<String> createFamily({String? name}) async {
    final j = _map(await _c.post<dynamic>('/families', data: {'name': ?name}));
    return j['id'] as String;
  }

  /// Creates a family, or returns the existing one (POST /families answers 409 when already in one).
  Future<String> ensureFamily() async {
    try {
      return await createFamily();
    } on ApiError catch (e) {
      if (e.code != 'CONFLICT' && e.status != 409) rethrow;
      final id = (await me()).familyId;
      if (id == null) rethrow;
      return id;
    }
  }

  Future<ChildCode> childCode(String familyId) async =>
      ChildCode.fromJson(_map(await _c.post<dynamic>('/families/$familyId/child-code')));

  Future<void> acceptInvite(String code) => _c.post<dynamic>('/invites/accept', data: {'code': code});

  Future<String?> geoHint() async {
    final j = _map(await _c.get<dynamic>('/geo/hint'));
    return j['country_iso2'] as String?;
  }

}

final authApiProvider = Provider<AuthApi>((ref) => AuthApi(ref.watch(apiClientProvider)));
