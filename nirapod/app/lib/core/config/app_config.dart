import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../i18n/locale_controller.dart';
import '../net/providers.dart';
import '../prefs/prefs.dart';

/// Public settings from GET /app-config (admin-editable, no secrets): force update, store link, feature
/// switches, languages, payment banner, Firebase client ids. Cached on the phone for offline starts.
class AppConfig {
  const AppConfig(this.raw);
  final Map<String, dynamic> raw;

  String get minVersion => raw['min_version'] as String? ?? '0.0.0';
  String get latestVersion => raw['latest_version'] as String? ?? '0.0.0';
  String get playStoreUrl => raw['play_store_url'] as String? ?? 'https://play.google.com/store/apps/details?id=app.nirapod.family';
  String updateMessage(String lang) {
    final m = raw['update_message'];
    if (m is Map) return (m[lang] ?? m['en'] ?? '') as String;
    return '';
  }

  bool get freePlanEnabled => raw['free_plan_enabled'] != false;
  int get trialDays => (raw['trial_days'] as num?)?.toInt() ?? 7;
  String get whatsappNumber => raw['whatsapp_number'] as String? ?? '';
  bool get paymentBannerEnabled => raw['payment_banner_enabled'] == true;
  bool get paymentBannerShowLogos => raw['payment_banner_show_logos'] == true;
  List<String> get paymentBannerCountries => ((raw['payment_banner_countries'] as List?) ?? const []).cast<String>();
  String paymentBannerText(String lang) {
    final m = raw['payment_banner_text'];
    if (m is Map) return (m[lang] ?? m['en'] ?? '') as String;
    return '';
  }

  String get liveChatHumanFor => raw['live_chat_human_for'] as String? ?? 'all';
  Map<String, dynamic>? get firebaseAndroid {
    final f = raw['firebase_android'];
    if (f is! Map) return null;
    final m = f.cast<String, dynamic>();
    return ['api_key', 'app_id', 'project_id', 'sender_id'].every((k) => (m[k] as String?)?.isNotEmpty ?? false) ? m : null;
  }
}

const _cacheKey = 'app_config_cache';

final appConfigProvider = FutureProvider<AppConfig>((ref) async {
  final prefs = ref.read(prefsProvider);
  AppConfig cfg;
  try {
    final j = await ref.read(apiClientProvider).get<Map<String, dynamic>>('/app-config');
    await prefs.setString(_cacheKey, jsonEncode(j));
    cfg = AppConfig(j);
  } catch (_) {
    final cached = prefs.getString(_cacheKey);
    cfg = AppConfig(cached == null ? const {} : (jsonDecode(cached) as Map).cast<String, dynamic>());
  }
  final langs = cfg.raw['languages_enabled'];
  if (langs is Map) ref.read(enabledLanguagesProvider.notifier).apply(langs.cast<String, dynamic>());
  return cfg;
});

/// Compares dotted versions ("1.2.10" > "1.2.9").
int compareVersions(String a, String b) {
  final pa = a.split(RegExp(r'[.+-]')).map((x) => int.tryParse(x) ?? 0).toList();
  final pb = b.split(RegExp(r'[.+-]')).map((x) => int.tryParse(x) ?? 0).toList();
  for (var i = 0; i < 3; i++) {
    final x = i < pa.length ? pa[i] : 0;
    final y = i < pb.length ? pb[i] : 0;
    if (x != y) return x.compareTo(y);
  }
  return 0;
}
