import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/net/api_error.dart';
import 'package:nirapod/core/net/device_id.dart';
import 'package:nirapod/core/session/session.dart';
import 'package:nirapod/features/auth/data/auth_errors.dart';
import 'package:nirapod/features/auth/data/auth_flow.dart';
import 'package:nirapod/features/auth/data/device_identity.dart';
import 'package:nirapod/features/auth/data/validators.dart';
import 'package:nirapod/features/auth/family/child_code_generate_screen.dart';
import 'package:nirapod/features/auth/profile/profile_setup_screen.dart';

void main() {
  group('password rules', () {
    test('length, letter + number, not common', () {
      expect(checkPassword('short1').length, isFalse);
      expect(checkPassword('abcdefgh').letterAndNumber, isFalse);
      expect(checkPassword('12345678').letterAndNumber, isFalse);
      expect(checkPassword('password1').notCommon, isFalse);
      expect(checkPassword('PassWord123').notCommon, isFalse, reason: 'case-insensitive');
      expect(checkPassword('river7lantern').ok, isTrue);
      expect(checkPassword('পাসওয়ার্ড১২৩৪5').letterAndNumber, isTrue, reason: 'any script letter + a digit');
    });

    test('strength meter', () {
      expect(passwordStrength(''), PasswordStrength.weak);
      expect(passwordStrength('password1'), PasswordStrength.weak);
      expect(passwordStrength('river7la'), PasswordStrength.fair);
      expect(passwordStrength('river7lantern'), PasswordStrength.good);
      expect(passwordStrength('River7-Lantern-Moon'), PasswordStrength.strong);
      expect(passwordStrength('aaaa1111'), PasswordStrength.fair);
    });
  });

  test('email validation and normalisation', () {
    expect(isValidEmail('rafi@example.com'), isTrue);
    expect(isValidEmail(' rafi@example.com '), isTrue);
    expect(isValidEmail('rafi@'), isFalse);
    expect(isValidEmail('rafi example.com'), isFalse);
    expect(normalizeEmail(' Rafi@Example.COM '), 'rafi@example.com');
  });

  test('names: 1-60 user-perceived characters, any script, emoji ok', () {
    expect(cleanName('   '), isNull);
    expect(cleanName('  Rafi   Ahmed '), 'Rafi Ahmed');
    expect(cleanName('রাফি'), 'রাফি');
    expect(cleanName('محمد'), 'محمد');
    expect(cleanName('Mina \u{1F338}'), isNotNull);
    expect(cleanName('a' * 60), isNotNull);
    expect(cleanName('a' * 61), isNull);
    expect(cleanName('\u{1F468}‍\u{1F469}‍\u{1F467}' * 60), isNotNull, reason: 'a family emoji is one character');
  });

  test('child code normalisation: upper-case, no ambiguous characters', () {
    expect(normalizeFamilyCode('k7q-2mx'), 'K7Q2MX');
    expect(normalizeFamilyCode(' k7q 2mx '), 'K7Q2MX');
    expect(normalizeFamilyCode('O0I1L5'), '5', reason: 'O 0 I 1 L are never in a code');
    expect(isValidFamilyCode('K7Q2MX'), isTrue);
    expect(isValidFamilyCode('K7Q2M'), isFalse);
    expect(isValidFamilyCode('K7Q2M0'), isFalse);
  });

  group('error mapping (plain language, never raw server text)', () {
    ApiError e(String code, {int? status, Map<String, dynamic>? details}) =>
        ApiError(ApiErrorKind.unknown, code: code, status: status, details: details);

    test('login', () {
      expect(loginErrorKey(e('AUTH_INVALID_CREDENTIALS', status: 401)), 'auth.err_invalid');
      expect(loginErrorKey(e('AUTH_LOCKED', status: 423)), 'auth.err_locked');
      expect(loginErrorKey(ApiError(ApiErrorKind.network)), 'err.network');
      expect(loginFailureKind(e('AUTH_EMAIL_NOT_VERIFIED', status: 403)), LoginFailure.verifyEmail);
    });

    test('codes: wrong with tries left, expired, locked', () {
      final wrong = codeErrorKey(e('CODE_INVALID', details: {'attempts_left': 3}));
      expect(wrong.$1, 'verify.err_wrong');
      expect(wrong.$2['left'], 3);
      expect(codeErrorKey(e('CODE_INVALID', details: {'attempts_left': 0})).$1, 'verify.err_locked');
      expect(codeErrorKey(e('CODE_EXPIRED', status: 410)).$1, 'verify.err_expired');
      expect(codeErrorKey(e('AUTH_LOCKED', status: 423)).$1, 'verify.err_locked');
    });

    test('register, child, google', () {
      expect(registerErrorKey(e('CONFLICT', status: 409)), 'auth.err_email_taken');
      expect(registerErrorKey(e('VALIDATION_FAILED', details: {'field': 'password'})), 'auth.err_password');
      expect(childCodeErrorKey(e('CODE_INVALID')), 'child.err_code');
      expect(childCodeErrorKey(e('CODE_EXPIRED', status: 410)), 'child.err_expired');
      expect(needsAgeTerms(e('CONSENT_REQUIRED', details: {'needs': 'age_terms'})), isTrue);
    });
  });

  group('post-auth routing', () {
    AuthUser u({String? name = 'Rafi', String role = 'parent', String provider = 'email', String? familyId}) => AuthUser.fromJson(
          {'id': 'u', 'name': name, 'role': role, 'auth_provider': provider, 'family_id': familyId},
        );

    test('profile setup first, children always to child home', () {
      expect(destinationAfterAuth(u(name: null), needsProfileSetup: true), 'profile_setup');
      expect(destinationAfterAuth(u(), needsProfileSetup: false), 'home');
      expect(destinationAfterAuth(u(role: 'child', provider: 'device'), needsProfileSetup: true), 'child_home');
    });

    test('login page for the remembered role', () {
      expect(loginScreenFor(RoleChoice.probashi), 'login_probashi');
      expect(loginScreenFor(RoleChoice.member), 'login_member');
      expect(loginScreenFor(null), 'login_parent');
    });

    test('after profile setup, by role', () {
      expect(nextAfterSetup(RoleChoice.parent, u()), SetupNext.parentFamily);
      expect(nextAfterSetup(RoleChoice.probashi, u()), SetupNext.probashiChoice);
      expect(nextAfterSetup(RoleChoice.probashi, u(familyId: 'f')), SetupNext.home);
      expect(nextAfterSetup(RoleChoice.member, u()), SetupNext.home);
      expect(nextAfterSetup(RoleChoice.parent, u(role: 'guardian')), SetupNext.home, reason: 'server role wins');
    });
  });

  test('device info uses the core device id (same id as the x-device-id header)', () async {
    final info = await DeviceIdentity(MemoryDeviceIdStore('dev-1')).deviceInfo();
    expect(info['device_id'], 'dev-1');
    expect(info['app_version'], isNotEmpty);
    expect(info.keys.toSet(), {'device_id', 'os_version', 'app_version'});
  });

  test('child code display helpers', () {
    final now = DateTime.utc(2026, 10, 28, 10);
    expect(hoursLeft(now.add(const Duration(hours: 24)), now), 24);
    expect(hoursLeft(now.add(const Duration(hours: 23, minutes: 1)), now), 24);
    expect(hoursLeft(now.subtract(const Duration(minutes: 1)), now), 0);
    expect(spacedCode('K7Q2MX'), 'K7Q 2MX');
  });
}
