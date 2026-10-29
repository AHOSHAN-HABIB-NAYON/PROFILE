import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../../core/config/env.dart';
import '../../../core/log/log.dart';
import '../../../core/net/providers.dart';
import '../../../core/session/session.dart';
import 'family_models.dart';
import 'family_repo.dart';

/// Socket.IO client (namespace /rt, docs/CONTRACTS/websocket-events.md). Live updates arrive here while
/// the app is open; /live polling every 30 s is the fallback (e.g. shared hosting without WebSockets).
class RealtimeClient {
  RealtimeClient(this._ref);
  final Ref _ref;
  io.Socket? _socket;
  final _seen = <String>{};

  /// Called for `update.requested` (child phones show "`name` requested your location").
  void Function(String byName)? onUpdateRequested;

  /// Safety events (Phase 4): `sos.new`, `sos.updated`, `trip.updated`, `notification.new`.
  final _events = StreamController<RealtimeEvent>.broadcast();
  Stream<RealtimeEvent> get events => _events.stream;
  static const safetyEvents = ['sos.new', 'sos.updated', 'trip.updated', 'notification.new'];

  static String get serverOrigin => Env.apiBaseUrl.replaceFirst(RegExp(r'/api/v\d+/?$'), '');

  Future<void> connect() async {
    if (_socket != null) return;
    final tokens = await _ref.read(tokenStoreProvider).read();
    if (tokens == null) return;
    final s = io.io(
      '$serverOrigin/rt',
      io.OptionBuilder()
          .setPath('/socket.io')
          .setTransports(['websocket'])
          .setAuth({'token': tokens.access})
          .enableReconnection()
          .disableAutoConnect()
          .build(),
    );
    s.onConnectError((e) async {
      // Expired access token: any API call refreshes it; then reconnect with the new one.
      final code = e is Map ? (e['data'] is Map ? (e['data'] as Map)['code'] : null) : null;
      if (code == 'AUTH_TOKEN_EXPIRED') {
        try {
          await _ref.read(apiClientProvider).get<dynamic>('/me');
          final t = await _ref.read(tokenStoreProvider).read();
          if (t != null) s.auth = {'token': t.access};
        } catch (_) {}
      }
    });
    s.on('location.update', (data) => _onEnvelope(data, (d) {
          final p = d['point'];
          if (p is Map) {
            _ref.read(liveProvider.notifier).applyUpdate(d['member_id'] as String, LivePoint.fromJson(p.cast<String, dynamic>()));
          }
        }));
    s.on('update.requested', (data) => _onEnvelope(data, (d) => onUpdateRequested?.call((d['by_name'] as String?) ?? '')));
    for (final name in safetyEvents) {
      s.on(name, (data) => _onEnvelope(data, (d) => _events.add(RealtimeEvent(name, d))));
    }
    s.connect();
    _socket = s;
  }

  void _onEnvelope(dynamic raw, void Function(Map<String, dynamic>) handle) {
    if (raw is! Map) return;
    final id = raw['id'] as String?;
    if (id != null && !_seen.add(id)) return; // drop duplicates (socket + push)
    if (_seen.length > 500) _seen.clear();
    final d = raw['data'];
    if (d is Map) {
      try {
        handle(d.cast<String, dynamic>());
      } catch (e) {
        Log.warn('realtime', 'bad event: ${e.runtimeType}');
      }
    }
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }

  void dispose() {
    disconnect();
    _events.close();
  }
}

class RealtimeEvent {
  const RealtimeEvent(this.name, this.data);
  final String name;
  final Map<String, dynamic> data;
}

/// Connected while signed in; disconnected on sign-out.
final realtimeProvider = Provider<RealtimeClient>((ref) {
  final client = RealtimeClient(ref);
  ref.onDispose(client.dispose);
  final s = ref.watch(sessionControllerProvider);
  if (s is SignedIn) client.connect();
  return client;
});
