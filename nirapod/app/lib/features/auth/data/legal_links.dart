/// Public legal pages (opened in the in-app browser). Overridable at build time via --dart-define.
abstract final class LegalLinks {
  static const site = String.fromEnvironment('SITE_BASE_URL', defaultValue: 'https://family-track.webtecit.com');
  static const terms = '$site/terms';
  static const privacy = '$site/privacy';

  /// Invite / child join link (Android App Link). The code can always be typed manually.
  static String join(String code) => '$site/join?code=${Uri.encodeQueryComponent(code)}';
}
