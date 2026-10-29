import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/i18n/languages.dart';
import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/motion/motion.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/tz/tz_utils.dart';
import '../../auth/profile/countries.dart';
import 'header_buttons.dart';

/// Injectable clock for the home screen (tests set a fixed time).
final homeClockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Rebuilds exactly at each minute boundary (and immediately on resume via [AppLifecycleListener]).
class MinuteTicker extends StatefulWidget {
  const MinuteTicker({super.key, required this.builder, required this.now});
  final Widget Function(BuildContext, DateTime) builder;
  final DateTime Function() now;

  @override
  State<MinuteTicker> createState() => _MinuteTickerState();
}

class _MinuteTickerState extends State<MinuteTicker> {
  Timer? _t;
  late final AppLifecycleListener _life = AppLifecycleListener(onResume: _tick);

  void _schedule() {
    _t?.cancel();
    _t = Timer(untilNextMinute(widget.now()), _tick);
  }

  void _tick() {
    if (!mounted) return;
    setState(() {});
    _schedule();
  }

  @override
  void initState() {
    super.initState();
    _life;
    _schedule();
  }

  @override
  void dispose() {
    _t?.cancel();
    _life.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, widget.now());
}

const _greetingIcons = {
  GreetingPeriod.morning: AppIcons.greetingSun,
  GreetingPeriod.afternoon: AppIcons.greetingCloudSun,
  GreetingPeriod.evening: AppIcons.greetingSunset,
  GreetingPeriod.night: AppIcons.greetingMoon,
};

/// 96dp profile row under the Home header: photo with ring (pulses while sharing), greeting from the SAVED
/// zone, name, flag + localized country + live local time, chevron. Opens Profile.
class ProfileRow extends ConsumerWidget {
  const ProfileRow({super.key, required this.user, required this.sharing, required this.onTap, required this.strings});
  final AuthUser user;
  final bool sharing;
  final VoidCallback onTap;
  final Strings strings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final lang = ref.watch(languageProvider);
    final names = ref.watch(countryNamesProvider).value;
    final now = ref.watch(homeClockProvider);
    final zone = user.timezone ?? 'UTC';
    final s = strings;
    return MinuteTicker(
      now: now,
      builder: (context, instant) {
        final period = greetingPeriod(instant, zone);
        final time = formatLocalTime(instant, zone, language: lang, use24h: MediaQuery.alwaysUse24HourFormatOf(context));
        final cc = user.countryIso2;
        final country = cc == null ? null : (names?.name(cc, lang.code) ?? cc);
        final offset = formatUtcOffset(inZone(instant, zone).timeZoneOffset);
        final tooltip = s.t('time.tooltip', {'date': formatLongDate(instant, zone, language: lang), 'zone': zone, 'offset': offset == '+0' ? '' : offset});
        return Semantics(
          button: true,
          label: s.t('a11y.open_profile'),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(Radii.card),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: Sizes.profileRowHeight),
              child: Padding(
                padding: const EdgeInsets.all(Space.md),
                child: Row(children: [
                  RingAvatar(size: Sizes.profileAvatar, url: user.avatarThumbUrl ?? user.avatarUrl, initials: initialsOf(user.name), pulsing: sharing),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                      Row(children: [
                        AnimatedSwitcher(
                          duration: Motion.of(context, Motion.greetingFade),
                          child: AppIcon(_greetingIcons[period]!, key: ValueKey(period), size: 16, color: c.warningText),
                        ),
                        const SizedBox(width: Space.xxs),
                        Flexible(child: Text(s.t('greeting.${period.name}'), style: t.bodySmall)),
                      ]),
                      Text(user.name ?? '', style: t.headlineSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      if (cc == null)
                        Text(s.t('home.set_country'), style: t.bodySmall!.copyWith(color: c.primaryText, fontWeight: FontWeight.w600))
                      else
                        Tooltip(
                          message: tooltip,
                          triggerMode: TooltipTriggerMode.longPress,
                          child: Semantics(
                            label: s.t('a11y.local_time', {'country': country ?? cc, 'time': time}),
                            excludeSemantics: true,
                            child: Row(children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(2),
                                child: SvgPicture.asset(flagAsset4x3(cc), width: 20, height: 14, fit: BoxFit.cover),
                              ),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text('${country ?? cc} · $time', style: t.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                              ),
                            ]),
                          ),
                        ),
                    ]),
                  ),
                  if (user.isOverseas) _Chip(text: s.t('home.overseas')) else if (user.role == AppRole.guardian) _Chip(text: s.t('home.guardian')),
                  const SizedBox(width: Space.xs),
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: c.background, border: Border.all(color: c.border)),
                    child: Center(child: AppIcon(AppIcons.chevronRight, size: 18, color: c.muted)),
                  ),
                ]),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Space.xs, vertical: 2),
      decoration: BoxDecoration(color: c.accent.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(Radii.pill)),
      child: Text(text, style: Theme.of(context).textTheme.labelMedium!.copyWith(color: c.primaryText, fontWeight: FontWeight.w600)),
    );
  }
}

/// Language helper for widgets outside a ConsumerWidget tree.
Language currentLanguage(WidgetRef ref) => ref.watch(languageProvider);
