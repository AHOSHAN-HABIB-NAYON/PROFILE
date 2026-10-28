import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

import '../../motion/motion.dart';
import '../../theme/tokens.g.dart';
import 'logo_painters.dart';
import 'logo_paths.g.dart';

/// Welcome logo: the map-pin badge with the family, drawn on in 900 ms ([Motion.logoDraw]).
///
/// Timeline: the pin outline draws from its tip (0-50 %), the three figures follow, staggered
/// (30-80 %), then the emerald fill and the white family fade in (62-100 %) while the strokes fade
/// out. The last frame is exactly `logo-mark.svg`. Time-based (AnimationController), painted from
/// path data generated from the SVG ([LogoPaths]), behind a RepaintBoundary, with no per-frame
/// allocations besides the extracted stroke segments. Reduce motion or [animate] = false: the final
/// frame is shown immediately and no ticker runs.
class AnimatedLogo extends StatefulWidget {
  const AnimatedLogo({super.key, this.size = 120, this.animate = true, this.semanticLabel});
  final double size;
  final bool animate;
  final String? semanticLabel;

  @override
  State<AnimatedLogo> createState() => _AnimatedLogoState();
}

class _AnimatedLogoState extends State<AnimatedLogo> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Motion.logoDraw);
  late final _LogoPainter _painter = _LogoPainter(_c);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(AnimatedLogo old) {
    super.didUpdateWidget(old);
    if (old.animate != widget.animate) _sync();
  }

  void _sync() {
    if (!widget.animate || Motion.reduced(context)) {
      _c.value = 1;
    } else if (_c.value == 0 && !_c.isAnimating) {
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
        label: widget.semanticLabel,
        image: widget.semanticLabel != null,
        excludeSemantics: true,
        child: RepaintBoundary(
          child: SizedBox.square(dimension: widget.size, child: CustomPaint(painter: _painter)),
        ),
      );
}

class _LogoPainter extends CustomPainter {
  _LogoPainter(this.t) : super(repaint: t);
  final Animation<double> t;

  static const _pinStroke = 2.25;
  static const _figureStroke = 1.75;
  static const Interval _pinIv = Interval(0, 0.5, curve: Curves.easeInOutCubic);
  static const List<Interval> _peopleIv = [
    Interval(0.30, 0.68, curve: Curves.easeOutCubic),
    Interval(0.36, 0.74, curve: Curves.easeOutCubic),
    Interval(0.42, 0.80, curve: Curves.easeOutCubic),
  ];
  static const Interval _fillIv = Interval(0.62, 1, curve: Curves.easeOut);

  final Paint _fill = Paint();
  final Paint _white = Paint();
  final Paint _stroke = Paint()
    ..style = PaintingStyle.stroke
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;
  bool _shaderReady = false;

  @override
  void paint(Canvas canvas, Size size) {
    if (!_shaderReady) {
      // logo-mark.svg gradient, in the 48 grid (the canvas is scaled below)
      _fill.shader = ui.Gradient.linear(const Offset(12, 4), const Offset(36, 45), BrandGradient.colors);
      _shaderReady = true;
    }
    final v = t.value;
    final pinT = _pinIv.transform(v);
    final fillT = _fillIv.transform(v);
    final strokeA = 1 - fillT;

    canvas.save();
    canvas.scale(size.shortestSide / LogoPaths.grid);

    if (fillT > 0) {
      _fill.color = Color.fromRGBO(0, 0, 0, fillT);
      canvas.drawPath(LogoPaths.pin, _fill);
    }
    if (strokeA > 0) {
      // Pin outline drawn inside the pin (clip + double width) so its outer edge is the logo edge.
      _stroke.color = BrandColors.primary.withValues(alpha: strokeA);
      _stroke.strokeWidth = _pinStroke * 2;
      canvas.save();
      canvas.clipPath(LogoPaths.pin);
      _drawPartial(canvas, LogoMetrics.pin, pinT);
      canvas.restore();
      _stroke.strokeWidth = _figureStroke;
      for (var i = 0; i < 3; i++) {
        _drawPartial(canvas, LogoMetrics.people[i], _peopleIv[i].transform(v));
      }
    }
    if (fillT > 0) {
      _white.color = Color.fromRGBO(255, 255, 255, fillT);
      canvas.drawPath(LogoPaths.familyFill, _white);
    }
    canvas.restore();
  }

  void _drawPartial(Canvas canvas, List<ui.PathMetric> metrics, double p) {
    if (p <= 0) return;
    final f = p > 1 ? 1.0 : p;
    for (final m in metrics) {
      canvas.drawPath(m.extractPath(0, m.length * f), _stroke);
    }
  }

  @override
  bool shouldRepaint(_LogoPainter old) => old.t != t;
}
