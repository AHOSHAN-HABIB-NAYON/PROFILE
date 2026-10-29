import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/motion/motion.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';

/// Hosts one looping onboarding demo.
///
/// - Time-based: a repeating [AnimationController] of [period] (frame-rate independent, 60-144 Hz).
/// - Isolated: wrapped in a [RepaintBoundary] so only the demo repaints each frame.
/// - Reduce motion: the controller never runs; the demo shows the [staticFrame] (0..1) instead.
/// - Decorative for TalkBack: one short [semanticLabel], children excluded.
/// - Demos stay left-to-right (they are pictures); text inside is clamped to 1.3x so the frame holds.
class DemoStage extends StatefulWidget {
  const DemoStage({
    super.key,
    required this.period,
    required this.semanticLabel,
    required this.builder,
    this.staticFrame = 0.7,
    this.maxHeight = 540,
  });

  final Duration period;
  final String semanticLabel;
  final double staticFrame;
  final double maxHeight;
  final Widget Function(BuildContext context, Animation<double> t) builder;

  @override
  State<DemoStage> createState() => _DemoStageState();
}

class _DemoStageState extends State<DemoStage> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: widget.period);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (Motion.reduced(context)) {
      _c
        ..stop()
        ..value = widget.staticFrame;
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
    final mq = MediaQuery.of(context);
    // Fill the page: about half the screen on phones, so no large empty band is left under the text.
    final height = math.min(widget.maxHeight, math.max(200.0, mq.size.height * 0.6));
    final c = context.colors;
    return Semantics(
      label: widget.semanticLabel,
      image: true,
      excludeSemantics: true,
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: BorderRadius.circular(Radii.cardLarge),
            border: Border.all(color: c.border),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(Radii.cardLarge),
            child: RepaintBoundary(
              child: MediaQuery(
                data: mq.copyWith(textScaler: mq.textScaler.clamp(maxScaleFactor: 1.3)),
                child: Directionality(
                  textDirection: TextDirection.ltr,
                  child: widget.builder(context, _c),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 0 -> 1 between [start] and [end] of the loop, holds 1 until [fadeOutAt], then back to 0 by 1.0.
Animation<double> appearThenHide(Animation<double> t, double start, double end, {double fadeOutAt = 0.9}) {
  return t.drive(TweenSequence<double>([
    if (start > 0) TweenSequenceItem(tween: ConstantTween(0), weight: start),
    TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0).chain(CurveTween(curve: Motion.decelerate)), weight: end - start),
    TweenSequenceItem(tween: ConstantTween(1), weight: fadeOutAt - end),
    TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0).chain(CurveTween(curve: Curves.easeIn)), weight: 1 - fadeOutAt),
  ]));
}

/// Small text style used inside demos (sizes are part of the picture).
TextStyle demoText(BuildContext context, {double size = 11, FontWeight weight = FontWeight.w500, Color? color}) =>
    Theme.of(context).textTheme.bodySmall!.copyWith(
          fontSize: size,
          fontWeight: weight,
          fontVariations: [FontVariation('wght', weight.value.toDouble())],
          height: 1.25,
          color: color ?? context.colors.text,
        );
