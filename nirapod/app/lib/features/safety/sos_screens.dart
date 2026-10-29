import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/numerals.dart';
import '../../core/i18n/strings.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/motion/motion.dart';
import '../../core/net/api_error.dart';
import '../../core/session/session.dart';
import '../../core/state/buttons.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/tz/tz_utils.dart';
import '../../nav/router.dart';
import '../family/data/family_repo.dart';
import '../family/data/realtime.dart';
import 'data/safety_repo.dart';

/// Current position for SOS, quickly (the server falls back to the latest uploaded point).
typedef SosPositionReader = Future<(double, double, double)?> Function();

final sosPositionReaderProvider = Provider<SosPositionReader>((ref) => () async {
      try {
        final p = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 4)),
        );
        return (p.latitude, p.longitude, p.accuracy);
      } catch (_) {
        try {
          final p = await Geolocator.getLastKnownPosition();
          return p == null ? null : (p.latitude, p.longitude, p.accuracy);
        } catch (_) {
          return null;
        }
      }
    });

const sosCountdownSeconds = 5;

String sosStatusLabel(Strings s, String status) => s.t('sos.st_${const {'queued', 'sent', 'delivered', 'seen', 'responded', 'failed'}.contains(status) ? status : 'sent'}');

/// Child SOS: opening it starts the 5-second cancel countdown (the press on Child Home is the trigger),
/// then "Sending…", then the delivery status for every recipient, the emergency number and "I am safe now".
class ChildSosScreen extends ConsumerStatefulWidget {
  const ChildSosScreen({super.key});
  @override
  ConsumerState<ChildSosScreen> createState() => _ChildSosScreenState();
}

enum _Phase { countdown, sending, sent, failed, resolved }

class _ChildSosScreenState extends ConsumerState<ChildSosScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _ring = AnimationController(vsync: this, duration: const Duration(seconds: sosCountdownSeconds));
  _Phase _phase = _Phase.countdown;
  SosEvent? _sos;
  Timer? _poll;
  StreamSubscription<RealtimeEvent>? _sub;
  int _lastSecond = sosCountdownSeconds;

  @override
  void initState() {
    super.initState();
    _ring
      ..addListener(_tick)
      ..addStatusListener((st) {
        if (st == AnimationStatus.completed) _send();
      })
      ..forward();
    HapticFeedback.heavyImpact();
    _sub = ref.read(realtimeProvider).events.listen((e) {
      if (e.name == 'sos.updated' && e.data['id'] == _sos?.id) {
        setState(() => _sos = SosEvent.fromJson(e.data));
      }
    });
  }

  void _tick() {
    final left = (sosCountdownSeconds * (1 - _ring.value)).ceil();
    if (left != _lastSecond) {
      _lastSecond = left;
      HapticFeedback.mediumImpact();
      setState(() {});
    }
  }

  @override
  void dispose() {
    _ring.dispose();
    _poll?.cancel();
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _phase = _Phase.sending);
    unawaited(HapticFeedback.heavyImpact());
    try {
      final pos = await ref.read(sosPositionReaderProvider)();
      final sos = await ref.read(safetyRepoProvider).sendSos(lat: pos?.$1, lng: pos?.$2, accuracyM: pos?.$3);
      if (!mounted) return;
      setState(() {
        _sos = sos;
        _phase = _Phase.sent;
      });
      _poll = Timer.periodic(const Duration(seconds: 5), (_) => _refresh());
    } catch (_) {
      if (mounted) setState(() => _phase = _Phase.failed);
    }
  }

  Future<void> _refresh() async {
    final id = _sos?.id;
    if (id == null) return;
    try {
      final s = await ref.read(safetyRepoProvider).sos(id);
      if (mounted) setState(() => _sos = s);
    } catch (_) {}
  }

  void _cancel() {
    _ring.stop();
    context.go(locationFor('child_home'));
  }

  Future<void> _resolve() async {
    final id = _sos?.id;
    if (id == null) return;
    try {
      await ref.read(safetyRepoProvider).resolveSos(id);
      _poll?.cancel();
      if (mounted) setState(() => _phase = _Phase.resolved);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ref.read(screenStringsProvider('sos')).t(ApiError.from(e).messageKey))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('sos'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final number = ref.watch(emergencyNumberProvider).value;
    final digits = s.language == 'bn' ? 'beng' : 'latn';
    return PopScope(
      canPop: _phase != _Phase.countdown && _phase != _Phase.sending,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _phase == _Phase.countdown) _cancel();
      },
      child: Scaffold(
        backgroundColor: c.background,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(Space.screenHorizontal),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                AppIcon(AppIcons.sos, color: c.dangerText),
                const SizedBox(width: Space.xs),
                Expanded(child: Semantics(header: true, child: Text(s.t('sos.title'), style: t.titleMedium!.copyWith(color: c.dangerText)))),
              ]),
              Expanded(
                child: switch (_phase) {
                  _Phase.countdown => Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Semantics(
                        liveRegion: true,
                        label: s.t('sos.countdown', {'seconds': localizeDigits('$_lastSecond', digits)}),
                        child: SizedBox.square(
                          dimension: 220,
                          child: AnimatedBuilder(
                            animation: _ring,
                            builder: (context, _) => CustomPaint(
                              painter: _RingPainter(progress: _ring.value, color: c.danger, track: c.danger.withValues(alpha: 0.15)),
                              child: Center(
                                child: Text(
                                  localizeDigits('$_lastSecond', digits),
                                  style: t.displaySmall!.copyWith(fontSize: 72, color: c.dangerText, fontWeight: FontWeight.w700),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: Space.lg),
                      Text(s.t('sos.countdown', {'seconds': localizeDigits('$_lastSecond', digits)}), style: t.titleMedium, textAlign: TextAlign.center),
                    ]),
                  _Phase.sending => Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      SizedBox.square(dimension: 64, child: CircularProgressIndicator(color: c.danger, strokeWidth: 5)),
                      const SizedBox(height: Space.lg),
                      Semantics(liveRegion: true, child: Text(s.t('sos.sending'), style: t.titleMedium)),
                    ]),
                  _Phase.failed => Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      AppIcon(AppIcons.wifiOff, size: 48, color: c.dangerText),
                      const SizedBox(height: Space.md),
                      Semantics(liveRegion: true, child: Text(s.t('sos.err_send'), style: t.titleMedium, textAlign: TextAlign.center)),
                      const SizedBox(height: Space.md),
                      AppButton(label: s.t('common.retry'), kind: ButtonKind.danger, large: true, onPressed: _send),
                    ]),
                  _Phase.resolved => Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      AppIcon(AppIcons.checkCircle, size: 56, color: c.successText),
                      const SizedBox(height: Space.md),
                      Semantics(liveRegion: true, child: Text(s.t('sos.resolved'), style: t.titleMedium, textAlign: TextAlign.center)),
                    ]),
                  _Phase.sent => ListView(children: [
                      const SizedBox(height: Space.md),
                      Center(
                        child: Container(
                          width: 88,
                          height: 88,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: c.danger, shape: BoxShape.circle),
                          child: const AppIcon(AppIcons.sos, size: 44, color: Colors.white),
                        ),
                      ),
                      const SizedBox(height: Space.md),
                      Semantics(liveRegion: true, child: Text(s.t('sos.sent_title'), style: t.headlineSmall, textAlign: TextAlign.center)),
                      const SizedBox(height: Space.xs),
                      Text(s.t('sos.sent_body'), style: t.bodyMedium!.copyWith(color: c.muted), textAlign: TextAlign.center),
                      const SizedBox(height: Space.lg),
                      for (final d in _sos?.deliveries ?? const <SosDelivery>[]) _DeliveryRow(d: d, strings: s),
                    ]),
                },
              ),
              if (_phase == _Phase.countdown)
                AppButton(key: const Key('sos_cancel'), label: s.t('sos.cancel'), kind: ButtonKind.secondary, large: true, onPressed: _cancel),
              if (_phase == _Phase.sent || _phase == _Phase.failed || _phase == _Phase.resolved) ...[
                if (number != null)
                  AppButton(
                    key: const Key('sos_call'),
                    label: s.t('sos.call_emergency', {'number': number}),
                    kind: ButtonKind.danger,
                    large: true,
                    leading: const AppIcon(AppIcons.phone, color: Colors.white),
                    onPressed: () => launchUrl(Uri(scheme: 'tel', path: number)),
                  ),
                const SizedBox(height: Space.xs),
                if (_phase == _Phase.sent)
                  AppButton(key: const Key('sos_safe'), label: s.t('sos.im_safe'), kind: ButtonKind.secondary, onPressed: _resolve)
                else
                  AppButton(key: const Key('sos_done'), label: s.t('common.done'), kind: ButtonKind.secondary, onPressed: () => context.go(locationFor('child_home'))),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

class _DeliveryRow extends StatelessWidget {
  const _DeliveryRow({required this.d, required this.strings});
  final SosDelivery d;
  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final s = strings;
    final good = d.status == 'seen' || d.status == 'responded' || d.status == 'delivered';
    final bad = d.status == 'failed';
    final color = bad ? c.dangerText : (good ? c.successText : c.muted);
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.xs),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: Space.xs),
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Radii.card), border: Border.all(color: c.border)),
        child: Row(children: [
          AppIcon(d.channel == 'email' ? AppIcons.mail : AppIcons.bell, size: 20, color: c.muted),
          const SizedBox(width: Space.xs),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(d.name, style: t.bodyLarge, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(s.t(d.channel == 'email' ? 'sos.via_email' : 'sos.via_app'), style: t.bodySmall),
            ]),
          ),
          AppIcon(bad ? AppIcons.alertCircle : (good ? AppIcons.checkCircle : AppIcons.clock), size: 18, color: color),
          const SizedBox(width: 4),
          Text(sosStatusLabel(s, d.status), style: t.labelMedium!.copyWith(color: color)),
        ]),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.progress, required this.color, required this.track});
  final double progress;
  final Color color;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final r = size.shortestSide / 2 - 8;
    final center = size.center(Offset.zero);
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, r, p..color = track);
    canvas.drawArc(Rect.fromCircle(center: center, radius: r), -math.pi / 2, 2 * math.pi * (1 - progress), false, p..color = color);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.progress != progress;
}

/// Full-screen SOS alert for parents and guardians, over any screen. Appears on realtime `sos.new`
/// (and for SOS still open when the app starts), reports delivered/seen, and offers "I'm coming".
class SosAlertHost extends ConsumerStatefulWidget {
  const SosAlertHost({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<SosAlertHost> createState() => _SosAlertHostState();
}

class _SosAlertHostState extends ConsumerState<SosAlertHost> {
  final _dismissed = <String>{};
  final _acked = <String>{};
  SosEvent? _sos;
  StreamSubscription<RealtimeEvent>? _sub;
  String? _forUser;

  bool get _adult {
    final s = ref.read(sessionControllerProvider);
    return s is SignedIn && !s.user.isChild;
  }

  void _bind() {
    final s = ref.read(sessionControllerProvider);
    final uid = s is SignedIn ? s.user.id : null;
    if (uid == _forUser) return;
    _forUser = uid;
    _sub?.cancel();
    _sub = null;
    if (uid == null || !_adult) return;
    _sub = ref.read(realtimeProvider).events.listen(_onEvent);
    unawaited(_loadOpen());
  }

  Future<void> _loadOpen() async {
    final fid = ref.read(familyIdProvider);
    if (fid == null) return;
    try {
      final open = await ref.read(safetyRepoProvider).openSos(fid);
      final s = ref.read(sessionControllerProvider);
      final me = s is SignedIn ? s.user.id : '';
      final first = open.where((e) => e.memberId != me && !_dismissed.contains(e.id)).firstOrNull;
      if (first != null && mounted) _show(first);
    } catch (_) {}
  }

  void _onEvent(RealtimeEvent e) {
    if (e.name == 'sos.new') {
      final ev = SosEvent.fromJson(e.data);
      if (!_dismissed.contains(ev.id)) _show(ev);
    } else if (e.name == 'sos.updated' && e.data['id'] == _sos?.id) {
      final ev = SosEvent.fromJson(e.data);
      setState(() => _sos = ev.open ? ev : null);
    }
  }

  void _show(SosEvent ev) {
    HapticFeedback.heavyImpact();
    setState(() => _sos = ev);
    if (_acked.add(ev.id)) {
      unawaited(ref.read(safetyRepoProvider).ackSos(ev.id, 'seen').catchError((_) {}));
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(sessionControllerProvider);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _bind();
    });
    final sos = _sos;
    return Stack(children: [
      widget.child,
      if (sos != null)
        Positioned.fill(
          child: _SosAlert(
            sos: sos,
            onClose: () => setState(() {
              _dismissed.add(sos.id);
              _sos = null;
            }),
          ),
        ),
    ]);
  }
}

class _SosAlert extends ConsumerStatefulWidget {
  const _SosAlert({required this.sos, required this.onClose});
  final SosEvent sos;
  final VoidCallback onClose;
  @override
  ConsumerState<_SosAlert> createState() => _SosAlertState();
}

class _SosAlertState extends ConsumerState<_SosAlert> {
  bool _responded = false;
  bool _busy = false;

  Future<void> _respond() async {
    setState(() => _busy = true);
    try {
      await ref.read(safetyRepoProvider).ackSos(widget.sos.id, 'responded');
      if (mounted) setState(() => _responded = true);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('sos'));
    final language = ref.watch(languageProvider);
    final session = ref.watch(sessionControllerProvider);
    final zone = session is SignedIn ? (session.user.timezone ?? 'UTC') : 'UTC';
    final t = Theme.of(context).textTheme;
    final sos = widget.sos;
    final time = formatLocalTime(sos.startedAt, zone, language: language, use24h: false);
    const white = Colors.white;
    return Material(
      color: const Color(0xFFB91C1C),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.screenHorizontal),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Spacer(),
            Center(
              child: _Pulse(
                child: Container(
                  width: 120,
                  height: 120,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(color: white, shape: BoxShape.circle),
                  child: const AppIcon(AppIcons.sos, size: 60, color: Color(0xFFB91C1C)),
                ),
              ),
            ),
            const SizedBox(height: Space.xl),
            Semantics(
              liveRegion: true,
              header: true,
              child: Text(s.t('sos.alert_title', {'name': sos.memberName}), style: t.headlineSmall!.copyWith(color: white, fontSize: 28), textAlign: TextAlign.center),
            ),
            const SizedBox(height: Space.xs),
            Text(s.t('sos.alert_body', {'name': sos.memberName, 'time': time}), style: t.bodyLarge!.copyWith(color: white), textAlign: TextAlign.center),
            if (sos.mapUrl == null)
              Padding(
                padding: const EdgeInsets.only(top: Space.xs),
                child: Text(s.t('sos.no_location'), style: t.bodyMedium!.copyWith(color: const Color(0xE6FFFFFF)), textAlign: TextAlign.center),
              ),
            const Spacer(),
            if (sos.mapUrl != null)
              _AlertButton(
                key: const Key('sos_alert_map'),
                label: s.t('sos.alert_map'),
                icon: AppIcons.map,
                filled: true,
                onTap: () => launchUrl(Uri.parse(sos.mapUrl!), mode: LaunchMode.externalNonBrowserApplication).catchError((_) => false),
              ),
            const SizedBox(height: Space.sm),
            if (_responded)
              Semantics(liveRegion: true, child: Text(s.t('sos.alert_responded'), style: t.titleMedium!.copyWith(color: white), textAlign: TextAlign.center))
            else
              _AlertButton(key: const Key('sos_alert_respond'), label: s.t('sos.alert_respond'), icon: AppIcons.walk, onTap: _busy ? null : _respond),
            const SizedBox(height: Space.sm),
            TextButton(
              key: const Key('sos_alert_close'),
              onPressed: widget.onClose,
              child: Text(s.t('sos.alert_close'), style: t.labelLarge!.copyWith(color: white)),
            ),
          ]),
        ),
      ),
    );
  }
}

class _AlertButton extends StatelessWidget {
  const _AlertButton({super.key, required this.label, required this.icon, required this.onTap, this.filled = false});
  final String label;
  final String icon;
  final VoidCallback? onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    const red = Color(0xFFB91C1C);
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: filled ? Colors.white : Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(Radii.buttonLarge),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(Radii.buttonLarge),
          child: Container(
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.sm),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              AppIcon(icon, color: filled ? red : Colors.white),
              const SizedBox(width: Space.xs),
              Flexible(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.labelLarge!.copyWith(color: filled ? red : Colors.white, fontSize: 17),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Soft pulsing scale (time-based; static when reduce motion is on).
class _Pulse extends StatefulWidget {
  const _Pulse({required this.child});
  final Widget child;
  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (Motion.reduced(context)) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
        child: ScaleTransition(scale: Tween(begin: 0.94, end: 1.06).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)), child: widget.child),
      );
}
