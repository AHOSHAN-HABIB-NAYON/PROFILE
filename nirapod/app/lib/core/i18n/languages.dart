import 'package:flutter/widgets.dart';

/// Mirrors shared/i18n/languages.json (a test keeps them identical).
@immutable
class Language {
  const Language({
    required this.code,
    required this.nativeName,
    required this.englishName,
    required this.rtl,
    required this.flag,
    required this.script,
    required this.numerals,
  });

  final String code;
  final String nativeName;
  final String englishName;
  final bool rtl;

  /// ISO country code of the SVG flag shown for this language (`assets/flags/1x1/<flag>.svg`).
  final String flag;
  final String script;

  /// CLDR numbering system: latn, beng, arab, arabext.
  final String numerals;

  Locale get locale => Locale(code);
  TextDirection get direction => rtl ? TextDirection.rtl : TextDirection.ltr;
  String get flagAsset => 'assets/flags/1x1/$flag.svg';
}

const defaultLanguageCode = 'en';

const supportedLanguages = <Language>[
  Language(code: 'en', nativeName: 'English', englishName: 'English', rtl: false, flag: 'gb', script: 'latin', numerals: 'latn'),
  Language(code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', rtl: false, flag: 'bd', script: 'bengali', numerals: 'beng'),
  Language(code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', rtl: false, flag: 'in', script: 'devanagari', numerals: 'latn'),
  Language(code: 'ur', nativeName: 'اردو', englishName: 'Urdu', rtl: true, flag: 'pk', script: 'urdu', numerals: 'arabext'),
  Language(code: 'ar', nativeName: 'العربية', englishName: 'Arabic', rtl: true, flag: 'sa', script: 'arabic', numerals: 'arab'),
  Language(code: 'es', nativeName: 'Español', englishName: 'Spanish', rtl: false, flag: 'es', script: 'latin', numerals: 'latn'),
  Language(code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', rtl: false, flag: 'id', script: 'latin', numerals: 'latn'),
  Language(code: 'ms', nativeName: 'Bahasa Melayu', englishName: 'Malay', rtl: false, flag: 'my', script: 'latin', numerals: 'latn'),
];

Language languageFor(String? code) =>
    supportedLanguages.firstWhere((l) => l.code == code, orElse: () => supportedLanguages.first);

bool isSupportedLanguage(String? code) => supportedLanguages.any((l) => l.code == code);
