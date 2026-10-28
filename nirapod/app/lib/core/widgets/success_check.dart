import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';

import '../motion/motion.dart';
import '../theme/app_theme.dart';

/// Circle + check mark drawn as a stroke in 420 ms (reduce motion: shown immediately).
class SuccessCheck extends StatefulWidget {
  const SuccessCheck({super.key, this.size = 88, this.semanticLabel});
  final double size;
  final String? semanticLabel;

  @override
  State<SuccessCheck> createState() => _SuccessCheckState();
}

class _SuccessCheckState extends State<SuccessCheck> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Motion.successCheck);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (Motion.reduced(context)) {
      _c.value = 1;
    } else if (_c.value == 0) {
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      label: widget.semanticLabel,
      image: widget.semanticLabel != null,
      child: RepaintBoundary(
        child: SizedBox.square(
          dimension: widget.size,
          child: AnimatedBuilder(
            animation: CurvedAnimation(parent: _c, curve: Curves.easeOutCubic),
            builder: (context, _) =>
                CustomPaint(painter: _CheckPainter(Curves.easeOutCubic.transform(_c.value), c.primary)),
          ),
        ),
      ),
    );
  }
}

class _CheckPainter extends CustomPainter {
  _CheckPainter(this.t, this.color);
  final double t;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * 0.07
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawCircle(Offset(s / 2, s / 2), s / 2 - paint.strokeWidth, Paint()..color = color.withValues(alpha: 0.12));
    final circle = Path()..addOval(Rect.fromCircle(center: Offset(s / 2, s / 2), radius: s / 2 - paint.strokeWidth));
    final check = Path()
      ..moveTo(s * 0.3, s * 0.52)
      ..lineTo(s * 0.44, s * 0.66)
      ..lineTo(s * 0.71, s * 0.38);
    _drawPartial(canvas, circle, (t / 0.6).clamp(0, 1), paint);
    _drawPartial(canvas, check, ((t - 0.45) / 0.55).clamp(0, 1), paint);
  }

  void _drawPartial(Canvas canvas, Path path, double f, Paint paint) {
    if (f <= 0) return;
    for (final PathMetric m in path.computeMetrics()) {
      canvas.drawPath(m.extractPath(0, m.length * f), paint);
    }
  }

  @override
  bool shouldRepaint(_CheckPainter old) => old.t != t || old.color != color;
}
