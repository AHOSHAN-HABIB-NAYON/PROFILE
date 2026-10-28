import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' show PointMode;

import 'package:flutter/material.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/theme/app_theme.dart';
import '../widgets/demo_stage.dart';
import 'phone.dart';
import 'route_painter.dart';

/// Child page A demo: the phone screen turns off while, on the map beside it, the avatar keeps
/// moving and sending location pings. 6 s loop.
class BackgroundDemo extends StatelessWidget {
  const BackgroundDemo({super.key, required this.strings});
  final Strings strings;

  static const period = Duration(milliseconds: 6000);

  @override
  Widget build(BuildContext context) => DemoStage(
        period: period,
        staticFrame: 0.6,
        semanticLabel: strings.t('childperm.bg_demo_a11y'),
        builder: (context, t) => _BackgroundScene(strings: strings, t: t),
      );
}

class _BackgroundScene extends StatelessWidget {
  const _BackgroundScene({required this.strings, required this.t});
  final Strings strings;
  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final off = t.drive(TweenSequence<double>([
      TweenSequenceItem(tween: ConstantTween(0), weight: 15),
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0).chain(CurveTween(curve: Curves.easeInOut)), weight: 12),
      TweenSequenceItem(tween: ConstantTween(1), weight: 63),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0), weight: 10),
    ]));
    return LayoutBuilder(builder: (context, box) {
      final phoneW = math.min(box.maxWidth * 0.36, 140.0);
      return Stack(children: [
        Positioned.fill(child: ColoredBox(color: c.primary.withValues(alpha: 0.06))),
        // Map on the right.
        Positioned(
          left: phoneW + 28,
          right: 12,
          top: 12,
          bottom: 12,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(children: [
              Positioned.fill(child: CustomPaint(painter: _WalkPainter(t, c))),
              Positioned(
                left: 6,
                right: 6,
                bottom: 6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(999), border: Border.all(color: c.border)),
                  child: Row(children: [
                    AppIcon(AppIcons.checkCircle, size: 14, color: c.successText),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(strings.t('perm.how_sharing_on'), maxLines: 1, overflow: TextOverflow.ellipsis, style: demoText(context, size: 10, weight: FontWeight.w600)),
                    ),
                  ]),
                ),
              ),
            ]),
          ),
        ),
        // Phone on the left; its screen goes dark.
        Positioned(
          left: 16,
          top: 12,
          width: phoneW,
          height: box.maxHeight * 1.1,
          child: Stack(children: [
            Positioned.fill(child: CustomPaint(painter: PhoneFramePainter(screenOff: off))),
            Positioned(
              top: box.maxHeight * 0.3,
              left: 0,
              right: 0,
              child: FadeTransition(
                opacity: off,
                child: Column(children: [
                  const AppIcon(AppIcons.lock, size: 22, color: Color(0xB3FFFFFF)),
                  const SizedBox(height: 6),
                  Text(strings.t('childperm.bg_screen_off'), textAlign: TextAlign.center, style: demoText(context, size: 10.5, color: const Color(0xB3FFFFFF))),
                ]),
              ),
            ),
          ]),
        ),
      ]);
    });
  }
}

/// Avatar walking a loop route on a mini map, with a location "ping" ripple every 1.5 s.
class _WalkPainter extends CustomPainter {
  _WalkPainter(this.t, this.c) : super(repaint: t) {
    _bg.color = c.background;
    _road.color = c.surface;
    _routePaint.color = c.primary.withValues(alpha: 0.35);
    _avatar.color = c.primaryFill;
  }
  final Animation<double> t;
  final AppColors c;

  final Paint _bg = Paint();
  final Paint _road = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 7;
  final Paint _routePaint = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 3
    ..strokeCap = StrokeCap.round;
  final Paint _ping = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2;
  final Paint _avatar = Paint();
  final Paint _white = Paint()..color = const Color(0xFFFFFFFF);

  Size? _size;
  late Path _routePath;
  late SampledRoute _route;
  late Float32List _grid;

  void _layout(Size size) {
    if (_size == size) return;
    _size = size;
    final w = size.width, h = size.height;
    _routePath = Path()
      ..moveTo(w * 0.15, h * 0.7)
      ..cubicTo(w * 0.1, h * 0.15, w * 0.6, h * 0.05, w * 0.85, h * 0.35)
      ..cubicTo(w * 1.0, h * 0.55, w * 0.6, h * 0.75, w * 0.15, h * 0.7);
    _route = SampledRoute(_routePath);
    _grid = Float32List.fromList([
      0, h * 0.33, w, h * 0.33, //
      0, h * 0.66, w, h * 0.66,
      w * 0.33, 0, w * 0.33, h,
      w * 0.66, 0, w * 0.66, h,
    ]);
  }

  @override
  void paint(Canvas canvas, Size size) {
    _layout(size);
    final v = t.value;
    canvas.drawRect(Offset.zero & size, _bg);
    canvas.drawRawPoints(PointMode.lines, _grid, _road);
    canvas.drawPath(_routePath, _routePaint);
    final pos = _route.at(v);
    for (var i = 0; i < 2; i++) {
      final f = ((v * 4) + i * 0.5) % 1.0;
      _ping.color = c.primary.withValues(alpha: 0.5 * (1 - f));
      canvas.drawCircle(pos, 10 + 22 * f, _ping);
    }
    drawAvatar(canvas, pos, 9, _avatar, _white, _white);
  }

  @override
  bool shouldRepaint(_WalkPainter old) => old.c != c || old.t != t;
}

/// Child page B demo: battery saver flips from "Restricted" to "No restrictions" while sharing
/// keeps pulsing. 5 s loop.
class BatteryDemo extends StatelessWidget {
  const BatteryDemo({super.key, required this.strings});
  final Strings strings;

  static const period = Duration(milliseconds: 5000);

  @override
  Widget build(BuildContext context) => DemoStage(
        period: period,
        staticFrame: 0.7,
        maxHeight: 220,
        semanticLabel: strings.t('childperm.battery_demo_a11y'),
        builder: (context, t) => _BatteryScene(strings: strings, t: t),
      );
}

class _BatteryScene extends StatelessWidget {
  const _BatteryScene({required this.strings, required this.t});
  final Strings strings;
  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final on = t.drive(TweenSequence<double>([
      TweenSequenceItem(tween: ConstantTween(0), weight: 30),
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0).chain(CurveTween(curve: Curves.easeInOutCubic)), weight: 10),
      TweenSequenceItem(tween: ConstantTween(1), weight: 50),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0), weight: 10),
    ]));
    final label = demoText(context, size: 12, weight: FontWeight.w600);
    return Stack(children: [
      Positioned.fill(child: ColoredBox(color: c.primary.withValues(alpha: 0.06))),
      Center(
        child: Container(
          width: 250,
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: c.border)),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              SizedBox.square(dimension: 44, child: CustomPaint(painter: _BatteryPainter(t, on, c))),
              const SizedBox(width: 10),
              Expanded(
                child: Stack(children: [
                  FadeTransition(
                    opacity: ReverseAnimation(on),
                    child: Text(strings.t('childperm.battery_restricted'), maxLines: 1, overflow: TextOverflow.ellipsis, style: label.copyWith(color: c.warningText)),
                  ),
                  FadeTransition(
                    opacity: on,
                    child: Text(strings.t('childperm.battery_unrestricted'), maxLines: 1, overflow: TextOverflow.ellipsis, style: label.copyWith(color: c.successText)),
                  ),
                ]),
              ),
              _Switch(on: on),
            ]),
          ]),
        ),
      ),
    ]);
  }
}

class _Switch extends StatelessWidget {
  const _Switch({required this.on});
  final Animation<double> on;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SizedBox(
      width: 40,
      height: 24,
      child: CustomPaint(painter: _SwitchPainter(on, c)),
    );
  }
}

class _SwitchPainter extends CustomPainter {
  _SwitchPainter(this.on, this.c) : super(repaint: on);
  final Animation<double> on;
  final AppColors c;
  final Paint _track = Paint();
  final Paint _knob = Paint()..color = const Color(0xFFFFFFFF);

  @override
  void paint(Canvas canvas, Size size) {
    final v = on.value;
    _track.color = Color.lerp(c.border, c.primaryFill, v)!;
    final r = size.height / 2;
    canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(r)), _track);
    canvas.drawCircle(Offset(r + (size.width - 2 * r) * v, r), r - 3, _knob);
  }

  @override
  bool shouldRepaint(_SwitchPainter old) => old.c != c || old.on != on;
}

/// Battery outline with a level that drains slowly while restricted and holds once unrestricted,
/// plus a sharing pulse dot.
class _BatteryPainter extends CustomPainter {
  _BatteryPainter(this.t, this.on, this.c) : super(repaint: t);
  final Animation<double> t;
  final Animation<double> on;
  final AppColors c;
  final Paint _outline = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.2;
  final Paint _fill = Paint();
  final Paint _pulse = Paint();

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    _outline.color = c.text;
    final body = Rect.fromLTWH(w * 0.08, h * 0.28, w * 0.74, h * 0.44);
    canvas.drawRRect(RRect.fromRectAndRadius(body, const Radius.circular(4)), _outline);
    canvas.drawRect(Rect.fromLTWH(w * 0.84, h * 0.4, w * 0.08, h * 0.2), _outline);
    final o = on.value;
    _fill.color = Color.lerp(c.warning, c.success, o)!;
    canvas.drawRect(Rect.fromLTWH(body.left + 3, body.top + 3, (body.width - 6) * 0.72, body.height - 6), _fill);
    final f = (t.value * 3) % 1.0;
    _pulse.color = c.primary.withValues(alpha: o * (1 - f) * 0.5);
    canvas.drawCircle(Offset(w * 0.45, h * 0.5), 4 + 14 * f, _pulse);
  }

  @override
  bool shouldRepaint(_BatteryPainter old) => old.c != c || old.t != t;
}
