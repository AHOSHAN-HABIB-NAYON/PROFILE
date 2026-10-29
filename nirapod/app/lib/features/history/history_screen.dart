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
  int _end = 0; // days ago of the last day in the range (0 = today)
  int _span = 1; // number of days shown (1..31)

  String _ymd(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _pickRange(DateTime today, int historyDays) async {
    final first = DateTime(today.year, today.month, today.day).subtract(Duration(days: (historyDays - 1).clamp(0, 365)));
    final last = DateTime(today.year, today.month, today.day);
    final end = last.subtract(Duration(days: _end));
    final picked = await showDateRangePicker(
      context: context,
      firstDate: first,
      lastDate: last,
      initialDateRange: DateTimeRange(start: end.subtract(Duration(days: _span - 1)), end: end),
      helpText: widget.strings.t('history.pick_dates'),
    );
    if (picked == null || !mounted) return;
    final s = DateTime(picked.start.year, picked.start.month, picked.start.day);
    final e = DateTime(picked.end.year, picked.end.month, picked.end.day);
    setState(() {
      _end = last.difference(e).inDays;
      _span = (e.difference(s).inDays + 1).clamp(1, 31);
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final t = Theme.of(context).textTheme;
    final c = context.colors;
    final lang = ref.watch(languageProvider);
    final family = ref.watch(familyProvider).value;
    final now = ref.watch(homeClockProvider)();
    final use24h = MediaQuery.alwaysUse24HourFormatOf(context);
    if (family == null) return MessageView(icon: AppIcons.users, title: s.t('history.empty_title'));
    final members = family.members.where((m) => m.isChild || m.sharingStatus == 'active').toList();
    if (members.isEmpty) return MessageView(icon: AppIcons.users, title: s.t('history.empty_title'));
    final member = members.firstWhere((m) => m.id == _member, orElse: () => members.first);
    final zone = member.timezone ?? 'UTC';
    final today = inZone(now, zone);
    final todayDate = DateTime(today.year, today.month, today.day);
    final days = [for (var i = _span - 1; i >= 0; i--) todayDate.subtract(Duration(days: _end + i))];
    final routes = [for (final d in days) ref.watch(routeProvider((member.id, _ymd(d))))];
    final historyDays = routes.map((r) => r.value?.historyDays).whereType<int>().firstOrNull ?? 90;
    String label(DateTime d) {
      final ago = todayDate.difference(d).inDays;
      return ago == 0 ? s.t('history.today') : (ago == 1 ? s.t('history.yesterday') : formatLongDate(d, zone, language: lang));
    }

    final dayLabel = _span == 1 ? label(days.first) : s.t('history.range', {'from': label(days.first), 'to': label(days.last)});
    // Combined state: any error wins, then loading, then all points of the range in time order.
    final AsyncValue<DayRoute> async = routes.firstWhere((r) => r.hasError, orElse: () => routes.firstWhere((r) => r.isLoading && !r.hasValue, orElse: () => AsyncData(DayRoute(
          points: [for (final r in routes) ...?r.value?.points]..sort((a, b) => a.at.compareTo(b.at)),
          timezone: zone,
          historyDays: historyDays,
        ))));
    Widget chip(String text, bool on, VoidCallback tap) => ChoiceChip(label: Text(text), selected: on, onSelected: (_) => tap());
    return ListView(padding: const EdgeInsets.all(Space.screenHorizontal), children: [
      Wrap(spacing: Space.xs, runSpacing: Space.xs, children: [
        for (final m in members) ChoiceChip(label: Text(m.name), selected: m.id == member.id, onSelected: (_) => setState(() => _member = m.id)),
      ]),
      const SizedBox(height: Space.sm),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          chip(s.t('history.today'), _end == 0 && _span == 1, () => setState(() { _end = 0; _span = 1; })),
          const SizedBox(width: Space.xs),
          chip(s.t('history.yesterday'), _end == 1 && _span == 1, () => setState(() { _end = 1; _span = 1; })),
          const SizedBox(width: Space.xs),
          if (historyDays >= 7) ...[
            chip(s.t('history.last7'), _end == 0 && _span == 7, () => setState(() { _end = 0; _span = 7; })),
            const SizedBox(width: Space.xs),
          ],
          ActionChip(
            key: const Key('pick_dates'),
            avatar: AppIcon(AppIcons.history, size: 16, color: c.primaryText),
            label: Text(s.t('history.pick_dates')),
            onPressed: () => _pickRange(todayDate, historyDays),
          ),
        ]),
      ),
      const SizedBox(height: Space.xs),
      Container(
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Radii.card), border: Border.all(color: c.border)),
        child: Row(children: [
          IconButton(
            tooltip: s.t('history.pick_day'),
            onPressed: _end + _span < historyDays ? () => setState(() => _end += _span) : null,
            icon: AppIcon(AppIcons.chevronLeft, color: c.text),
          ),
          Expanded(
            child: InkWell(
              onTap: () => _pickRange(todayDate, historyDays),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: Space.xs),
                child: Column(children: [
                  Text(dayLabel, textAlign: TextAlign.center, style: t.titleMedium, maxLines: 2),
                  if (_span > 1) Text(localizeDigits(s.t('history.days_count', {'count': _span}), lang.numerals), style: t.bodySmall!.copyWith(color: c.muted)),
                ]),
              ),
            ),
          ),
          IconButton(
            tooltip: s.t('history.pick_day'),
            onPressed: _end > 0 ? () => setState(() => _end = (_end - _span).clamp(0, 1 << 20)) : null,
            icon: AppIcon(AppIcons.chevronRight, color: c.text),
          ),
        ]),
      ),
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
            action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: () { for (final d in days) { ref.invalidate(routeProvider((member.id, _ymd(d)))); } }),
          ),
        _ => const SkeletonList(rows: 2),
      },
    ]);
  }
}
