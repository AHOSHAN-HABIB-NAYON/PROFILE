import 'package:flutter/widgets.dart' show StringCharacters;

import '../../../core/widgets/code_cells.dart' show codeAlphabet;

final _email = RegExp(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$");

String normalizeEmail(String raw) => raw.trim().toLowerCase();

bool isValidEmail(String raw) {
  final e = raw.trim();
  return e.length <= 254 && _email.hasMatch(e);
}

/// Common passwords (the server keeps a larger list and is the authority). Compared lower-cased.
const commonPasswords = <String>{
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword1',
  '12345678', '123456789', '1234567890', '123123123', '11111111', '00000000', '87654321', '12341234',
  'qwerty123', 'qwertyuiop', 'qwerty12', 'qwer1234', 'asdf1234', 'asdfgh123', 'zxcvbnm1', '1q2w3e4r',
  '1qaz2wsx', 'abc12345', 'abcd1234', 'abcdef12', 'abc123456', 'a1b2c3d4', 'aa123456', 'iloveyou1',
  'iloveyou', 'letmein1', 'welcome1', 'welcome123', 'monkey123', 'dragon123', 'sunshine1', 'princess1',
  'football1', 'baseball1', 'superman1', 'batman123', 'master123', 'shadow123', 'trustno1', 'whatever1',
  'admin123', 'administrator', 'login123', 'test1234', 'changeme1', 'secret123', 'computer1', 'internet1',
  'bangladesh', 'bangladesh1', 'dhaka1234', 'nirapod123', 'nirapod1', 'family123', 'pakistan1', 'india123',
  'google123', 'samsung1', 'iphone123', 'freedom1', 'michael1', 'jordan23', 'charlie1', 'qazwsx123',
};

class PasswordCheck {
  const PasswordCheck({required this.length, required this.letterAndNumber, required this.notCommon});
  final bool length;
  final bool letterAndNumber;
  final bool notCommon;
  bool get ok => length && letterAndNumber && notCommon;
}

PasswordCheck checkPassword(String p) => PasswordCheck(
      length: p.length >= 8 && p.length <= 128,
      letterAndNumber: RegExp(r'[A-Za-z\p{L}]', unicode: true).hasMatch(p) && RegExp(r'\d').hasMatch(p),
      notCommon: p.isNotEmpty && !commonPasswords.contains(p.toLowerCase()),
    );

enum PasswordStrength { weak, fair, good, strong }

/// Live strength for the meter. Anything that breaks a rule is "weak".
PasswordStrength passwordStrength(String p) {
  final c = checkPassword(p);
  if (!c.ok) return PasswordStrength.weak;
  var score = 0;
  if (p.length >= 12) score++;
  if (p.length >= 16) score++;
  if (RegExp(r'[a-z]').hasMatch(p) && RegExp(r'[A-Z]').hasMatch(p)) score++;
  if (RegExp(r'[^A-Za-z0-9]').hasMatch(p)) score++;
  if (p.split('').toSet().length < 5) score = 0;
  return score >= 3 ? PasswordStrength.strong : (score >= 1 ? PasswordStrength.good : PasswordStrength.fair);
}

/// Full name: 1-60 characters (user-perceived characters, any script, emoji allowed).
String? cleanName(String raw) {
  final n = raw.trim().replaceAll(RegExp(r'\s+'), ' ');
  final len = n.characters.length;
  return (len >= 1 && len <= 60) ? n : null;
}

/// Family / child code: upper-case, drops spaces, dashes and every character outside [codeAlphabet]
/// (the alphabet has no ambiguous 0 O 1 I L, so those never appear in a valid code).
String normalizeFamilyCode(String raw) =>
    raw.toUpperCase().split('').where(codeAlphabet.contains).join();

bool isValidFamilyCode(String raw) => RegExp('^[$codeAlphabet]{6}\$').hasMatch(raw);
