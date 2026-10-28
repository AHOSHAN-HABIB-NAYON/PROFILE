import 'package:flutter/material.dart';

import '../motion/motion.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';

/// Shimmer for skeleton loaders: one 1.2 s loop shared by all children, painted in a
/// RepaintBoundary so it never repaints the rest of the screen.
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});
  final Widget child;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Motion.shimmer);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (Motion.reduced(context)) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
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
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (context, child) => ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (rect) => LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [c.border, c.surface, c.border],
            stops: const [0.25, 0.5, 0.75],
            transform: _SlideGradient(_c.value),
          ).createShader(rect),
          child: child,
        ),
      ),
    );
  }
}

class _SlideGradient extends GradientTransform {
  const _SlideGradient(this.t);
  final double t;
  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) =>
      Matrix4.translationValues(bounds.width * (t * 2 - 1), 0, 0);
}

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, this.height = 14, this.radius = 8, this.circle = false});
  final double? width;
  final double height;
  final double radius;
  final bool circle;

  @override
  Widget build(BuildContext context) => Container(
        width: circle ? height : width,
        height: height,
        decoration: BoxDecoration(
          color: context.colors.border,
          shape: circle ? BoxShape.circle : BoxShape.rectangle,
          borderRadius: circle ? null : BorderRadius.circular(radius),
        ),
      );
}

/// Generic list skeleton (avatar + two lines) used by the loading state.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.rows = 4});
  final int rows;

  @override
  Widget build(BuildContext context) => Shimmer(
        child: Column(
          children: [
            for (var i = 0; i < rows; i++)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: Space.xs),
                child: Row(children: [
                  SkeletonBox(height: 44, circle: true),
                  SizedBox(width: Space.sm),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SkeletonBox(width: 140),
                      SizedBox(height: Space.xs),
                      SkeletonBox(width: 90, height: 12),
                    ]),
                  ),
                ]),
              ),
          ],
        ),
      );
}
