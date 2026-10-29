import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../i18n/locale_controller.dart';
import '../log/log.dart';
import '../net/providers.dart';
import '../session/session.dart';

/// Messages that arrive while the app is open (shown in-app; SOS opens the full-screen alert).
class PushEvent {
  const PushEvent(this.type, this.data);
  final String type;
  final Map<String, dynamic> data;
}

/// FCM with runtime Firebase options from /app-config (set in admin), so no google-services.json is baked
/// into the APK. Android channels (Safety / Family / Account / Marketing) are created natively with names in
/// the selected language. Without Firebase config, the app relies on realtime + email.
abstract class PushService {
  Future<void> start();
  Future<void> stop();
  Stream<PushEvent> get foreground;
  Stream<PushEvent> get opened;
}

class NoopPushService implements PushService {
  @override
  Future<void> start() async {}
  @override
  Future<void> stop() async {}
  @override
  Stream<PushEvent> get foreground => const Stream.empty();
  @override
  Stream<PushEvent> get opened => const Stream.empty();
}

class FirebasePushService implements PushService {
  FirebasePushService(this._ref);
  final Ref _ref;
  static const _channels = MethodChannel('nirapod/tracking');
  final _fg = StreamController<PushEvent>.broadcast();
  final _open = StreamController<PushEvent>.broadcast();
  StreamSubscription<String>? _refresh;
  bool _ready = false;

  @override
  Stream<PushEvent> get foreground => _fg.stream;
  @override
  Stream<PushEvent> get opened => _open.stream;

  Future<bool> _init() async {
    if (_ready) return true;
    final cfg = await _ref.read(appConfigProvider.future);
    final f = cfg.firebaseAndroid;
    if (f == null) return false;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: FirebaseOptions(
            apiKey: f['api_key'] as String,
            appId: f['app_id'] as String,
            projectId: f['project_id'] as String,
            messagingSenderId: f['sender_id'] as String,
          ),
        );
      }
      FirebaseMessaging.onMessage.listen((m) => _fg.add(PushEvent(m.data['type'] as String? ?? '', m.data)));
      FirebaseMessaging.onMessageOpenedApp.listen((m) => _open.add(PushEvent(m.data['type'] as String? ?? '', m.data)));
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) _open.add(PushEvent(initial.data['type'] as String? ?? '', initial.data));
      _ready = true;
      return true;
    } catch (e) {
      Log.warn('push', 'firebase init failed: ${e.runtimeType}');
      return false;
    }
  }

  Future<void> _createChannels() async {
    final s = _ref.read(screenStringsProvider('notifications'));
    try {
      await _channels.invokeMethod<bool>('createChannels', {
        'safety': s.t('alerts.ch_safety'),
        'family': s.t('alerts.ch_family'),
        'account': s.t('alerts.ch_account'),
        'marketing': s.t('alerts.ch_marketing'),
      });
    } catch (_) {}
  }

  @override
  Future<void> start() async {
    await _createChannels();
    if (!await _init()) return;
    try {
      // Every new or refreshed token arrives on onRegistered.
      await _refresh?.cancel();
      _refresh = FirebaseMessaging.instance.onRegistered.listen(_send);
      await FirebaseMessaging.instance.register();
    } catch (e) {
      Log.warn('push', 'token failed: ${e.runtimeType}');
    }
  }

  Future<void> _send(String token) async {
    try {
      await _ref.read(apiClientProvider).post<dynamic>('/me/push-token', data: {'token': token});
    } catch (_) {}
  }

  @override
  Future<void> stop() async {
    await _refresh?.cancel();
    _refresh = null;
    if (_ready) {
      try {
        await FirebaseMessaging.instance.unregister();
      } catch (_) {}
    }
  }
}

final pushServiceProvider = Provider<PushService>((ref) => FirebasePushService(ref));

/// Starts push for a signed-in user (token registered for this session); stops on sign-out.
final pushHooksProvider = Provider<void>((ref) {
  final s = ref.watch(sessionControllerProvider);
  if (s is SignedIn) unawaited(ref.read(pushServiceProvider).start());
});
