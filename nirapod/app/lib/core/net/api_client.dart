import 'dart:async';

import 'package:dio/dio.dart';

import '../config/env.dart';
import 'api_error.dart';
import 'device_id.dart';
import 'token_store.dart';

/// HTTP client for /api/v1 with short-lived access tokens and rotating refresh tokens.
///
/// - Adds `Authorization: Bearer <access>` to every request.
/// - On 401 AUTH_TOKEN_EXPIRED it refreshes ONCE (concurrent requests share one refresh), stores the
///   rotated pair and retries the original request.
/// - Only when the server REJECTS the refresh token (401/403) are the tokens cleared and
///   [onSessionExpired] run. Offline, timeouts and 5xx keep the tokens (a child phone that loses signal
///   must stay signed in) and surface as a network/server error.
/// - Sends `x-device-id` on every request (child sessions are bound to it).
class ApiClient {
  ApiClient({
    required this.tokens,
    String baseUrl = Env.apiBaseUrl,
    HttpClientAdapter? adapter,
    this.onSessionExpired,
    this.appVersion = Env.appVersion,
    this.deviceIds,
  }) : dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 20),
          headers: {'accept': 'application/json'},
        )) {
    if (adapter != null) dio.httpClientAdapter = adapter;
    dio.interceptors.add(_AuthInterceptor(this));
  }

  final Dio dio;
  final TokenStore tokens;
  final void Function()? onSessionExpired;
  final String appVersion;
  final DeviceIdStore? deviceIds;
  Completer<_RefreshResult>? _refreshing;

  static const refreshPath = '/auth/refresh';

  Future<_RefreshResult> _refresh() {
    final pending = _refreshing;
    if (pending != null) return pending.future;
    final c = Completer<_RefreshResult>();
    _refreshing = c;
    () async {
      try {
        final current = await tokens.read();
        if (current == null) {
          c.complete(const _RefreshResult.rejected());
          return;
        }
        // Separate Dio without the auth interceptor, so refresh can never loop.
        final plain = Dio(dio.options.copyWith())..httpClientAdapter = dio.httpClientAdapter;
        final deviceId = await deviceIds?.get();
        final res = await plain.post<Map<String, dynamic>>(
          refreshPath,
          data: {'refresh_token': current.refresh},
          options: Options(headers: {'x-device-id': ?deviceId}),
        );
        final data = res.data!;
        final next = Tokens(access: data['access_token'] as String, refresh: data['refresh_token'] as String);
        await tokens.write(next);
        c.complete(_RefreshResult.ok(next));
      } catch (e) {
        final status = e is DioException ? e.response?.statusCode : null;
        if (status == 401 || status == 403) {
          await tokens.clear();
          onSessionExpired?.call();
          c.complete(const _RefreshResult.rejected());
        } else {
          // Offline / timeout / server error: keep the tokens, report the real problem.
          c.complete(_RefreshResult.failed(ApiError.from(e)));
        }
      } finally {
        _refreshing = null;
      }
    }();
    return c.future;
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) => _wrap(() => dio.get<T>(path, queryParameters: query));
  Future<T> post<T>(String path, {Object? data}) => _wrap(() => dio.post<T>(path, data: data));
  Future<T> patch<T>(String path, {Object? data}) => _wrap(() => dio.patch<T>(path, data: data));
  Future<T> delete<T>(String path) => _wrap(() => dio.delete<T>(path));

  Future<T> _wrap<T>(Future<Response<T>> Function() call) async {
    try {
      return (await call()).data as T;
    } catch (e) {
      throw ApiError.from(e);
    }
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this.client);
  final ApiClient client;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final t = await client.tokens.read();
    if (t != null) options.headers['authorization'] = 'Bearer ${t.access}';
    options.headers['x-app-version'] = client.appVersion;
    final deviceId = await client.deviceIds?.get();
    if (deviceId != null) options.headers['x-device-id'] = deviceId;
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final res = err.response;
    final body = res?.data;
    final error = body is Map ? body['error'] : null;
    final code = error is Map ? error['code'] : null;
    final isExpired = res?.statusCode == 401 && code == 'AUTH_TOKEN_EXPIRED';
    final alreadyRetried = err.requestOptions.extra['retried'] == true;
    if (!isExpired || alreadyRetried) return handler.next(err);

    // If another request already rotated the tokens, just retry with the new access token.
    final sent = err.requestOptions.headers['authorization'];
    final stored = await client.tokens.read();
    final result = (stored != null && sent != 'Bearer ${stored.access}') ? _RefreshResult.ok(stored) : await client._refresh();
    final fresh = result.tokens;
    if (fresh == null) {
      return handler.reject(DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        error: result.error ?? ApiError(ApiErrorKind.sessionExpired, code: 'AUTH_REFRESH_INVALID', status: 401),
      ));
    }
    final opts = err.requestOptions
      ..headers['authorization'] = 'Bearer ${fresh.access}'
      ..extra['retried'] = true;
    try {
      handler.resolve(await client.dio.fetch<dynamic>(opts));
    } on DioException catch (e) {
      handler.next(e);
    }
  }
}

class _RefreshResult {
  const _RefreshResult.ok(Tokens this.tokens) : error = null;
  const _RefreshResult.rejected()
      : tokens = null,
        error = null;
  const _RefreshResult.failed(ApiError this.error) : tokens = null;
  final Tokens? tokens;
  final ApiError? error;
}
