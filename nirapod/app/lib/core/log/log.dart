import 'package:flutter/foundation.dart';

/// App logging without PII or coordinates. Only short tags and messages; anything that looks like an
/// email, coordinate pair or token is scrubbed. Crash reporting (optional Crashlytics) receives the
/// same scrubbed text.
abstract final class Log {
  static final _email = RegExp(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', caseSensitive: false);
  static final _coords = RegExp(r'-?\d{1,3}\.\d{2,}\s*,\s*-?\d{1,3}\.\d{2,}');
  static final _labelled = RegExp(r'\b(lat|lng|lon|latitude|longitude)\b\s*[=:]\s*-?\d{1,3}(\.\d+)?', caseSensitive: false);
  static final _bearer = RegExp(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*');
  static final _jwt = RegExp(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+');

  static String scrub(String s) => s
      .replaceAll(_email, '[email]')
      .replaceAllMapped(_labelled, (m) => '${m[1]}=[coord]')
      .replaceAll(_coords, '[coords]')
      .replaceAll(_bearer, 'Bearer [token]')
      .replaceAll(_jwt, '[jwt]');

  /// Test hook: receives every line that would be printed.
  @visibleForTesting
  static void Function(String line)? sink;

  static void _emit(String level, String tag, String msg) {
    final line = '[$level] $tag: ${scrub(msg)}';
    if (sink != null) {
      sink!(line);
    } else if (kDebugMode) {
      debugPrint(line);
    }
  }

  static void info(String tag, String msg) => _emit('I', tag, msg);
  static void warn(String tag, String msg) => _emit('W', tag, msg);
  static void error(String tag, String msg) => _emit('E', tag, msg);
}
