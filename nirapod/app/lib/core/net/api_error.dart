import 'package:dio/dio.dart';

/// Kinds the UI cares about. Each maps to a plain-language i18n key (err.*).
enum ApiErrorKind { network, server, rateLimited, sessionExpired, validation, notFound, forbidden, planLimit, upgradeRequired, unknown }

class ApiError implements Exception {
  ApiError(this.kind, {this.code, this.status, this.details});

  final ApiErrorKind kind;

  /// Server error code from docs/CONTRACTS/error-codes.md, e.g. AUTH_INVALID_CREDENTIALS.
  final String? code;
  final int? status;
  final Map<String, dynamic>? details;

  /// i18n key for a generic message. Screens may show a more specific message for [code].
  String get messageKey => switch (kind) {
        ApiErrorKind.network => 'err.network',
        ApiErrorKind.server => 'err.server',
        ApiErrorKind.rateLimited => 'err.rate_limited',
        ApiErrorKind.sessionExpired => 'err.session_expired',
        ApiErrorKind.validation => 'err.validation',
        _ => 'err.unknown',
      };

  static ApiError from(Object e) {
    if (e is ApiError) return e;
    if (e is DioException) {
      if (e.error is ApiError) return e.error! as ApiError;
      switch (e.type) {
        case DioExceptionType.connectionError:
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.receiveTimeout:
        case DioExceptionType.sendTimeout:
          return ApiError(ApiErrorKind.network);
        default:
          break;
      }
      final status = e.response?.statusCode;
      final data = e.response?.data;
      final err = data is Map && data['error'] is Map ? (data['error'] as Map).cast<String, dynamic>() : null;
      final code = err?['code'] as String?;
      final details = (err?['details'] as Map?)?.cast<String, dynamic>();
      final kind = switch ((status, code)) {
        (_, 'RATE_LIMITED') || (429, _) => ApiErrorKind.rateLimited,
        (_, 'AUTH_REFRESH_INVALID') || (_, 'AUTH_REQUIRED') => ApiErrorKind.sessionExpired,
        (_, 'VALIDATION_FAILED') => ApiErrorKind.validation,
        (_, 'PLAN_LIMIT_REACHED') => ApiErrorKind.planLimit,
        (_, 'UPGRADE_REQUIRED') => ApiErrorKind.upgradeRequired,
        (404, _) => ApiErrorKind.notFound,
        (403, _) => ApiErrorKind.forbidden,
        (final int s, _) when s >= 500 => ApiErrorKind.server,
        _ => ApiErrorKind.unknown,
      };
      return ApiError(kind, code: code, status: status, details: details);
    }
    return ApiError(ApiErrorKind.unknown);
  }

  @override
  String toString() => 'ApiError($kind, $code, $status)';
}
