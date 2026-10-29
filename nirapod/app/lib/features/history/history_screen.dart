import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/numerals.dart';
import '../../core/i18n/strings.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/net/api_error.dart';
import '../../core/session/session.dart';
import '../../core/state/buttons.dart';
import '../../core/state/skeleton.dart';
import '../../core/state/state_views.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/trust/trust.dart';
import '../../core/tz/tz_utils.dart';
import '../../nav/router.dart';
import '../family/data/family_repo.dart';
import '../home/widgets/profile_row.dart' show homeClockProvider;
import '../map/family_map.dart';
import '../map/map_prefs.dart';
import 'history_data.dart';

/// History tab: Timeline (arrivals, departures, SOS, battery, offline) and Routes (by day, plan-limited).
class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  int _segment = 0;

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('history'));
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.sm, Space.screenHorizontal, Space.xs),
            child: SizedBox(
              width: double.infinity,
              child: SegmentedButton<int>(
                segments: [
                  ButtonSegment(value: 0, label: Text(s.t('history.timeline'))),
                  ButtonSegment(value: 1, label: Text(s.t('history.routes'))),
                ],
                selected: {_segment},
                showSelectedIcon: false,
                onSelectionChanged: (v) => setState(() => _segment = v.first),
              ),
            ),
          ),
          Expanded(child: _segment == 0 ? _Timeline(strings: s) : _Routes(strings: s)),
        ]),
      ),
    );
  }
}

String eventText(Strings s, TimelineEvent e) {
  final args = <String, Object>{'name': e.memberName, for (final kv in e.data.entries) kv.key: (kv.value as Object?) ?? ''};
  final key = 'history.ev_${e.type}';
  return s.has(key) ? s.t(key, args) : s.t('history.ev_other', {'name': e.memberName, 'type': e.type});
}

String eventIcon(String type) => switch (type) {
      'battery_low' || 'battery_critical' => AppIcons.battery,
      'offline' => AppIcons.wifiOff,
      'location_off' || 'permission_removed' => AppIcons.lock,
      'sos' => AppIcons.sos,
      'arrival' || 'departure' => AppIcons.locationPin,
      'update_requested' => AppIcons.refresh,
      _ => AppIcons.info,
    };

class _Timeline extends ConsumerStatefulWidget {
  const _Timeline({required this.strings});
  final Strings strings;

  @override
  ConsumerState<_Timeline> createState() => _TimelineState();
}

class _TimelineState extends ConsumerState<_Timeline> {
  String? _cat;

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final c = context.colors;
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionControllerProvider);
    final zone = session is SignedIn ? (session.user.timezone ?? 'UTC') : 'UTC';
    final use24h = MediaQuery.alwaysUse24HourFormatOf(context);
    final async = ref.watch(timelineProvider(_cat));
    return Column(children: [
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
        child: Row(children: [
          for (final (v, key) in [(null, 'history.filter_all'), ('safety', 'history.filter_safety'), ('family', 'history.filter_family')])
            Padding(
              padding: const EdgeInsetsDirectional.only(end: Space.xs),
              child: ChoiceChip(label: Text(s.t(key)), selected: _cat == v, onSelected: (_) => setState(() => _cat = v)),
            ),
        ]),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(timelineProvider(_cat)),
          child: switch (async) {
            AsyncData(:final value) when value.isEmpty =>
              ListView(children: [MessageView(icon: AppIcons.history, title: s.t('history.empty_title'), body: s.t('history.empty_body'))]),
            AsyncData(:final value) => ListView.separated(
                padding: const EdgeInsets.all(Space.screenHorizontal),
                itemCount: value.length,
                separatorBuilder: (_, _) => const SizedBox(height: Space.xs),
                itemBuilder: (_, i) {
                  final e = value[i];
                  final when = '${formatLongDate(e.at, zone, language: lang)} · ${formatLocalTime(e.at, zone, language: lang, use24h: use24h)}';
                  return Card(
                    child: ListTile(
                      leading: Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: (e.isSafety ? c.warning : c.primary).withValues(alpha: 0.14)),
                        child: AppIcon(eventIcon(e.type), size: 20, color: e.type == 'sos' ? c.dangerText : (e.isSafety ? c.warningText : c.primaryText)),
                      ),
                      title: Text(localizeDigits(eventText(s, e), lang.numerals)),
                      subtitle: Text(when),
                      onTap: e.memberId == null ? null : () => context.push(locationFor('member', param: e.memberId!)),
                    ),
                  );
                },
              ),
            AsyncError(:final error) => ListView(children: [
                MessageView(
                  icon: AppIcons.alertCircle,
                  title: s.t('state.error_title'),
                  body: s.t(ApiError.from(error).messageKey),
                  action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: () => ref.invalidate(timelineProvider(_cat))),
                ),
              ]),
            _ => const Padding(padding: EdgeInsets.all(Space.screenHorizontal), child: SkeletonList()),
          },
        ),
      ),
    ]);
  }
}

class _Routes extends ConsumerStatefulWidget {
  const _Routes({required this.strings});
  final Strings strings;

  @override
  ConsumerState<_Routes> createState() => _RoutesState();
}

class _RoutesState extends ConsumerState<_Routes> {
  String? _member;
  int _daysAgo = 0;

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final t = Theme.of(context).textTheme;
    final lang = ref.watch(languageProvider);
    final family = ref.watch(familyProvider).value;
    final now = ref.watch(homeClockProvider)();
    final use24h = MediaQuery.alwaysUse24HourFormatOf(context);
    if (family == null) return MessageView(icon: AppIcons.users, title: s.t('history.empty_title'));
    final members = family.members.where((m) => m.isChild || m.sharingStatus == 'active').toList();
    if (members.isEmpty) return MessageView(icon: AppIcons.users, title: s.t('history.empty_title'));
    final member = members.firstWhere((m) => m.id == _member, orElse: () => members.first);
    final zone = member.timezone ?? 'UTC';
    final day = inZone(now, zone).subtract(Duration(days: _daysAgo));
    final date = '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
    final async = ref.watch(routeProvider((member.id, date)));
    final dayLabel = _daysAgo == 0 ? s.t('history.today') : (_daysAgo == 1 ? s.t('history.yesterday') : formatLongDate(day, zone, language: lang));
    return ListView(padding: const EdgeInsets.all(Space.screenHorizontal), children: [
      Wrap(spacing: Space.xs, runSpacing: Space.xs, children: [
        for (final m in members) ChoiceChip(label: Text(m.name), selected: m.id == member.id, onSelected: (_) => setState(() => _member = m.id)),
      ]),
      const SizedBox(height: Space.sm),
      Row(children: [
        IconButton(
          tooltip: s.t('history.pick_day'),
          onPressed: _daysAgo < 89 ? () => setState(() => _daysAgo++) : null,
          icon: AppIcon(AppIcons.chevronLeft, color: context.colors.text),
        ),
        Expanded(child: Text(dayLabel, textAlign: TextAlign.center, style: t.titleMedium)),
        IconButton(
          tooltip: s.t('history.pick_day'),
          onPressed: _daysAgo > 0 ? () => setState(() => _daysAgo--) : null,
          icon: AppIcon(AppIcons.chevronRight, color: context.colors.text),
        ),
      ]),
      const SizedBox(height: Space.xs),
      switch (async) {
        AsyncData(:final value) when value.points.isEmpty => MessageView(icon: AppIcons.map, title: s.t('history.no_route')),
        AsyncData(:final value) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(Radii.cardLarge),
              child: SizedBox(
                height: 280,
                child: FamilyMapView(
                  data: FamilyMapData(
                    prefs: ref.watch(mapPrefsProvider),
                    trail: [for (final p in value.points) (p.lat, p.lng)],
                    pins: [
                      MapPin(id: member.id, name: member.name, lat: value.points.last.lat, lng: value.points.last.lng, accuracyM: value.points.last.accuracyM, trust: Trust.stale),
                    ],
                  ),
                  onReady: (_) {},
                  onPinTap: (_) {},
                ),
              ),
            ),
            const SizedBox(height: Space.sm),
            Text(localizeDigits(s.t('history.points', {'count': value.points.length}), lang.numerals), style: t.bodyMedium),
            Text(
              s.t('history.first_last', {
                'start': formatLocalTime(value.points.first.at, zone, language: lang, use24h: use24h),
                'end': formatLocalTime(value.points.last.at, zone, language: lang, use24h: use24h),
              }),
              style: t.bodySmall,
            ),
          ]),
        AsyncError(:final error) when ApiError.from(error).kind == ApiErrorKind.planLimit => MessageView(
            icon: AppIcons.crown,
            title: s.t('state.limit_title'),
            body: s.t('history.limit', {'days': (ApiError.from(error).details?['max'] as Object?) ?? 3}),
            action: AppButton(label: s.t('state.limit_cta'), onPressed: () => context.go(locationFor('premium'))),
          ),
        AsyncError(:final error) => MessageView(
            icon: AppIcons.alertCircle,
            title: s.t('state.error_title'),
            body: s.t(ApiError.from(error).messageKey),
            action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: () => ref.invalidate(routeProvider((member.id, date)))),
          ),
        _ => const SkeletonList(rows: 2),
      },
    ]);
  }
}
