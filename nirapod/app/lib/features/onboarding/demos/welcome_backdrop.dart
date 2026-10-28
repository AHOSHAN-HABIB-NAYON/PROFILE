import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// Soft, original background for Welcome: rolling hills, a sun, a little home and a family of three
/// standing together. Drawn once (static) in muted tints of the theme so text stays AA on top.
class WelcomeBackdrop extends StatelessWidget {
  const WelcomeBackdrop({super.key});

  @override
  Widget build(BuildContext context) =>
      RepaintBoundary(child: CustomPaint(painter: _BackdropPainter(context.colors), size: Size.infinite));
}

class _BackdropPainter extends CustomPainter {
  _BackdropPainter(this.c);
  final AppColors c;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final base = h * 0.80;

    // Sun.
    canvas.drawCircle(Offset(w * 0.82, base - h * 0.20), w * 0.09, Paint()..color = c.warning.withValues(alpha: 0.10));
    // Far hill.
    final far = Path()
      ..moveTo(0, base)
      ..cubicTo(w * 0.25, base - h * 0.16, w * 0.55, base - h * 0.02, w, base - h * 0.12)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(far, Paint()..color = c.accent.withValues(alpha: 0.08));
    // Near hill.
    final near = Path()
      ..moveTo(0, base + h * 0.06)
      ..cubicTo(w * 0.35, base - h * 0.06, w * 0.7, base + h * 0.1, w, base + h * 0.02)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(near, Paint()..color = c.primary.withValues(alpha: 0.10));

    // Little home on the far hill.
    final hx = w * 0.18, hy = base - h * 0.085;
    final s = w * 0.07;
    final home = Paint()..color = c.primary.withValues(alpha: 0.16);
    canvas.drawRect(Rect.fromLTWH(hx - s / 2, hy - s * 0.55, s, s * 0.55), home);
    canvas.drawPath(
      Path()
        ..moveTo(hx - s * 0.68, hy - s * 0.5)
        ..lineTo(hx, hy - s * 1.05)
        ..lineTo(hx + s * 0.68, hy - s * 0.5)
        ..close(),
      home,
    );

    // Trees.
    final tree = Paint()..color = c.primary.withValues(alpha: 0.14);
    for (final x in [0.32, 0.38, 0.92]) {
      final tx = w * x, ty = base - h * (x > 0.9 ? 0.10 : 0.07);
      canvas.drawCircle(Offset(tx, ty - s * 0.5), s * 0.32, tree);
      canvas.drawRect(Rect.fromLTWH(tx - 1.5, ty - s * 0.25, 3, s * 0.3), tree);
    }

    // Family of three (adult, child, adult) holding hands on the near hill.
    final fam = Paint()..color = c.primary.withValues(alpha: 0.22);
    final arms = Paint()
      ..color = c.primary.withValues(alpha: 0.22)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    final fy = base + h * 0.035;
    final unit = w * 0.05;
    final people = [(w * 0.60, 1.0), (w * 0.60 + unit * 1.3, 0.7), (w * 0.60 + unit * 2.6, 0.95)];
    for (final (x, scale) in people) {
      final ph = unit * 2.2 * scale;
      canvas.drawCircle(Offset(x, fy - ph - unit * 0.35 * scale), unit * 0.35 * scale, fam);
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(x - unit * 0.38 * scale, fy - ph, unit * 0.76 * scale, ph), Radius.circular(unit * 0.35 * scale)),
        fam,
      );
    }
    for (var i = 0; i < people.length - 1; i++) {
      final (x1, s1) = people[i];
      final (x2, s2) = people[i + 1];
      canvas.drawLine(Offset(x1 + unit * 0.38 * s1, fy - unit * 1.1 * s1), Offset(x2 - unit * 0.38 * s2, fy - unit * 1.1 * s2), arms);
    }
  }

  @override
  bool shouldRepaint(_BackdropPainter old) => old.c != c;
}
