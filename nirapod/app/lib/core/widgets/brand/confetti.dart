import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../../motion/motion.dart';
import '../../theme/tokens.g.dart';

/// Light confetti burst for "You're all set": 1.5 s ([Motion.confetti]), time-based, a few
/// precomputed particles in emerald / teal / amber with gravity, spin and a fade-out.
/// Decorative only (ignores pointers, excluded from semantics). Reduce motion: draws nothing.
class ConfettiBurst extends StatefulWidget {
  const ConfettiBurst({super.key, this.play = true});
  final bool play;

  @override
  State<ConfettiBurst> createState() => _ConfettiBurstState();
}

class _ConfettiBurstState extends State<ConfettiBurst> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Motion.confetti);
  late final _ConfettiPainter _painter = _ConfettiPainter(_c);
  bool _reduced = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduced = Motion.reduced(context);
    if (_reduced) {
      _c.stop();
    } else if (widget.play && _c.value == 0 && !_c.isAnimating) {
      _c.forward();
    }
  }

  @override
  void didUpdateWidget(ConfettiBurst old) {
    super.didUpdateWidget(old);
    if (widget.play && !old.play && !_reduced) _c.forward(from: 0);
    if (!widget.play && old.play) _c.reset();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_reduced || !widget.play) return const SizedBox.expand();
    return IgnorePointer(
      child: ExcludeSemantics(
        child: RepaintBoundary(child: SizedBox.expand(child: CustomPaint(painter: _painter))),
      ),
    );
  }
}

class _Particle {
  _Particle(this.x, this.vx, this.vy, this.spin, this.angle, this.color, this.shape, this.delay);
  final double x, vx, vy, spin, angle, delay; // x / velocities in fractions of the box per second
  final Color color;
  final RRect shape; // centred on the origin, so painting allocates nothing
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.t) : super(repaint: t);
  final Animation<double> t;

  static const _gravity = 1.9; // box heights / s^2
  static const _seconds = MotionMs.confettiMs / 1000;
  static const _palette = [BrandColors.primary, BrandColors.accent, Color(0xFFF59E0B), Color(0xFF34D399)];

  /// 26 particles, deterministic (seeded) so every run and every test looks the same.
  static final List<_Particle> _particles = () {
    final r = math.Random(7);
    return List<_Particle>.generate(26, (i) {
      final angle = -math.pi / 2 + (r.nextDouble() - 0.5) * 1.9; // upward fan
      final speed = 0.75 + r.nextDouble() * 0.55;
      final w = 8 + r.nextDouble() * 5, h = i.isEven ? w : 4.5 + r.nextDouble() * 2;
      return _Particle(
        0.5 + (r.nextDouble() - 0.5) * 0.16,
        math.cos(angle) * speed * 0.55,
        math.sin(angle) * speed,
        (r.nextDouble() - 0.5) * 9,
        r.nextDouble() * math.pi,
        _palette[i % _palette.length],
        RRect.fromRectAndRadius(Rect.fromCenter(center: Offset.zero, width: w, height: h), Radius.circular(i % 3 == 0 ? w / 2 : 1.5)),
        r.nextDouble() * 0.12,
      );
    }, growable: false);
  }();

  final Paint _paint = Paint();

  @override
  void paint(Canvas canvas, Size size) {
    final v = t.value;
    if (v <= 0 || v >= 1) return;
    for (final p in _particles) {
      final lt = (v - p.delay) / (1 - p.delay);
      if (lt <= 0) continue;
      final s = lt * _seconds;
      final x = (p.x + p.vx * s) * size.width;
      final y = (0.42 + p.vy * s + 0.5 * _gravity * s * s) * size.height;
      final fade = lt < 0.6 ? 1.0 : (1 - (lt - 0.6) / 0.4);
      _paint.color = p.color.withValues(alpha: fade.clamp(0.0, 1.0));
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(p.angle + p.spin * s);
      canvas.drawRRect(p.shape, _paint);
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => old.t != t;
}
