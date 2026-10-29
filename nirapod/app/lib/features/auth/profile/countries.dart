import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Localized CLDR country names for the 8 app languages (assets/geo/countries.json).
class CountryNames {
  CountryNames(this._names);
  final Map<String, Map<String, String>> _names;

  static Future<CountryNames> load(AssetBundle assets) async {
    final j = jsonDecode(await assets.loadString('assets/geo/countries.json')) as Map<String, dynamic>;
    final names = (j['names'] as Map<String, dynamic>).map(
      (lang, v) => MapEntry(lang, (v as Map<String, dynamic>).map((cc, n) => MapEntry(cc, n as String))),
    );
    return CountryNames(names);
  }

  List<String> get codes => (_names['en']?.keys.toList() ?? <String>[])..sort();

  /// Name of [cc] in [lang] (falls back to English, then the code).
  String name(String cc, String lang) => _names[lang]?[cc.toUpperCase()] ?? _names['en']?[cc.toUpperCase()] ?? cc.toUpperCase();

  /// Name in the country's own language when it is one of the app languages (e.g. BD -> বাংলাদেশ).
  String nativeName(String cc) {
    final lang = nativeLanguageOf[cc.toUpperCase()] ?? 'en';
    return name(cc, lang);
  }

  bool has(String cc) => _names['en']?.containsKey(cc.toUpperCase()) ?? false;
}

/// Main language of a country, limited to the 8 app languages (others show the English name).
const nativeLanguageOf = <String, String>{
  'BD': 'bn',
  'IN': 'hi',
  'PK': 'ur',
  'SA': 'ar', 'AE': 'ar', 'QA': 'ar', 'KW': 'ar', 'BH': 'ar', 'OM': 'ar', 'JO': 'ar', 'LB': 'ar', 'EG': 'ar',
  'IQ': 'ar', 'SY': 'ar', 'YE': 'ar', 'LY': 'ar', 'TN': 'ar', 'DZ': 'ar', 'MA': 'ar', 'SD': 'ar', 'PS': 'ar',
  'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'CL': 'es', 'PE': 'es', 'VE': 'es', 'EC': 'es', 'GT': 'es',
  'CU': 'es', 'BO': 'es', 'DO': 'es', 'HN': 'es', 'PY': 'es', 'SV': 'es', 'NI': 'es', 'CR': 'es', 'PA': 'es', 'UY': 'es',
  'ID': 'id',
  'MY': 'ms', 'BN': 'ms',
};

String flagAsset4x3(String cc) => 'assets/flags/4x3/${cc.toLowerCase()}.svg';

final countryNamesProvider = FutureProvider<CountryNames>((ref) => CountryNames.load(rootBundle));

/// Case- and accent-insensitive "contains" used by the pickers.
String foldForSearch(String s) {
  const from = 'àáâãäåāçèéêëēìíîïīñòóôõöøōùúûüūýÿ';
  const to = 'aaaaaaaceeeeeiiiiinooooooouuuuuyy';
  final lower = s.toLowerCase();
  final b = StringBuffer();
  for (final ch in lower.split('')) {
    final i = from.indexOf(ch);
    b.write(i >= 0 ? to[i] : ch);
  }
  return b.toString().replaceAll('_', ' ');
}
