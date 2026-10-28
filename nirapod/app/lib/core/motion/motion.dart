import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/tokens.g.dart';

/// Motion tokens as Durations. Everything is time-based (AnimationController uses frame deltas),
/// so animations look identical at 60, 90, 120 and 144 Hz.
abstract final class Motion {
  static const themeMorph = Duration(milliseconds: MotionMs.themeToggleMorphMs);
  static const themeCrossFade = Duration(milliseconds: MotionMs.themeCrossFadeMs);
  static const languageSheet = Duration(milliseconds: MotionMs.languageSheetMs);
  static const languageRowStagger = Duration(milliseconds: MotionMs.languageRowStaggerMs);
  static const bellSwing = Duration(milliseconds: MotionMs.bellSwingMs);
  static const badgePop = Duration(milliseconds: MotionMs.badgePopMs);
  static const navIconMorph = Duration(milliseconds: MotionMs.navIconMorphMs);
  static const navIndicator = Duration(milliseconds: MotionMs.navIndicatorMs);
  static const pressIn = Duration(milliseconds: MotionMs.buttonPressInMs);
  static const pressOut = Duration(milliseconds: MotionMs.buttonPressOutMs);
  static const page = Duration(milliseconds: MotionMs.pageTransitionMs);
  static const avatarPulse = Duration(milliseconds: MotionMs.avatarPulseMs);
  static const greetingFade = Duration(milliseconds: MotionMs.greetingCrossFadeMs);
  static const successCheck = Duration(milliseconds: MotionMs.successCheckMs);
  static const shimmer = Duration(milliseconds: MotionMs.shimmerMs);
  static const logoDraw = Duration(milliseconds: MotionMs.welcomeLogoDrawMs);
  static const confetti = Duration(milliseconds: MotionMs.confettiMs);
  static const splash = Duration(milliseconds: MotionMs.splashMs);
  static const reducedMax = Duration(milliseconds: MotionMs.reducedMotionMaxMs);

  static const decelerate = Curves.easeOutCubic;
  static const standard = Curves.easeInOutCubic;

  /// Spring-like curve for the theme toggle morph (slight overshoot, settles).
  static const spring = ElasticOutCurve(0.9);

  /// True when the user asked the system to reduce or remove animations.
  static bool reduced(BuildContext context) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false;

  /// Duration to use: the normal value, or a plain fade of at most 120 ms when motion is reduced.
  static Duration of(BuildContext context, Duration normal) =>
      reduced(context) ? (normal < reducedMax ? normal : reducedMax) : normal;
}

/// Damped swing used by the notification bell: +-18 degrees, decaying over [Motion.bellSwing].
double bellSwingAngle(double t) {
  const maxRad = MotionMs.bellSwingDeg * math.pi / 180;
  return maxRad * math.exp(-4 * t) * math.sin(t * 5 * 2 * math.pi) * (1 - t);
}

/// Badge pop: 0.6 -> 1.15 -> 1.0.
final badgePopTween = TweenSequence<double>([
  TweenSequenceItem(tween: Tween(begin: 0.6, end: 1.15).chain(CurveTween(curve: Curves.easeOut)), weight: 60),
  TweenSequenceItem(tween: Tween(begin: 1.15, end: 1.0).chain(CurveTween(curve: Curves.easeInOut)), weight: 40),
]);

/// Wraps any tappable child with the press feedback from the spec: scale to 0.97 in 90 ms, back in
/// 140 ms, light haptic. Keeps a 48dp minimum touch target.
class PressScale extends StatefulWidget {
  const PressScale({super.key, required this.child, this.onTap, this.haptic = true, this.enabled = true});

  final Widget child;
  final VoidCallback? onTap;
  final bool haptic;
  final bool enabled;

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: Motion.pressIn,
    reverseDuration: Motion.pressOut,
    lowerBound: 0,
    upperBound: 1,
  );
  late final Animation<double> _scale =
      Tween(begin: 1.0, end: MotionMs.buttonPressScale).animate(CurvedAnimation(parent: _c, curve: Curves.easeOut));

  bool get _active => widget.enabled && widget.onTap != null;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _down(TapDownDetails _) {
    if (!_active || Motion.reduced(context)) return;
    _c.forward();
  }

  void _up() {
    if (_c.status != AnimationStatus.dismissed) _c.reverse();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: _down,
      onTapCancel: _up,
      onTapUp: (_) => _up(),
      onTap: _active
          ? () {
              if (widget.haptic) HapticFeedback.lightImpact();
              widget.onTap!();
            }
          : null,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minWidth: Sizes.minTouchTarget, minHeight: Sizes.minTouchTarget),
        child: ScaleTransition(scale: _scale, child: widget.child),
      ),
    );
  }
}
