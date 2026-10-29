import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../prefs/prefs.dart';
import 'languages.dart';
import 'strings.dart';

/// Overridden in main() after loading assets.
final stringsBundleProvider = Provider<StringsBundle>((ref) => throw UnimplementedError('strings not loaded'));

/// English is the default everywhere (ASSUMPTIONS A-009). The choice is saved on the device; Phase 1
/// also saves it on the account when signed in.
class LanguageController extends Notifier<Language> {
  @override
  Language build() => languageFor(ref.read(prefsProvider).getString(PrefKeys.language) ?? defaultLanguageCode);

  Future<void> select(String code) async {
    if (!isSupportedLanguage(code)) return;
    state = languageFor(code);
    await ref.read(prefsProvider).setString(PrefKeys.language, code);
  }
}

final languageProvider = NotifierProvider<LanguageController, Language>(LanguageController.new);

/// Languages the admin has enabled (from /app-config). Defaults match the server seed.
class EnabledLanguages extends Notifier<Set<String>> {
  @override
  Set<String> build() => {'en', 'bn'};

  void apply(Map<String, dynamic> languagesEnabled) {
    final on = languagesEnabled.entries.where((e) => e.value == true).map((e) => e.key).where(isSupportedLanguage).toSet();
    state = {'en', ...on}; // English can never be disabled
    // A saved language the admin has since disabled falls back to English.
    final current = ref.read(languageProvider);
    if (!state.contains(current.code)) ref.read(languageProvider.notifier).select('en');
  }
}

final enabledLanguagesProvider = NotifierProvider<EnabledLanguages, Set<String>>(EnabledLanguages.new);

/// Strings for a screen in the selected language, following the no-mixing rule.
final screenStringsProvider = Provider.family<Strings, String>((ref, screen) {
  final lang = ref.watch(languageProvider);
  return ref.watch(stringsBundleProvider).forScreen(screen, lang.code);
});
