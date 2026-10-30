import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/motion/motion.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/theme_controller.dart';
import '../../../core/theme/tokens.g.dart';

/// 44dp circular header button: surface, hairline border, very subtle shadow.
class HeaderCircle extends StatelessWidget {
  const HeaderCircle({super.key, required this.child, required this.onTap, required this.label});
  final Widget child;
  final VoidCallback onTap;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: PressScale(
        onTap: onTap,
        child: Center(
          child: Container(
            width: Sizes.headerButton,
            height: Sizes.headerButton,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: c.surface,
              shape: BoxShape.circle,
              border: Border.all(color: c.border),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 3, offset: const Offset(0, 1))],
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Theme toggle: moon (light mode) morphs to sun (dark mode) with rotation and ray scale, 450 ms spring.
class ThemeToggleButton extends ConsumerWidget {
  const ThemeToggleButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeControllerProvider) == ThemeMode.dark;
    final s = ref.watch(screenStringsProvider('_default'));
    final c = context.colors;
    return HeaderCircle(
      label: s.t(dark ? 'a11y.theme_toggle_on' : 'a11y.theme_toggle_off'),
      onTap: () => ref.read(themeControllerProvider.notifier).toggle(),
      child: AnimatedSwitcher(
        duration: Motion.of(context, Motion.themeMorph),
        switchInCurve: Motion.spring,
        switchOutCurve: Curves.easeIn,
        transitionBuilder: (child, a) => RotationTransition(
          turns: Tween(begin: -0.25, end: 0.0).animate(a),
          child: ScaleTransition(scale: Tween(begin: 0.4, end: 1.0).animate(a), child: FadeTransition(opacity: a, child: child)),
        ),
        child: AppIcon(dark ? AppIcons.sun : AppIcons.moon, key: ValueKey(dark), size: 22, color: dark ? c.warningText : c.text),
      ),
    );
  }
}

/// Bell with unread badge ("9+" max). Swings +-18 deg over 700 ms and pops the badge when [unread] grows.
class NotificationBell extends ConsumerStatefulWidget {
  const NotificationBell({super.key, required this.unread, required this.onTap});
  final int unread;
  final VoidCallback onTap;

  @override
  ConsumerState<NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends ConsumerState<NotificationBell> with TickerProviderStateMixin {
  late final AnimationController _swing = AnimationController(vsync: this, duration: Motion.bellSwing);
  late final AnimationController _pop = AnimationController(vsync: this, duration: Motion.badgePop, value: 1);

  @override
  void didUpdateWidget(NotificationBell old) {
    super.didUpdateWidget(old);
    if (widget.unread > old.unread && !Motion.reduced(context)) {
      _swing.forward(from: 0);
      _pop.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _swing.dispose();
    _pop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('_default'));
    final c = context.colors;
    final n = widget.unread;
    return HeaderCircle(
      label: s.t('a11y.notifications', {'count': n}),
      onTap: widget.onTap,
      child: Stack(clipBehavior: Clip.none, children: [
        AnimatedBuilder(
          animation: _swing,
          builder: (_, child) => Transform.rotate(
            angle: _swing.isAnimating ? bellSwingAngle(_swing.value) : 0,
            alignment: Alignment.topCenter,
            child: child,
          ),
          child: AppIcon(n > 0 ? AppIcons.bellFilled : AppIcons.bell, size: 22, color: c.text),
        ),
        if (n > 0)
          PositionedDirectional(
            top: -6,
            end: -8,
            child: ScaleTransition(
              scale: badgePopTween.animate(_pop),
              child: Container(
                constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                padding: const EdgeInsets.symmetric(horizontal: 4),
                alignment: Alignment.center,
                decoration: BoxDecoration(color: c.danger, borderRadius: BorderRadius.circular(9), border: Border.all(color: c.surface, width: 1.5)),
                child: Text(n > 9 ? '9+' : '$n',
                    style: TextStyle(color: c.onDanger, fontSize: 11, fontWeight: FontWeight.w700, height: 1.1)),
              ),
            ),
          ),
      ]),
    );
  }
}

/// Circular avatar with a 3dp emerald ring and 3dp gap; pulses 1.0 -> 1.06 every 2.4 s while [pulsing].
class RingAvatar extends StatefulWidget {
  const RingAvatar({super.key, required this.size, this.url, required this.initials, this.pulsing = false, this.ringColor});
  final double size;
  final String? url;
  final String initials;
  final bool pulsing;
  final Color? ringColor;

  @override
  State<RingAvatar> createState() => _RingAvatarState();
}

class _RingAvatarState extends State<RingAvatar> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Motion.avatarPulse);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(RingAvatar old) {
    super.didUpdateWidget(old);
    _sync();
  }

  void _sync() {
    if (widget.pulsing && !Motion.reduced(context)) {
      if (!_c.isAnimating) _c.repeat();
    } else {
      _c.stop();
      _c.value = 0;
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
    final inner = widget.size - 12;
    // No photo: a person avatar on a colour picked from the name (stable per person), like Google accounts.
    final initials = Semantics(
      label: widget.initials,
      child: CustomPaint(size: Size(inner, inner), painter: DefaultAvatarPainter(avatarColorFor(widget.initials))),
    );
    final photo = widget.url == null
        ? initials
        : ClipOval(
            child: Image.network(widget.url!, width: inner, height: inner, fit: BoxFit.cover,
                errorBuilder: (_, _, _) => initials, cacheWidth: (inner * 3).round()),
          );
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, child) {
          final t = math.sin(_c.value * math.pi);
          return Transform.scale(scale: 1 + (MotionMs.avatarPulseScale - 1) * t, child: child);
        },
        child: Container(
          width: widget.size,
          height: widget.size,
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: widget.ringColor ?? c.primary, width: 3)),
          child: photo,
        ),
      ),
    );
  }
}

String initialsOf(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '';
  final first = parts.first.characters.first;
  final last = parts.length > 1 ? parts.last.characters.first : '';
  return (first + last).toUpperCase();
}

/// Calm avatar colours (white figure stays readable on each).
const _avatarPalette = [
  Color(0xFF0F8A6B), Color(0xFF2F6FDE), Color(0xFF8E5BD8), Color(0xFFD8650F),
  Color(0xFFC2416B), Color(0xFF0E8FA6), Color(0xFF5E7D1E), Color(0xFF6B5A4E),
];

/// Stable colour for a person (same name or initials -> same colour).
Color avatarColorFor(String seed) {
  var h = 0;
  for (final u in seed.codeUnits) {
    h = (h * 31 + u) & 0x7fffffff;
  }
  return _avatarPalette[h % _avatarPalette.length];
}

/// Draws the default avatar (head and shoulders) inside a circle of [radius] at [center].
void paintDefaultAvatar(Canvas canvas, Offset center, double radius, Color bg) {
  canvas.save();
  canvas.clipPath(Path()..addOval(Rect.fromCircle(center: center, radius: radius)));
  canvas.drawCircle(center, radius, Paint()..color = bg);
  final white = Paint()..color = const Color(0xF2FFFFFF);
  canvas.drawCircle(center + Offset(0, -radius * 0.18), radius * 0.34, white);
  final body = Rect.fromCenter(center: center + Offset(0, radius * 0.86), width: radius * 1.5, height: radius * 1.2);
  canvas.drawOval(body, white);
  canvas.restore();
}

class DefaultAvatarPainter extends CustomPainter {
  const DefaultAvatarPainter(this.bg);
  final Color bg;
  @override
  void paint(Canvas canvas, Size size) => paintDefaultAvatar(canvas, size.center(Offset.zero), size.shortestSide / 2, bg);
  @override
  bool shouldRepaint(DefaultAvatarPainter old) => old.bg != bg;
}
