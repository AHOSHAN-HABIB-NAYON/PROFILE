import 'dart:convert';

import 'package:flutter/services.dart';

import 'languages.dart';

/// All string tables, loaded once from assets/i18n (copied from shared/i18n).
class StringsBundle {
  StringsBundle(this.tables, this.screens);

  /// language code -> key -> text
  final Map<String, Map<String, String>> tables;

  /// screen id -> namespaces it uses (docs/CONTRACTS/i18n-keys.json)
  final Map<String, List<String>> screens;

  Map<String, String> get english => tables[defaultLanguageCode]!;

  static Future<StringsBundle> load(AssetBundle assets) async {
    final tables = <String, Map<String, String>>{};
    for (final l in supportedLanguages) {
      final raw = await assets.loadString('assets/i18n/${l.code}.json');
      tables[l.code] = (jsonDecode(raw) as Map<String, dynamic>).map((k, v) => MapEntry(k, v as String));
    }
    final screensRaw = jsonDecode(await assets.loadString('assets/i18n/_screens.json')) as Map<String, dynamic>;
    final screens = screensRaw.map((k, v) => MapEntry(k, (v as List<dynamic>).cast<String>()));
    return StringsBundle(tables, screens);
  }

  List<String> namespacesFor(String screen) => screens[screen] ?? screens['_default'] ?? const [];

  /// NO MIXING rule: a screen is shown in [languageCode] only when that language has every key of
  /// every namespace the screen uses; otherwise the whole screen is English.
  Strings forScreen(String screen, String languageCode) {
    final namespaces = namespacesFor(screen);
    final table = tables[languageCode];
    if (languageCode == defaultLanguageCode || table == null) {
      return Strings(defaultLanguageCode, english, requestedLanguage: languageCode);
    }
    final needed = english.keys.where((k) => namespaces.contains(k.split('.').first));
    final complete = needed.every(table.containsKey);
    return complete
        ? Strings(languageCode, table, requestedLanguage: languageCode)
        : Strings(defaultLanguageCode, english, requestedLanguage: languageCode);
  }
}

/// Strings for one screen in exactly one language.
class Strings {
  Strings(this.language, this._table, {required this.requestedLanguage});

  /// The language the text is actually in.
  final String language;

  /// The language the user selected (drives layout direction and numerals).
  final String requestedLanguage;
  final Map<String, String> _table;

  bool get isFallback => language != requestedLanguage;

  /// Looks up [key] and fills `{placeholders}`. A missing key returns the key itself in debug builds
  /// so it is easy to spot; tests assert no key is ever missing.
  String t(String key, [Map<String, Object> args = const {}]) {
    var s = _table[key];
    if (s == null) {
      assert(false, 'Missing i18n key $key');
      return key;
    }
    args.forEach((k, v) => s = s!.replaceAll('{$k}', '$v'));
    return s!;
  }
}
