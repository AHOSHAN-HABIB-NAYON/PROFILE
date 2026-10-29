import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/theme/app_theme.dart';
import '../widgets/demo_stage.dart';
import '../widgets/permission_page.dart';
import 'phone.dart';

/// Page 1 demo: a phone lock screen with a status bar; three notifications slide in one after the
/// other ("Rafi reached School", "Mom: Where are you?", and a red SOS alert with a pulsing
/// sound-wave icon), then the screen clears and the 7 s story repeats.
class NotificationsDemo extends StatelessWidget {
  const NotificationsDemo({super.key, required this.strings});
  final Strings strings;

  static const period = Duration(milliseconds: 7000);

  @override
  Widget build(BuildContext context) => DemoStage(
        period: period,
        staticFrame: 0.8,
        semanticLabel: strings.t('perm.demo_a11y_notifications'),
        builder: (context, t) => _Scene(strings: strings, t: t),
      );
}

class _Scene extends StatelessWidget {
  const _Scene({required this.strings, required this.t});
  final Strings strings;
  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = strings;
    return LayoutBuilder(builder: (context, box) {
      final phoneW = math.min(box.maxWidth - 40, 300.0);
      final phoneH = box.maxHeight * 1.25;
      final clock = localDigits(s, '9:41');
      return Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [c.primary.withValues(alpha: 0.10), c.primary.withValues(alpha: 0.02)],
                ),
              ),
            ),
          ),
          Positioned(
            top: 14,
            left: (box.maxWidth - phoneW) / 2,
            width: phoneW,
            height: phoneH,
            child: Stack(
              children: [
                Positioned.fill(child: RepaintBoundary(child: CustomPaint(painter: PhoneFramePainter()))),
                // Status bar clock + notification dots appearing with each alert.
                Positioned(
                  top: 9,
                  left: 22,
                  child: Row(children: [
                    Text(clock, style: demoText(context, size: 10, weight: FontWeight.w600, color: Colors.white)),
                    const SizedBox(width: 6),
                    for (final (i, start) in const [(0, 0.06), (1, 0.30), (2, 0.54)])
                      FadeTransition(
                        opacity: appearThenHide(t, start, start + 0.06),
                        child: Padding(
                          padding: const EdgeInsets.only(right: 3),
                          child: _Dot(color: i == 2 ? c.danger : Colors.white),
                        ),
                      ),
                  ]),
                ),
                Positioned(
                  top: 34,
                  left: 0,
                  right: 0,
                  child: Column(children: [
                    Text(
                      clock,
                      textAlign: TextAlign.center,
                      style: demoText(context, size: 48, weight: FontWeight.w300, color: Colors.white),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      s.t('perm.demo_date'),
                      textAlign: TextAlign.center,
                      style: demoText(context, size: 11, color: const Color(0xD9FFFFFF)),
                    ),
                  ]),
                ),
                Positioned(
                  top: 124,
                  left: 12,
                  right: 12,
                  child: Column(children: [
                    _Arrive(
                      t: t,
                      start: 0.06,
                      child: _Card(
                        title: s.t('perm.demo_app'),
                        time: s.t('perm.demo_ago', {'minutes': localDigits(s, 2)}),
                        body: s.t('perm.demo_arrived'),
                        leading: AppIcon(AppIcons.locationPinFilled, size: 16, color: c.primaryText),
                      ),
                    ),
                    const SizedBox(height: 8),
                    _Arrive(
                      t: t,
                      start: 0.30,
                      child: _Card(
                        title: s.t('perm.demo_app'),
                        time: s.t('perm.demo_ago', {'minutes': localDigits(s, 1)}),
                        body: s.t('perm.demo_message'),
                        leading: AppIcon(AppIcons.message, size: 16, color: c.primaryText),
                      ),
                    ),
                    const SizedBox(height: 8),
                    _Arrive(
                      t: t,
                      start: 0.54,
                      child: _Card(
                        sos: true,
                        title: s.t('perm.demo_app'),
                        time: s.t('perm.demo_now'),
                        body: s.t('perm.demo_sos'),
                        leading: SizedBox.square(
                          dimension: 22,
                          child: CustomPaint(painter: SoundWavePainter(t, Colors.white)),
                        ),
                      ),
                    ),
                  ]),
                ),
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.color});
  final Color color;
  @override
  Widget build(BuildContext context) =>
      Container(width: 5, height: 5, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
}

/// Slides a card down from above and fades it in at [start]; all cards clear at the end of the loop.
class _Arrive extends StatelessWidget {
  const _Arrive({required this.t, required this.start, required this.child});
  final Animation<double> t;
  final double start;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final a = appearThenHide(t, start, start + 0.08, fadeOutAt: 0.92);
    return FadeTransition(
      opacity: a,
      child: SlideTransition(
        position: a.drive(Tween(begin: const Offset(0, -0.35), end: Offset.zero)),
        child: child,
      ),
    );
  }
}

/// Looks like a real Android (12+) notification: rounded white card, round app icon, "Nirapod • 2m",
/// bold title, one line of text and a round picture on the right. SOS uses the red alert style.
class _Card extends StatelessWidget {
  const _Card({required this.title, required this.time, required this.body, required this.leading, this.sos = false});
  final String title;
  final String time;
  final String body;
  final Widget leading;
  final bool sos;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Red is used ONLY for the SOS alert.
    final bg = sos ? const Color(0xFFFFEDEC) : const Color(0xFFF7F9F8);
    final fg = sos ? const Color(0xFF8C1D18) : const Color(0xFF1B1F1D);
    final muted = sos ? const Color(0xFFB3261E) : const Color(0xFF5F6662);
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 9, 10, 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 10, offset: Offset(0, 3))],
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: sos ? c.danger : c.primaryFill, shape: BoxShape.circle),
          child: SvgPicture.asset(
            BrandAssets.logoMark,
            width: 14,
            height: 14,
            colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
            excludeFromSemantics: true,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text.rich(
              TextSpan(children: [
                TextSpan(text: title, style: demoText(context, size: 9.5, weight: FontWeight.w600, color: muted)),
                TextSpan(text: '  •  $time', style: demoText(context, size: 9.5, color: muted)),
              ]),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(body, maxLines: 2, overflow: TextOverflow.ellipsis, style: demoText(context, size: 12, weight: FontWeight.w700, color: fg)),
          ]),
        ),
        const SizedBox(width: 8),
        Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: sos ? c.danger : c.primary.withValues(alpha: 0.14),
            shape: BoxShape.circle,
          ),
          child: leading,
        ),
      ]),
    );
  }
}
