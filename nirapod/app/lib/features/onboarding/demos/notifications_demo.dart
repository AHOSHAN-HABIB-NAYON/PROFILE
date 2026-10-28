import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
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
      final phoneW = math.min(box.maxWidth - 48, 270.0);
      final phoneH = box.maxHeight * 1.25;
      final clock = localDigits(s, '9:41');
      return Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          Positioned.fill(child: ColoredBox(color: c.primary.withValues(alpha: 0.06))),
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
                  top: 30,
                  left: 0,
                  right: 0,
                  child: Text(
                    clock,
                    textAlign: TextAlign.center,
                    style: demoText(context, size: 38, weight: FontWeight.w300, color: Colors.white),
                  ),
                ),
                Positioned(
                  top: 86,
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
                    const SizedBox(height: 6),
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
                    const SizedBox(height: 6),
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
    final bg = sos ? c.danger : const Color(0xF2FFFFFF);
    final fg = sos ? Colors.white : LightColors.text;
    final muted = sos ? const Color(0xE6FFFFFF) : LightColors.mutedText;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: sos ? const Color(0x33FFFFFF) : c.primary.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: leading,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              SvgPicture.asset(BrandAssets.logoMark, width: 10, height: 10, excludeFromSemantics: true),
              const SizedBox(width: 4),
              Expanded(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: demoText(context, size: 9, color: muted))),
              Text(time, style: demoText(context, size: 9, color: muted)),
            ]),
            const SizedBox(height: 1),
            Text(body, maxLines: 1, overflow: TextOverflow.ellipsis, style: demoText(context, size: 11.5, weight: FontWeight.w600, color: fg)),
          ]),
        ),
      ]),
    );
  }
}
