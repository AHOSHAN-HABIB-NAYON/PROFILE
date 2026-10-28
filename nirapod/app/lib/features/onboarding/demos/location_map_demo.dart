import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/theme/app_theme.dart';
import '../widgets/demo_stage.dart';
import '../widgets/permission_page.dart';
import 'route_painter.dart';

/// Page 3 demo: a stylised map with the user's pulsing blue dot, two family avatars and a
/// marching dashed line with a distance label. 4 s loop.
class LocationMapDemo extends StatelessWidget {
  const LocationMapDemo({super.key, required this.strings});
  final Strings strings;

  static const period = Duration(milliseconds: 4000);
  static const you = Offset(0.42, 0.56);
  static const mom = Offset(0.80, 0.24);
  static const rafi = Offset(0.16, 0.24);

  /// Map "my location" blue (decorative; matches the platform's own location dot).
  static const userDot = Color(0xFF2563EB);

  @override
  Widget build(BuildContext context) => DemoStage(
        period: period,
        staticFrame: 0.3,
        semanticLabel: strings.t('perm.demo_a11y_location'),
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
      final mid = Offset(
        w * (LocationMapDemo.you.dx + LocationMapDemo.mom.dx) / 2,
        h * (LocationMapDemo.you.dy + LocationMapDemo.mom.dy) / 2,
      );
      final distance = s.t('perm.loc_distance', {'distance': '${localDigits(s, '1.2')} km'});
      return Stack(children: [
        Positioned.fill(child: RepaintBoundary(child: CustomPaint(painter: _MapPainter(c)))),
        Positioned.fill(child: CustomPaint(painter: _LivePainter(t, c))),
        Positioned(
          left: mid.dx - 60,
          top: mid.dy - 14,
          width: 120,
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: c.border),
                boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 4, offset: Offset(0, 1))],
              ),
              child: Text(distance, maxLines: 1, overflow: TextOverflow.ellipsis, style: demoText(context, size: 10.5, weight: FontWeight.w600)),
            ),
          ),
        ),
        Positioned(
          left: w * LocationMapDemo.you.dx - 40,
          width: 80,
          top: h * LocationMapDemo.you.dy + 14,
          child: Text(s.t('perm.loc_you'), textAlign: TextAlign.center, maxLines: 1, style: demoText(context, size: 11, weight: FontWeight.w700)),
        ),
      ]);
    });
  }
}

class _MapPainter extends CustomPainter {
  _MapPainter(this.c);
  final AppColors c;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    canvas.drawRect(Offset.zero & size, Paint()..color = c.background);
    final block = Paint()..color = c.border.withValues(alpha: 0.8);
    final rnd = math.Random(7);
    for (var gx = 0; gx < 6; gx++) {
      for (var gy = 0; gy < 4; gy++) {
        final r = Rect.fromLTWH(w * (gx / 6) + 6, h * (gy / 4) + 6, w / 6 - 12 - rnd.nextDouble() * 8, h / 4 - 12 - rnd.nextDouble() * 6);
        canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(5)), block);
      }
    }
    canvas.drawOval(Rect.fromLTWH(w * 0.55, h * 0.58, w * 0.3, h * 0.3), Paint()..color = c.primary.withValues(alpha: 0.16));
    final river = Path()
      ..moveTo(0, h * 0.86)
      ..cubicTo(w * 0.3, h * 0.72, w * 0.6, h * 1.0, w, h * 0.82);
    canvas.drawPath(
      river,
      Paint()
        ..color = c.accent.withValues(alpha: 0.28)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 12,
    );
    final road = Paint()
      ..color = c.surface
      ..style = PaintingStyle.stroke
      ..strokeWidth = 7;
    for (var i = 1; i < 6; i++) {
      canvas.drawLine(Offset(w * i / 6, 0), Offset(w * i / 6, h), road);
    }
    for (var i = 1; i < 4; i++) {
      canvas.drawLine(Offset(0, h * i / 4), Offset(w, h * i / 4), road);
    }
  }

  @override
  bool shouldRepaint(_MapPainter old) => old.c != c;
}

class _LivePainter extends CustomPainter {
  _LivePainter(this.t, this.c) : super(repaint: t) {
    _mom.color = c.accent;
    _rafi.color = c.primaryFill;
    _line.color = c.primaryText;
  }
  final Animation<double> t;
  final AppColors c;

  final Paint _halo = Paint();
  final Paint _dot = Paint()..color = LocationMapDemo.userDot;
  final Paint _white = Paint()..color = const Color(0xFFFFFFFF);
  final Paint _mom = Paint();
  final Paint _rafi = Paint();
  final Paint _line = Paint()
    ..strokeWidth = 2
    ..strokeCap = StrokeCap.round;

  @override
  void paint(Canvas canvas, Size size) {
    final v = t.value;
    final w = size.width, h = size.height;
    final you = Offset(w * LocationMapDemo.you.dx, h * LocationMapDemo.you.dy);
    final mom = Offset(w * LocationMapDemo.mom.dx, h * LocationMapDemo.mom.dy);
    final rafi = Offset(w * LocationMapDemo.rafi.dx, h * LocationMapDemo.rafi.dy);

    // Marching dashes from you to Mom (offset moves with time).
    final d = mom - you;
    final len = d.distance;
    final ux = d.dx / len, uy = d.dy / len;
    const dash = 6.0, gap = 5.0;
    var s = -(v * 2 % 1.0) * (dash + gap);
    while (s < len) {
      final a = s.clamp(0.0, len), b = (s + dash).clamp(0.0, len);
      if (b > a) canvas.drawLine(Offset(you.dx + ux * a, you.dy + uy * a), Offset(you.dx + ux * b, you.dy + uy * b), _line);
      s += dash + gap;
    }

    // Pulsing halo, two rings per loop.
    for (var i = 0; i < 2; i++) {
      final f = (v + i * 0.5) % 1.0;
      _halo.color = LocationMapDemo.userDot.withValues(alpha: 0.28 * (1 - f));
      canvas.drawCircle(you, 9 + 26 * f, _halo);
    }
    canvas.drawCircle(you, 10, _white);
    canvas.drawCircle(you, 7, _dot);

    // Family avatars bob gently.
    final bob = math.sin(v * 2 * math.pi) * 2.5;
    drawAvatar(canvas, mom.translate(0, bob), 11, _mom, _white, _white);
    drawAvatar(canvas, rafi.translate(0, -bob), 10, _rafi, _white, _white);
  }

  @override
  bool shouldRepaint(_LivePainter old) => old.c != c || old.t != t;
}
