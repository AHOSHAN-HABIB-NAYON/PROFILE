/// Build-time configuration via --dart-define. No secrets here: the app never holds API keys
/// except the Maps key, which is restricted by package name + SHA-1 in Google Cloud.
abstract final class Env {
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://family-track.webtecit.com/api/v1');
  static const appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '0.1.0');
}
