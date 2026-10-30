import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/net/providers.dart';
import '../../core/session/session.dart';
import '../family/data/family_repo.dart';

/// Asks the server to put the family's sharing phones into fast "live" updates (10 s) for a few minutes.
typedef LiveWatchPing = Future<void> Function(String familyId);

final liveWatchPingProvider = Provider<LiveWatchPing>((ref) => (fid) async {
      try {
        await ref.read(apiClientProvider).post<dynamic>('/families/$fid/live-watch', data: const {});
      } catch (_) {
        // Offline or not allowed: the normal update rhythm continues.
      }
    });

/// While this widget is on screen and the app is in front, an adult's map stays live: one ping now and one
/// every 2 minutes (the phones stay fast for 5 minutes after the last ping).
class LiveWatch extends ConsumerStatefulWidget {
  const LiveWatch({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<LiveWatch> createState() => _LiveWatchState();
}

class _LiveWatchState extends ConsumerState<LiveWatch> with WidgetsBindingObserver {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  void _start() {
    _timer?.cancel();
    _ping();
    _timer = Timer.periodic(const Duration(minutes: 2), (_) => _ping());
  }

  void _ping() {
    final s = ref.read(sessionControllerProvider);
    if (s is! SignedIn || s.user.isChild) return;
    final fid = ref.read(familyIdProvider);
    if (fid == null) return;
    unawaited(ref.read(liveWatchPingProvider)(fid));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _start();
    } else if (state == AppLifecycleState.paused) {
      _timer?.cancel();
      _timer = null;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
