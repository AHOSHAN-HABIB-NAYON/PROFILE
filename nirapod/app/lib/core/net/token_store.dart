import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class Tokens {
  const Tokens({required this.access, required this.refresh});
  final String access;
  final String refresh;
}

/// Where tokens live. The real implementation uses the Android Keystore (EncryptedSharedPreferences
/// backed by Keystore keys); tests use [MemoryTokenStore].
abstract class TokenStore {
  Future<Tokens?> read();
  Future<void> write(Tokens tokens);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  static const _a = 'nirapod.access';
  static const _r = 'nirapod.refresh';

  @override
  Future<Tokens?> read() async {
    final a = await _s.read(key: _a);
    final r = await _s.read(key: _r);
    return (a == null || r == null) ? null : Tokens(access: a, refresh: r);
  }

  @override
  Future<void> write(Tokens t) async {
    await _s.write(key: _a, value: t.access);
    await _s.write(key: _r, value: t.refresh);
  }

  @override
  Future<void> clear() async {
    await _s.delete(key: _a);
    await _s.delete(key: _r);
  }
}

class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this._t]);
  Tokens? _t;
  @override
  Future<Tokens?> read() async => _t;
  @override
  Future<void> write(Tokens tokens) async => _t = tokens;
  @override
  Future<void> clear() async => _t = null;
}
