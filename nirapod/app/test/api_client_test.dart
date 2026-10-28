import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/net/api_client.dart';
import 'package:nirapod/core/net/api_error.dart';
import 'package:nirapod/core/net/token_store.dart';

typedef Handler = FutureOr<(int, Object?)> Function(RequestOptions o);

class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);
  final Handler handler;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    calls.add('${o.method} ${o.path} ${o.headers['authorization'] ?? ''}');
    final (status, data) = await handler(o);
    if (status == 0) throw DioException.connectionError(requestOptions: o, reason: 'offline');
    return ResponseBody.fromString(jsonEncode(data), status, headers: {
      Headers.contentTypeHeader: ['application/json'],
    });
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> err(String code) => {'error': {'code': code, 'message': 'x', 'requestId': 'r'}};

void main() {
  test('adds the bearer token and app version', () async {
    final a = FakeAdapter((o) => (200, {'ok': true, 'v': o.headers['x-app-version']}));
    final c = ApiClient(tokens: MemoryTokenStore(const Tokens(access: 'A1', refresh: 'R1')), adapter: a, baseUrl: 'https://x/api/v1', appVersion: '9.9.9');
    final res = await c.get<Map<String, dynamic>>('/me');
    expect(res['v'], '9.9.9');
    expect(a.calls.single, 'GET /me Bearer A1');
  });

  test('expired access token: refresh once, store rotated pair, retry', () async {
    final store = MemoryTokenStore(const Tokens(access: 'A1', refresh: 'R1'));
    final a = FakeAdapter((o) {
      if (o.path == ApiClient.refreshPath) {
        expect((o.data as Map)['refresh_token'], 'R1');
        return (200, {'access_token': 'A2', 'refresh_token': 'R2', 'expires_in': 900});
      }
      return o.headers['authorization'] == 'Bearer A2' ? (200, {'ok': true}) : (401, err('AUTH_TOKEN_EXPIRED'));
    });
    final c = ApiClient(tokens: store, adapter: a, baseUrl: 'https://x/api/v1');
    expect(await c.get<Map<String, dynamic>>('/me'), {'ok': true});
    final t = await store.read();
    expect([t!.access, t.refresh], ['A2', 'R2']);
    expect(a.calls.where((x) => x.contains('/auth/refresh')).length, 1);
  });

  test('concurrent 401s share ONE refresh', () async {
    final store = MemoryTokenStore(const Tokens(access: 'A1', refresh: 'R1'));
    var refreshes = 0;
    final a = FakeAdapter((o) async {
      if (o.path == ApiClient.refreshPath) {
        refreshes++;
        await Future<void>.delayed(const Duration(milliseconds: 30));
        return (200, {'access_token': 'A2', 'refresh_token': 'R2'});
      }
      return o.headers['authorization'] == 'Bearer A2' ? (200, {'p': o.path}) : (401, err('AUTH_TOKEN_EXPIRED'));
    });
    final c = ApiClient(tokens: store, adapter: a, baseUrl: 'https://x/api/v1');
    final results = await Future.wait([for (var i = 0; i < 5; i++) c.get<Map<String, dynamic>>('/r$i')]);
    expect(results.map((r) => r['p']), ['/r0', '/r1', '/r2', '/r3', '/r4']);
    expect(refreshes, 1);
  });

  test('failed refresh clears tokens and reports session expired', () async {
    final store = MemoryTokenStore(const Tokens(access: 'A1', refresh: 'R1'));
    var expired = 0;
    final a = FakeAdapter((o) => o.path == ApiClient.refreshPath ? (401, err('AUTH_REFRESH_INVALID')) : (401, err('AUTH_TOKEN_EXPIRED')));
    final c = ApiClient(tokens: store, adapter: a, baseUrl: 'https://x/api/v1', onSessionExpired: () => expired++);
    await expectLater(c.get<dynamic>('/me'), throwsA(isA<ApiError>().having((e) => e.kind, 'kind', ApiErrorKind.sessionExpired)));
    expect(await store.read(), isNull);
    expect(expired, 1);
  });

  test('other 401s (e.g. wrong password) are not retried', () async {
    final a = FakeAdapter((o) => (401, err('AUTH_INVALID_CREDENTIALS')));
    final c = ApiClient(tokens: MemoryTokenStore(), adapter: a, baseUrl: 'https://x/api/v1');
    await expectLater(c.post<dynamic>('/auth/login', data: {}), throwsA(isA<ApiError>().having((e) => e.code, 'code', 'AUTH_INVALID_CREDENTIALS')));
    expect(a.calls.length, 1);
  });

  test('error mapping to plain-language keys', () async {
    Future<ApiError> run((int, Object?) r) async {
      final c = ApiClient(tokens: MemoryTokenStore(), adapter: FakeAdapter((_) => r), baseUrl: 'https://x/api/v1');
      try {
        await c.get<dynamic>('/x');
      } on ApiError catch (e) {
        return e;
      }
      throw StateError('no error');
    }

    expect((await run((0, null))).messageKey, 'err.network');
    expect((await run((429, err('RATE_LIMITED')))).messageKey, 'err.rate_limited');
    expect((await run((500, err('INTERNAL')))).messageKey, 'err.server');
    expect((await run((400, err('VALIDATION_FAILED')))).kind, ApiErrorKind.validation);
    expect((await run((402, err('PLAN_LIMIT_REACHED')))).kind, ApiErrorKind.planLimit);
    expect((await run((426, err('UPGRADE_REQUIRED')))).kind, ApiErrorKind.upgradeRequired);
  });
}
