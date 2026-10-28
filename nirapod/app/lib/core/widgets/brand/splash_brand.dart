import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../icons/app_icons.g.dart';
import '../../motion/motion.dart';
import '../../theme/tokens.g.dart';
import 'logo_painters.dart';

/// Brand block for the Flutter splash. It continues seamlessly from the native Android splash:
///
/// * it fills the space it is given and paints the same background as the native splash, chosen by
///   the SYSTEM brightness (light #F6F8F7, dark #0B1512), because the native splash cannot know the
///   in-app theme choice;
/// * its first frame is the native frame: the 128dp app tile centred, painted synchronously;
/// * then (1.6 s, time-based) the tile lifts and settles to 112dp, the wordmark and the [tagline]
///   fade up, and two soft pulse rings expand from the tile. It ends at rest (no repeating ticker).
///
/// Reduce motion: the final composition is shown at once (tile stays centred) and no ticker runs.
/// Place it as the whole body of a Scaffold without an AppBar / SafeArea so that the centre matches.
class SplashBrand extends StatefulWidget {
  const SplashBrand({super.key, this.tagline});
  final String? tagline;

  /// Native splash icon size (res/drawable/splash_icon.xml) and the settled size.
  static const double nativeTile = 128;
  static const double settledTile = 112;
  static const Duration duration = Duration(milliseconds: 1600);

  @override
  State<SplashBrand> createState() => _SplashBrandState();
}

class _SplashBrandState extends State<SplashBrand> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: SplashBrand.duration);
  late final _TilePainter _painter = _TilePainter(_c);
  bool _reduced = false;

  static const _word = Interval(0.18, 0.50, curve: Curves.easeOutCubic);
  static const _tag = Interval(0.28, 0.60, curve: Curves.easeOutCubic);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduced = Motion.reduced(context);
    _painter.reduced = _reduced;
    if (_reduced) {
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
  Widget build(BuildContext context) {
    final dark = MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    final bg = dark ? DarkColors.background : LightColors.background;
    final tagColor = dark ? DarkColors.primaryText : LightColors.primaryText;
    final tagline = widget.tagline;
    final label = tagline == null || tagline.isEmpty ? 'Nirapod' : 'Nirapod. $tagline';

    return Semantics(
      label: label,
      image: true,
      excludeSemantics: true,
      child: ColoredBox(
        color: bg,
        child: LayoutBuilder(builder: (context, box) {
          final h = box.hasBoundedHeight ? box.maxHeight : 420.0;
          final w = box.hasBoundedWidth ? box.maxWidth : 360.0;
          // Final layout: tile centre lifted so the whole block (tile + wordmark + tagline) is centred.
          final liftBy = _reduced ? 0.0 : 64.0;
          final textTop = h / 2 + SplashBrand.settledTile / 2 - liftBy + 28;
          return SizedBox(
            width: w,
            height: h,
            child: AnimatedBuilder(
              animation: _c,
              builder: (context, _) {
                final v = _c.value;
                final word = _word.transform(v);
                final tag = _tag.transform(v);
                return Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(child: RepaintBoundary(child: CustomPaint(painter: _painter))),
                    Positioned(
                      left: 0,
                      right: 0,
                      top: textTop + 10 * (1 - word),
                      child: Opacity(
                        opacity: word,
                        child: Center(
                          child: SvgPicture.asset(
                            dark ? BrandAssets.logoWordmarkDark : BrandAssets.logoWordmark,
                            height: 40,
                            excludeFromSemantics: true,
                          ),
                        ),
                      ),
                    ),
                    if (tagline != null && tagline.isNotEmpty)
                      Positioned(
                        left: Space.screenHorizontal,
                        right: Space.screenHorizontal,
                        top: textTop + 52 + 8 * (1 - tag),
                        child: Opacity(
                          opacity: tag,
                          child: Text(
                            tagline,
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: TypeScale.subtitle.size,
                              fontWeight: FontWeight.w600,
                              height: TypeScale.subtitle.lineHeight,
                              letterSpacing: 0.2,
                              color: tagColor,
                            ),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          );
        }),
      ),
    );
  }
}

class _TilePainter extends CustomPainter {
  _TilePainter(this.t) : super(repaint: t);
  final Animation<double> t;
  bool reduced = false;

  static const _lift = Interval(0.0, 0.38, curve: Curves.easeInOutCubic);
  static const _pulses = [Interval(0.14, 0.66, curve: Curves.easeOut), Interval(0.42, 0.94, curve: Curves.easeOut)];

  final AppTilePainter _tile = AppTilePainter();
  final Paint _ring = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2;
  static final RRect _ringBase = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset.zero, width: SplashBrand.nativeTile, height: SplashBrand.nativeTile),
      const Radius.circular(SplashBrand.nativeTile * 11 / 48));

  @override
  void paint(Canvas canvas, Size size) {
    final v = t.value;
    final lift = reduced ? 1.0 : _lift.transform(v);
    final side = ui.lerpDouble(SplashBrand.nativeTile, SplashBrand.settledTile, lift)!;
    final cx = size.width / 2;
    final cy = size.height / 2 - (reduced ? 0 : 64 * lift);

    if (!reduced) {
      for (final iv in _pulses) {
        final p = iv.transform(v);
        if (p <= 0 || p >= 1) continue;
        final s = (1 + 0.45 * p) * side / SplashBrand.nativeTile;
        _ring.color = BrandColors.primary.withValues(alpha: 0.32 * (1 - p));
        canvas.save();
        canvas.translate(cx, cy);
        canvas.scale(s);
        _ring.strokeWidth = 2 / s;
        canvas.drawRRect(_ringBase, _ring);
        canvas.restore();
      }
    }
    canvas.save();
    canvas.translate(cx - side / 2, cy - side / 2);
    // Painted at the native size and scaled, so the cached shaders are never rebuilt per frame.
    canvas.scale(side / SplashBrand.nativeTile);
    _tile.paint(canvas, SplashBrand.nativeTile);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_TilePainter old) => old.t != t || old.reduced != reduced;
}
