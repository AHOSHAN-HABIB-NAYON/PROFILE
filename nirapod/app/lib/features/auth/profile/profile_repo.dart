import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/log/log.dart';
import '../../../core/net/api_error.dart';
import '../../../core/prefs/prefs.dart';
import '../../../core/session/session.dart';
import '../data/auth_api.dart';

enum SaveOutcome { saved, savedOffline }

/// Saves profile fields (PATCH /me/profile). Offline: keeps the change on this phone, applies it to the
/// local user right away and syncs on the next [sync] (sign-in, app resume, next save).
class ProfileRepo {
  ProfileRepo(this._ref);
  final Ref _ref;

  static const pendingKey = 'auth_profile_pending';
  static const cachedMeKey = 'auth_cached_me';

  AuthApi get _api => _ref.read(authApiProvider);

  Map<String, dynamic> get pending {
    final raw = _ref.read(prefsProvider).getString(pendingKey);
    if (raw == null) return {};
    try {
      return (jsonDecode(raw) as Map).cast<String, dynamic>();
    } catch (_) {
      return {};
    }
  }

  Future<void> _setPending(Map<String, dynamic> p) async {
    final prefs = _ref.read(prefsProvider);
    if (p.isEmpty) {
      await prefs.remove(pendingKey);
    } else {
      await prefs.setString(pendingKey, jsonEncode(p));
    }
  }

  Future<SaveOutcome> save(Map<String, dynamic> fields) async {
    final merged = {...pending, ...fields};
    try {
      final user = await _api.patchProfile(merged);
      await _setPending({});
      await applyUser(user);
      return SaveOutcome.saved;
    } on ApiError catch (e) {
      if (e.kind != ApiErrorKind.network) rethrow;
      await _setPending(merged);
      _applyLocally(merged);
      return SaveOutcome.savedOffline;
    }
  }

  /// Sends any change saved while offline. Never throws.
  Future<void> sync() async {
    final p = pending;
    if (p.isEmpty) return;
    try {
      final user = await _api.patchProfile(p);
      await _setPending({});
      await applyUser(user);
    } on ApiError catch (e) {
      // Network: keep for later. Anything else (e.g. validation): drop so it never loops.
      if (e.kind != ApiErrorKind.network) {
        Log.warn('profile', 'dropping pending profile change: ${e.code}');
        await _setPending({});
      }
    } catch (_) {}
  }

  Future<void> applyUser(AuthUser user) async {
    await cacheUser(user);
    final s = _ref.read(sessionControllerProvider);
    if (s is SignedIn) _ref.read(sessionControllerProvider.notifier).updateUser(user);
  }

  Future<void> cacheUser(AuthUser user) => _ref.read(prefsProvider).setString(cachedMeKey, jsonEncode(user.toJson()));

  AuthUser? cachedUser() {
    final raw = _ref.read(prefsProvider).getString(cachedMeKey);
    if (raw == null) return null;
    try {
      return AuthUser.fromJson((jsonDecode(raw) as Map).cast<String, dynamic>());
    } catch (_) {
      return null;
    }
  }

  void _applyLocally(Map<String, dynamic> fields) {
    final s = _ref.read(sessionControllerProvider);
    if (s is! SignedIn) return;
    final user = AuthUser.fromJson({...s.user.toJson(), ...fields});
    _ref.read(sessionControllerProvider.notifier).updateUser(user);
    cacheUser(user);
  }

  Future<void> clearLocal() async {
    final prefs = _ref.read(prefsProvider);
    await prefs.remove(pendingKey);
    await prefs.remove(cachedMeKey);
  }
}

final profileRepoProvider = Provider<ProfileRepo>(ProfileRepo.new);
