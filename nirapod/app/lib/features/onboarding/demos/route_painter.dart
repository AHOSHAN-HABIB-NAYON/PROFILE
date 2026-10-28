import 'dart:typed_data';
import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';

/// A route sampled once into a flat list of points so the per-frame position lookup allocates
/// nothing but the resulting Offset.
class SampledRoute {
  SampledRoute(Path path, {int samples = 96}) : _xy = Float64List(samples * 2) {
    final PathMetric m = path.computeMetrics().first;
    length = m.length;
    for (var i = 0; i < samples; i++) {
      final pos = m.getTangentForOffset(m.length * i / (samples - 1))!.position;
      _xy[i * 2] = pos.dx;
      _xy[i * 2 + 1] = pos.dy;
    }
    metric = m;
  }

  final Float64List _xy;
  late final double length;
  late final PathMetric metric;

  int get _n => _xy.length ~/ 2;

  Offset at(double f) {
    final x = f.clamp(0.0, 1.0) * (_n - 1);
    final i = x.floor().clamp(0, _n - 2);
    final r = x - i;
    return Offset(
      _xy[i * 2] + (_xy[i * 2 + 2] - _xy[i * 2]) * r,
      _xy[i * 2 + 1] + (_xy[i * 2 + 3] - _xy[i * 2 + 1]) * r,
    );
  }
}

/// Draws a list of dash segments along [metric] once into [into].
void dashInto(Path into, PathMetric metric, {double dash = 6, double gap = 5}) {
  var d = 0.0;
  while (d < metric.length) {
    into.addPath(metric.extractPath(d, (d + dash).clamp(0, metric.length)), Offset.zero);
    d += dash + gap;
  }
}

/// Simple avatar: filled circle with a white ring and a head-and-shoulders glyph.
void drawAvatar(Canvas canvas, Offset c, double r, Paint fill, Paint ring, Paint glyph) {
  canvas.drawCircle(c, r + 2.5, ring);
  canvas.drawCircle(c, r, fill);
  canvas.drawCircle(c.translate(0, -r * 0.22), r * 0.3, glyph);
  canvas.drawArc(Rect.fromCenter(center: c.translate(0, r * 0.62), width: r * 1.2, height: r * 0.95), 3.14159, 3.14159, true, glyph);
}

/// Home glyph (roof + body) centred at [c].
void drawHouse(Canvas canvas, Offset c, double s, Paint body, Paint roof, Paint door) {
  final w = s, h = s * 0.7;
  canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c.translate(0, s * 0.18), width: w, height: h), Radius.circular(s * 0.08)), body);
  final roofPath = Path()
    ..moveTo(c.dx - w * 0.65, c.dy - s * 0.12)
    ..lineTo(c.dx, c.dy - s * 0.62)
    ..lineTo(c.dx + w * 0.65, c.dy - s * 0.12)
    ..close();
  canvas.drawPath(roofPath, roof);
  canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c.translate(0, s * 0.33), width: w * 0.26, height: h * 0.55), Radius.circular(s * 0.05)), door);
}

/// School glyph (building with flag) centred at [c].
void drawSchool(Canvas canvas, Offset c, double s, Paint body, Paint roof, Paint window) {
  canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c.translate(0, s * 0.15), width: s * 1.4, height: s * 0.75), Radius.circular(s * 0.08)), body);
  canvas.drawRect(Rect.fromCenter(center: c.translate(0, -s * 0.32), width: s * 0.55, height: s * 0.32), roof);
  for (var i = -1; i <= 1; i++) {
    canvas.drawRect(Rect.fromCenter(center: c.translate(i * s * 0.4, s * 0.12), width: s * 0.2, height: s * 0.2), window);
  }
  canvas.drawRect(Rect.fromCenter(center: c.translate(0, -s * 0.66), width: s * 0.05, height: s * 0.36), roof);
}
