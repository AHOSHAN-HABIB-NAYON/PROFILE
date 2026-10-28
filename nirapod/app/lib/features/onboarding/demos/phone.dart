import 'package:flutter/material.dart';

import '../../../core/theme/tokens.g.dart';

/// Shared phone-frame painter for the onboarding demos: body, screen, status bar (signal, wifi,
/// battery). [screenOff] (0..1) dims the screen to black for the "screen off" story.
/// All Paint objects are created once; paths are rebuilt only when the size changes.
class PhoneFramePainter extends CustomPainter {
  PhoneFramePainter({
    this.screenOff,
    this.wallTop = LightColors.text,
    this.wallBottom = LightColors.primaryFillPressed,
    this.light = false,
  }) : super(repaint: screenOff);

  final Animation<double>? screenOff;
  final Color wallTop;
  final Color wallBottom;
  final bool light;

  final Paint _body = Paint()..color = const Color(0xFF1B2B27);
  final Paint _wall = Paint();
  final Paint _icon = Paint()..color = const Color(0xE6FFFFFF);
  final Paint _iconStroke = Paint()
    ..color = const Color(0xE6FFFFFF)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.4
    ..strokeCap = StrokeCap.round;
  final Paint _off = Paint();
  Size? _cached;
  late RRect _outer;
  late RRect _screen;

  static double radiusFor(Size s) => s.width * 0.14;
  static double bezelFor(Size s) => (s.width * 0.035).clamp(4.0, 9.0);

  void _layout(Size size) {
    if (_cached == size) return;
    _cached = size;
    final r = radiusFor(size);
    final b = bezelFor(size);
    _outer = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(r));
    _screen = RRect.fromRectAndRadius(Rect.fromLTWH(b, b, size.width - 2 * b, size.height - 2 * b), Radius.circular(r - b));
    _wall.shader = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [wallTop, wallBottom],
    ).createShader(_screen.outerRect);
  }

  @override
  void paint(Canvas canvas, Size size) {
    _layout(size);
    canvas.drawRRect(_outer, _body);
    canvas.drawRRect(_screen, _wall);
    final b = bezelFor(size);
    final top = b + 10.0;
    final w = size.width;
    // Camera punch-hole.
    canvas.drawCircle(Offset(w / 2, top), 3, _body);
    // Signal bars.
    for (var i = 0; i < 4; i++) {
      final h = 3.0 + i * 1.6;
      canvas.drawRRect(
        RRect.fromLTRBR(w - b - 54 + i * 4.0, top + 4 - h, w - b - 51.5 + i * 4.0, top + 4, const Radius.circular(0.8)),
        _icon,
      );
    }
    // Wifi.
    final wifiC = Offset(w - b - 30, top + 4);
    for (var i = 1; i <= 2; i++) {
      canvas.drawArc(Rect.fromCircle(center: wifiC, radius: i * 3.4), -2.36, 1.57, false, _iconStroke);
    }
    canvas.drawCircle(wifiC, 1.1, _icon);
    // Battery.
    final bx = w - b - 22;
    canvas.drawRRect(RRect.fromLTRBR(bx, top - 2, bx + 13, top + 5, const Radius.circular(1.6)), _iconStroke);
    canvas.drawRect(Rect.fromLTRB(bx + 1.8, top - 0.2, bx + 9, top + 3.2), _icon);
    final off = screenOff?.value ?? 0;
    if (off > 0) {
      _off.color = Color.fromRGBO(0, 0, 0, off * 0.92);
      canvas.drawRRect(_screen, _off);
    }
  }

  @override
  bool shouldRepaint(PhoneFramePainter old) =>
      old.wallTop != wallTop || old.wallBottom != wallBottom || old.screenOff != screenOff;
}

/// Pulsing sound-wave rings (SOS card). Driven by [t]; three arcs on each side of a dot.
class SoundWavePainter extends CustomPainter {
  SoundWavePainter(this.t, this.color) : super(repaint: t);
  final Animation<double> t;
  final Color color;
  final Paint _p = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.8
    ..strokeCap = StrokeCap.round;
  final Paint _dot = Paint();

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final maxR = size.shortestSide / 2;
    // Fast pulse: 4 pulses per demo loop, time-based.
    final phase = (t.value * 8) % 1.0;
    _dot.color = color;
    canvas.drawCircle(c, maxR * 0.22, _dot);
    for (var i = 0; i < 3; i++) {
      final f = (phase + i / 3) % 1.0;
      final r = maxR * (0.38 + 0.62 * f);
      _p.color = color.withValues(alpha: (1 - f) * 0.95);
      final rect = Rect.fromCircle(center: c, radius: r);
      canvas.drawArc(rect, -0.7, 1.4, false, _p);
      canvas.drawArc(rect, 3.14159 - 0.7, 1.4, false, _p);
    }
  }

  @override
  bool shouldRepaint(SoundWavePainter old) => old.color != color || old.t != t;
}
