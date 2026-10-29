import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/strings.dart';

/// Strings for several screen namespace sets that appear together (a screen plus a sheet it opens),
/// guaranteed to be in ONE language: if any set would fall back to English, all of them do
/// (the no-mixing rule across a screen and its overlays).
List<Strings> sameLanguageStrings(WidgetRef ref, List<String> screens) {
  final lang = ref.watch(languageProvider).code;
  final bundle = ref.watch(stringsBundleProvider);
  final all = [for (final s in screens) bundle.forScreen(s, lang)];
  if (all.every((x) => x.language == all.first.language)) return all;
  return [for (final s in screens) bundle.forScreen(s, 'en')];
}
