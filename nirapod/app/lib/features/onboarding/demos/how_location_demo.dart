import 'dart:typed_data';
import 'dart:ui' show PointMode;

import 'package:flutter/material.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../widgets/demo_stage.dart';
import 'route_painter.dart';

/// Page 2 story (no dialog): the child avatar leaves Home, follows a curved route, enters the
/// "School" circle (which pulses), the parent's phone shows "Rafi reached School", and the child's
/// phone keeps its green "Location sharing is on" notice the whole time. 8 s loop.
class HowLocationDemo extends StatelessWidget {
  const HowLocationDemo({super.key, required this.strings});
  final Strings strings;

  static const period = Duration(milliseconds: 8000);

  // Story beats (fractions of the loop).
  static const walkStart = 0.06, walkEnd = 0.52, arrive = 0.52;

  // Scene geometry (fractions of the stage).
  static const home = Offset(0.16, 0.72);
  static const school = Offset(0.74, 0.34);

  @override
  Widget build(BuildContext context) => DemoStage(
        period: period,
        staticFrame: 0.75,
        semanticLabel: strings.t('perm.demo_a11y_how'),
        builder: (context, t) => _Scene(strings: strings, t: t),
      );
}

class _Scene extends StatelessWidget {
  const _Scene({required this.strings, required this.t});
  final Strings strings;
  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = strings;
    return LayoutBuilder(builder: (context, box) {
      final w = box.maxWidth, h = box.maxHeight;
      final label = demoText(context, size: 11, weight: FontWeight.w600, color: c.text);
      return Stack(children: [
        Positioned.fill(child: RepaintBoundary(child: CustomPaint(painter: _MapPainter(c)))),
        Positioned.fill(child: CustomPaint(painter: _StoryPainter(t, c))),
        // Place labels.
        Positioned(
          left: w * HowLocationDemo.home.dx - 40,
          width: 80,
          top: h * HowLocationDemo.home.dy + 18,
          child: Text(s.t('perm.how_home'), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: label),
        ),
        Positioned(
          left: w * HowLocationDemo.school.dx - 50,
          width: 100,
          top: h * HowLocationDemo.school.dy + 22,
          child: Text(s.t('perm.how_school'), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: label),
        ),
        // Parent phone: the arrival alert appears when the avatar enters the circle.
        Positioned(
          top: 10,
          left: 10,
          width: (w * 0.5).clamp(130.0, 190.0),
          child: _MiniPhone(
            icon: AppIcons.users,
            child: FadeTransition(
              opacity: appearThenHide(t, HowLocationDemo.arrive, HowLocationDemo.arrive + 0.06, fadeOutAt: 0.94),
              child: SlideTransition(
                position: appearThenHide(t, HowLocationDemo.arrive, HowLocationDemo.arrive + 0.06, fadeOutAt: 0.94)
                    .drive(Tween(begin: const Offset(0, -0.4), end: Offset.zero)),
                child: _Notice(
                  icon: AppIcons.locationPinFilled,
                  iconColor: c.primaryText,
                  text: s.t('perm.demo_arrived'),
                ),
              ),
            ),
          ),
        ),
        // Child phone: the sharing notice is always visible (never covert).
        Positioned(
          bottom: 10,
          right: 10,
          width: (w * 0.5).clamp(130.0, 190.0),
          child: _MiniPhone(
            icon: AppIcons.user,
            child: _Notice(icon: AppIcons.checkCircle, iconColor: BrandColors.success, text: s.t('perm.how_sharing_on'), live: t),
          ),
        ),
      ]);
    });
  }
}

class _MiniPhone extends StatelessWidget {
  const _MiniPhone({required this.icon, required this.child});
  final String icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(6, 6, 6, 6),
      decoration: BoxDecoration(
        color: const Color(0xFF1B2B27),
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [BoxShadow(color: Color(0x1F000000), blurRadius: 6, offset: Offset(0, 2))],
      ),
      child: Container(
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [LightColors.text, LightColors.primaryFillPressed], begin: Alignment.topCenter, end: Alignment.bottomCenter),
          borderRadius: BorderRadius.circular(9),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          AppIcon(icon, size: 12, color: const Color(0xCCFFFFFF)),
          const SizedBox(height: 4),
          SizedBox(height: 30, child: child),
        ]),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.iconColor, required this.text, this.live});
  final String icon;
  final Color iconColor;
  final String text;
  final Animation<double>? live;

  @override
  Widget build(BuildContext context) {
    Widget dot = AppIcon(icon, size: 14, color: iconColor);
    if (live != null) {
      // Gentle "still on" pulse, 4 beats per loop.
      dot = FadeTransition(
        opacity: live!.drive(TweenSequence([
          for (var i = 0; i < 4; i++) ...[
            TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.55), weight: 1),
            TweenSequenceItem(tween: Tween(begin: 0.55, end: 1.0), weight: 1),
          ],
        ])),
        child: dot,
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(color: const Color(0xF2FFFFFF), borderRadius: BorderRadius.circular(8)),
      child: Row(children: [
        dot,
        const SizedBox(width: 5),
        Expanded(
          child: Text(text, maxLines: 2, overflow: TextOverflow.ellipsis, style: demoText(context, size: 9.5, weight: FontWeight.w600, color: LightColors.text)),
        ),
      ]),
    );
  }
}

/// Static background: soft blocks, roads, the dashed route, Home and School. Painted once.
class _MapPainter extends CustomPainter {
  _MapPainter(this.c);
  final AppColors c;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    canvas.drawRect(Offset.zero & size, Paint()..color = c.primary.withValues(alpha: 0.05));
    final block = Paint()..color = c.border.withValues(alpha: 0.7);
    for (final r in [
      Rect.fromLTWH(w * 0.30, h * 0.06, w * 0.16, h * 0.18),
      Rect.fromLTWH(w * 0.52, h * 0.62, w * 0.14, h * 0.16),
      Rect.fromLTWH(w * 0.06, h * 0.30, w * 0.12, h * 0.2),
      Rect.fromLTWH(w * 0.86, h * 0.60, w * 0.1, h * 0.14),
    ]) {
      canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), block);
    }
    final park = Paint()..color = c.primary.withValues(alpha: 0.12);
    canvas.drawOval(Rect.fromLTWH(w * 0.36, h * 0.42, w * 0.14, h * 0.14), park);
    final road = Paint()
      ..color = c.surface
      ..style = PaintingStyle.stroke
      ..strokeWidth = 9
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(0, h * 0.56), Offset(w, h * 0.5), road);
    canvas.drawLine(Offset(w * 0.56, 0), Offset(w * 0.5, h), road);
    final dashed = Path();
    dashInto(dashed, _StoryPainter.routeFor(size).metric);
    canvas.drawPath(
      dashed,
      Paint()
        ..color = c.muted.withValues(alpha: 0.6)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round,
    );
    final home = Offset(w * HowLocationDemo.home.dx, h * HowLocationDemo.home.dy);
    final school = Offset(w * HowLocationDemo.school.dx, h * HowLocationDemo.school.dy);
    drawHouse(canvas, home, 22, Paint()..color = c.primary, Paint()..color = c.primaryFillPressed, Paint()..color = c.surface);
    drawSchool(canvas, school, 20, Paint()..color = c.accent, Paint()..color = c.primaryFillPressed, Paint()..color = c.surface);
  }

  @override
  bool shouldRepaint(_MapPainter old) => old.c != c;
}

/// Animated layer: walked part of the route, the geofence circle and the moving avatar.
class _StoryPainter extends CustomPainter {
  _StoryPainter(this.t, this.c) : super(repaint: t) {
    _walked.color = c.primary;
    _fence.color = c.accent.withValues(alpha: 0.14);
    _fenceStroke.color = c.accent;
    _avatar.color = c.primaryFill;
  }

  final Animation<double> t;
  final AppColors c;

  final Paint _walked = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 3.5
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;
  final Paint _fence = Paint();
  final Paint _fenceStroke = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.6;
  final Paint _pulse = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2;
  final Paint _avatar = Paint();
  final Paint _ring = Paint()..color = const Color(0xFFFFFFFF);
  final Paint _glyph = Paint()..color = const Color(0xFFFFFFFF);

  static Size? _routeSize;
  static SampledRoute? _route;
  static Float32List? _points;

  static SampledRoute routeFor(Size size) {
    if (_routeSize != size || _route == null) {
      final w = size.width, h = size.height;
      final a = Offset(w * HowLocationDemo.home.dx, h * HowLocationDemo.home.dy);
      final b = Offset(w * HowLocationDemo.school.dx, h * HowLocationDemo.school.dy);
      final path = Path()
        ..moveTo(a.dx, a.dy)
        ..cubicTo(w * 0.42, h * 0.98, w * 0.30, h * 0.22, b.dx, b.dy);
      _route = SampledRoute(path);
      _routeSize = size;
      final pts = Float32List(97 * 2);
      for (var i = 0; i < 97; i++) {
        final p = _route!.at(i / 96);
        pts[i * 2] = p.dx;
        pts[i * 2 + 1] = p.dy;
      }
      _points = pts;
    }
    return _route!;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final route = routeFor(size);
    final v = t.value;
    final walk = ((v - HowLocationDemo.walkStart) / (HowLocationDemo.walkEnd - HowLocationDemo.walkStart)).clamp(0.0, 1.0);
    final f = Curves.easeInOut.transform(walk);
    final school = Offset(size.width * HowLocationDemo.school.dx, size.height * HowLocationDemo.school.dy);
    final fenceR = size.shortestSide * 0.16;

    // Geofence circle; pulses once when the child arrives.
    canvas.drawCircle(school, fenceR, _fence);
    canvas.drawCircle(school, fenceR, _fenceStroke);
    final p = ((v - HowLocationDemo.arrive) / 0.14);
    if (p > 0 && p < 1) {
      _pulse.color = c.accent.withValues(alpha: 1 - p);
      canvas.drawCircle(school, fenceR * (1 + 0.45 * p), _pulse);
    }

    // Walked part of the route.
    final n = (f * 96).floor();
    if (n >= 1) canvas.drawRawPoints(PointMode.polygon, Float32List.sublistView(_points!, 0, (n + 1) * 2), _walked);

    // Avatar (fades in at home at the start of the loop, out at the end).
    final fade = v < 0.04 ? v / 0.04 : (v > 0.94 ? (1 - v) / 0.06 : 1.0);
    if (fade <= 0) return;
    _avatar.color = c.primaryFill.withValues(alpha: fade);
    _ring.color = Color.fromRGBO(255, 255, 255, fade);
    _glyph.color = Color.fromRGBO(255, 255, 255, fade);
    final pos = route.at(f);
    // Small walking bob, time-based.
    final bob = walk > 0 && walk < 1 ? (((v * 40) % 1.0) - 0.5).abs() * 2.4 : 0.0;
    drawAvatar(canvas, pos.translate(0, -12 - bob), 9, _avatar, _ring, _glyph);
  }

  @override
  bool shouldRepaint(_StoryPainter old) => old.c != c || old.t != t;
}
