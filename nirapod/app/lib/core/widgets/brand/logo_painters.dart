import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

import '../../theme/tokens.g.dart';
import 'logo_paths.g.dart';

/// Brand gradient stops shared by the mark, the app tile and the Android drawables.
abstract final class BrandGradient {
  static const start = BrandColors.primary; // emerald #059669
  static const end = Color(0xFF0D9488); // teal 600: white on it stays >= 3:1 (graphics contrast)
  static const colors = [start, end];
}

/// Cached path metrics for the draw-on (computed once per process, never per frame).
abstract final class LogoMetrics {
  static final pin = LogoPaths.pin.computeMetrics().toList(growable: false);
  static final people = [
    LogoPaths.adultLeft.computeMetrics().toList(growable: false),
    LogoPaths.adultRight.computeMetrics().toList(growable: false),
    LogoPaths.child.computeMetrics().toList(growable: false),
  ];
}

// In logo-app.svg the pin sits at 80 % with its bounding-box centre (24, 24.7) on the tile centre.
const double _pinScale = 0.8;
const Offset _pinOffset = Offset(24 - 24 * _pinScale, 24 - 24.7 * _pinScale);

/// Paints the app tile (logo-app.svg) synchronously, so the first Flutter frame matches the native
/// splash exactly (an SvgPicture loads a frame later and would flash).
/// Paint objects, shaders and the RRect are reused; they are rebuilt only when the size changes.
class AppTilePainter {
  final Paint _tile = Paint();
  final Paint _pin = Paint();
  final Paint _family = Paint();
  double _side = -1;
  RRect _rrect = RRect.zero;

  void paint(Canvas canvas, double side, {double opacity = 1}) {
    if (_side != side) {
      _side = side;
      final k = side / LogoPaths.grid;
      _rrect = RRect.fromRectAndRadius(Offset.zero & Size(side, side), Radius.circular(11 * k));
      _tile.shader = ui.Gradient.linear(Offset.zero, Offset(side, side), BrandGradient.colors);
      // The family is a knockout: it is painted with the tile gradient expressed in pin space.
      Offset toPin(Offset p) => (p / k - _pinOffset) / _pinScale;
      _family.shader = ui.Gradient.linear(toPin(Offset.zero), toPin(Offset(side, side)), BrandGradient.colors);
    }
    final a = opacity.clamp(0.0, 1.0);
    _tile.color = Color.fromRGBO(0, 0, 0, a);
    _family.color = Color.fromRGBO(0, 0, 0, a);
    _pin.color = Color.fromRGBO(255, 255, 255, a);
    canvas.drawRRect(_rrect, _tile);
    canvas.save();
    canvas.scale(side / LogoPaths.grid);
    canvas.translate(_pinOffset.dx, _pinOffset.dy);
    canvas.scale(_pinScale);
    canvas.drawPath(LogoPaths.pin, _pin);
    canvas.drawPath(LogoPaths.familyFill, _family);
    canvas.restore();
  }
}
