import 'api_error.dart';

/// Riverpod retry policy: retry only network failures (up to 3 times, 1 s / 2 s / 4 s). A server answer
/// such as PLAN_LIMIT_REACHED or NOT_FOUND is final and shown immediately.
Duration? retryNetworkOnly(int retryCount, Object error) {
  if (retryCount >= 3) return null;
  final e = ApiError.from(error);
  if (e.kind != ApiErrorKind.network) return null;
  return Duration(seconds: 1 << retryCount);
}
