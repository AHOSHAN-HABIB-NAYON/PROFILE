import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/i18n/languages.dart';
import 'package:nirapod/core/i18n/numerals.dart';
import 'package:nirapod/core/i18n/strings.dart';

import 'helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late StringsBundle b;
  setUpAll(() async => b = await loadStrings());

  test('8 languages, identical to shared/i18n/languages.json', () {
    final json = jsonDecode(File('../shared/i18n/languages.json').readAsStringSync()) as Map<String, dynamic>;
    final list = (json['languages'] as List<dynamic>).cast<Map<String, dynamic>>();
    expect(list.map((l) => l['code']), supportedLanguages.map((l) => l.code));
    for (var i = 0; i < list.length; i++) {
      final l = supportedLanguages[i];
      expect([l.nativeName, l.englishName, l.rtl, l.flag, l.script, l.numerals],
          [list[i]['nativeName'], list[i]['englishName'], list[i]['rtl'], list[i]['flag'], list[i]['script'], list[i]['numerals']]);
    }
    expect(supportedLanguages.map((l) => l.code), containsAll(['en', 'bn', 'hi', 'ur', 'ar', 'es', 'id', 'ms']));
    expect(supportedLanguages.where((l) => l.rtl).map((l) => l.code), unorderedEquals(['ur', 'ar']));
  });

  test('English is the default and unknown languages fall back to English', () {
    expect(defaultLanguageCode, 'en');
    expect(languageFor('xx').code, 'en');
  });

  test('en and bn are complete; every file has only known keys', () {
    for (final code in ['en', 'bn']) {
      expect(b.tables[code]!.keys.toSet(), b.english.keys.toSet(), reason: code);
    }
    for (final l in supportedLanguages) {
      expect(b.english.keys.toSet().containsAll(b.tables[l.code]!.keys), isTrue, reason: l.code);
    }
  });

  test('NO MIXING: an incomplete language shows the whole screen in English', () {
    final bnHome = b.forScreen('home', 'bn');
    expect(bnHome.language, 'bn');
    expect(bnHome.t('nav.home'), 'হোম');
    final msHome = b.forScreen('home', 'ms'); // ms only has greetings so far
    expect(msHome.language, 'en');
    expect(msHome.isFallback, isTrue);
    expect(msHome.t('greeting.afternoon'), 'Good afternoon,'); // not 'Selamat tengah hari,'
    final msSheet = b.forScreen('language_sheet', 'ms'); // namespace complete -> Malay
    expect(msSheet.t('lang.sheet_title'), 'Bahasa');
  });

  test('English screens never contain Bengali script', () {
    final bengali = RegExp(r'[ঀ-৿]');
    for (final v in b.english.values) {
      expect(bengali.hasMatch(v), isFalse, reason: v);
    }
  });

  test('greeting strings match the spec exactly', () {
    const spec = {
      'en': ['Good morning,', 'Good afternoon,', 'Good evening,', 'Good night,'],
      'bn': ['শুভ সকাল,', 'শুভ দুপুর,', 'শুভ সন্ধ্যা,', 'শুভ রাত্রি,'],
      'hi': ['सुप्रभात,', 'शुभ दोपहर,', 'शुभ संध्या,', 'शुभ रात्रि,'],
      'ur': ['صبح بخیر،', 'دوپہر بخیر،', 'شام بخیر،', 'شب بخیر،'],
      'ar': ['صباح الخير،', 'طاب يومك،', 'مساء الخير،', 'تصبح على خير،'],
      'es': ['Buenos días,', 'Buenas tardes,', 'Buenas tardes,', 'Buenas noches,'],
      'id': ['Selamat pagi,', 'Selamat siang,', 'Selamat sore,', 'Selamat malam,'],
      'ms': ['Selamat pagi,', 'Selamat tengah hari,', 'Selamat petang,', 'Selamat malam,'],
    };
    spec.forEach((code, g) {
      final t = b.tables[code]!;
      expect([t['greeting.morning'], t['greeting.afternoon'], t['greeting.evening'], t['greeting.night']], g, reason: code);
    });
  });

  test('Malay and Indonesian are separate files', () {
    expect(File('assets/i18n/ms.json').existsSync(), isTrue);
    expect(File('assets/i18n/id.json').existsSync(), isTrue);
    expect(b.tables['ms']!['greeting.evening'], isNot(b.tables['id']!['greeting.evening']));
  });

  test('placeholders are filled', () {
    expect(b.forScreen('home', 'en').t('a11y.notifications', {'count': 3}), 'Notifications, 3 unread');
  });

  test('numerals', () {
    expect(localizeDigits('7:57', 'beng'), '৭:৫৭');
    expect(localizeDigits('7:57', 'arab'), '٧:٥٧');
    expect(localizeDigits('7:57', 'arabext'), '۷:۵۷');
    expect(localizeDigits('7:57', 'latn'), '7:57');
    expect(asciiDigits('৭:৫৭ ١٢ ۳'), '7:57 12 3');
  });
}
