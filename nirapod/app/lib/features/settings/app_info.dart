import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/log/log.dart';
import '../../core/prefs/prefs.dart';

/// "1.4.2" from the installed app (overridden in tests).
final appVersionProvider = FutureProvider<String>((ref) async => (await PackageInfo.fromPlatform()).version);

/// Remembers which "new version" prompts were dismissed, so each version is offered once.
class UpdatePromptStore {
  UpdatePromptStore(this._p);
  final SharedPreferences _p;
  static const _key = 'update_prompt_dismissed';
  bool dismissed(String version) => _p.getString(_key) == version;
  Future<void> dismiss(String version) => _p.setString(_key, version);
}

final updatePromptStoreProvider = Provider<UpdatePromptStore>((ref) => UpdatePromptStore(ref.watch(prefsProvider)));

/// Play In-App Review: asked at most once, only after 7 days of use and 3 app sessions, never after an SOS.
class ReviewService {
  ReviewService(this._p, {InAppReview? review, DateTime Function()? now})
      : _review = review ?? InAppReview.instance,
        _now = now ?? DateTime.now;
  final SharedPreferences _p;
  final InAppReview _review;
  final DateTime Function() _now;
  static const _first = 'review_first_open';
  static const _sessions = 'review_sessions';
  static const _asked = 'review_asked';
  static const playUrl = 'https://play.google.com/store/apps/details?id=app.nirapod.family';

  /// Call once per app start (signed in). Returns true when the review sheet should be requested now.
  bool recordSessionAndCheck() {
    final now = _now();
    final first = DateTime.tryParse(_p.getString(_first) ?? '');
    if (first == null) _p.setString(_first, now.toIso8601String());
    final n = (_p.getInt(_sessions) ?? 0) + 1;
    _p.setInt(_sessions, n);
    if (_p.getBool(_asked) == true || first == null) return false;
    return n >= 3 && now.difference(first).inDays >= 7;
  }

  Future<void> maybeAsk() async {
    if (!recordSessionAndCheck()) return;
    try {
      if (await _review.isAvailable()) {
        await _p.setBool(_asked, true);
        await _review.requestReview();
      }
    } catch (e) {
      Log.warn('review', 'request failed: ${e.runtimeType}');
    }
  }

  /// "Rate us" row and the update button: the Play listing.
  Future<void> openStore({String? url}) async {
    try {
      final u = Uri.parse(url == null || url.isEmpty ? playUrl : url);
      if (!await launchUrl(u, mode: LaunchMode.externalApplication)) await _review.openStoreListing();
    } catch (e) {
      Log.warn('review', 'store open failed: ${e.runtimeType}');
    }
  }
}

final reviewServiceProvider = Provider<ReviewService>((ref) => ReviewService(ref.watch(prefsProvider)));
