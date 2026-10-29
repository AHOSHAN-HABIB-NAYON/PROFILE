import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/strings.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/net/api_error.dart';
import '../../core/net/providers.dart';
import '../../core/net/retry.dart';
import '../../core/session/session.dart';
import '../../core/state/buttons.dart';
import '../../core/state/state_views.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../family/data/realtime.dart';
import '../../core/permissions/permission_card.dart';
import '../onboarding/data/permission_gateway.dart';

class AlertItem {
  const AlertItem({required this.id, required this.category, required this.type, required this.titleKey, required this.params, required this.read, required this.at, this.sosId});
  final String id;
  final String category;
  final String type;
  final String titleKey;
  final Map<String, Object> params;
  final bool read;
  final DateTime at;
  final String? sosId;

  factory AlertItem.fromJson(Map<String, dynamic> j) => AlertItem(
        id: j['id'] as String,
        category: j['category'] as String? ?? 'family',
        type: j['type'] as String? ?? '',
        titleKey: j['title_key'] as String? ?? '',
        params: ((j['params'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', (v ?? '') as Object)),
        read: j['read'] == true,
        at: DateTime.tryParse(j['created_at'] as String? ?? '')?.toUtc() ?? DateTime.now().toUtc(),
        sosId: j['sos_id'] as String?,
      );
}

class AlertsPage {
  const AlertsPage(this.items, this.unread);
  final List<AlertItem> items;
  final int unread;
}

final alertsProvider = FutureProvider.family<AlertsPage, String?>(retry: retryNetworkOnly, (ref, category) async {
  final j = await ref.watch(apiClientProvider).get<Map<String, dynamic>>('/notifications', query: {'category': ?category});
  return AlertsPage(
    ((j['items'] as List?) ?? const []).map((e) => AlertItem.fromJson((e as Map).cast<String, dynamic>())).toList(),
    (j['unread'] as num?)?.toInt() ?? 0,
  );
});

/// Unread count for the bell: refreshed on realtime `notification.new` and every 2 minutes.
class UnreadAlerts extends Notifier<int> {
  Timer? _timer;
  StreamSubscription<RealtimeEvent>? _sub;

  @override
  int build() {
    final s = ref.watch(sessionControllerProvider);
    ref.onDispose(() {
      _timer?.cancel();
      _sub?.cancel();
    });
    if (s is! SignedIn || s.user.isChild) return 0;
    _sub = ref.watch(realtimeProvider).events.where((e) => e.name == 'notification.new').listen((_) => refresh());
    _timer = Timer.periodic(const Duration(minutes: 2), (_) => refresh());
    unawaited(refresh());
    return 0;
  }

  Future<void> refresh() async {
    try {
      final j = await ref.read(apiClientProvider).get<Map<String, dynamic>>('/notifications', query: {'limit': '1'});
      state = (j['unread'] as num?)?.toInt() ?? 0;
    } catch (_) {}
  }
}

final unreadAlertsCountProvider = NotifierProvider<UnreadAlerts, int>(UnreadAlerts.new);

String alertTitle(Strings s, AlertItem a) {
  if (s.has(a.titleKey)) return s.t(a.titleKey, a.params);
  final h = 'history.ev_${a.type}';
  return s.has(h) ? s.t(h, a.params) : a.type;
}

String alertIcon(AlertItem a) => switch (a.type) {
      'sos' || 'sos_resolved' => AppIcons.sos,
      'battery_low' || 'battery_critical' => AppIcons.battery,
      'arrival' || 'departure' || 'safe_arrival' => AppIcons.locationPinFilled,
      'safe_walk_started' || 'safe_walk_arrived' || 'safe_walk_overdue' || 'safe_walk_stopped' || 'safe_walk_cancelled' => AppIcons.walk,
      'offline' => AppIcons.wifiOff,
      'location_off' || 'permission_removed' => AppIcons.alertCircle,
      'family_joined' => AppIcons.users,
      _ => AppIcons.bell,
    };

String ago(Strings s, DateTime at, DateTime now) {
  final d = now.difference(at);
  if (d.inMinutes < 1) return s.t('alerts.just_now');
  if (d.inMinutes < 60) return s.t('alerts.min_ago', {'minutes': d.inMinutes});
  return s.t('alerts.hours_ago', {'hours': d.inHours});
}

/// Alerts (bell): All / Safety / Family / Account, unread dots, mark all read.
class AlertsScreen extends ConsumerStatefulWidget {
  const AlertsScreen({super.key});
  @override
  ConsumerState<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends ConsumerState<AlertsScreen> {
  String? _category;

  Future<void> _markAll() async {
    try {
      await ref.read(apiClientProvider).post<dynamic>('/notifications/read', data: {'all': true});
    } catch (_) {}
    ref.invalidate(alertsProvider);
    unawaited(ref.read(unreadAlertsCountProvider.notifier).refresh());
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('notifications'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final async = ref.watch(alertsProvider(_category));
    final now = DateTime.now().toUtc();
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text(s.t('alerts.title')),
        backgroundColor: c.background,
        actions: [TextButton(key: const Key('alerts_mark_all'), onPressed: _markAll, child: Text(s.t('alerts.mark_all')))],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, 0),
          child: PermissionNeededCard(permission: OnbPermission.notification, strings: s),
        ),
        SizedBox(
          height: 52,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal, vertical: Space.xs), children: [
            for (final (key, cat) in const [('alerts.all', null), ('alerts.safety', 'safety'), ('alerts.family', 'family'), ('alerts.account', 'account')])
              Padding(
                padding: const EdgeInsetsDirectional.only(end: Space.xs),
                child: ChoiceChip(label: Text(s.t(key)), selected: _category == cat, onSelected: (_) => setState(() => _category = cat)),
              ),
          ]),
        ),
        Expanded(
          child: switch (async) {
            AsyncData(:final value) when value.items.isEmpty => Padding(
                padding: const EdgeInsets.all(Space.screenHorizontal),
                child: MessageView(icon: AppIcons.bell, title: s.t('alerts.empty_title'), body: s.t('alerts.empty_body')),
              ),
            AsyncData(:final value) => RefreshIndicator(
                onRefresh: () async => ref.invalidate(alertsProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.lg),
                  itemCount: value.items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.xs),
                  itemBuilder: (context, i) {
                    final a = value.items[i];
                    final danger = a.type == 'sos';
                    final color = danger ? c.dangerText : (a.category == 'safety' ? c.warningText : c.primaryText);
                    return Container(
                      padding: const EdgeInsets.all(Space.sm),
                      decoration: BoxDecoration(
                        color: a.read ? c.surface : c.primary.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(Radii.card),
                        border: Border.all(color: danger ? c.danger.withValues(alpha: 0.5) : c.border),
                      ),
                      child: Row(children: [
                        Container(
                          width: 40,
                          height: 40,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
                          child: AppIcon(alertIcon(a), size: 20, color: color),
                        ),
                        const SizedBox(width: Space.sm),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(alertTitle(s, a), style: t.bodyLarge!.copyWith(fontWeight: a.read ? FontWeight.w400 : FontWeight.w600)),
                            Text(ago(s, a.at, now), style: t.bodySmall),
                          ]),
                        ),
                        if (!a.read) Container(width: 10, height: 10, decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle)),
                      ]),
                    );
                  },
                ),
              ),
            AsyncError(:final error) => MessageView(
                icon: AppIcons.alertCircle,
                title: s.t('state.error_title'),
                body: s.t(ApiError.from(error).messageKey),
                action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: () => ref.invalidate(alertsProvider)),
              ),
            _ => const Center(child: CircularProgressIndicator()),
          },
        ),
      ]),
    );
  }
}

class NotificationPrefs {
  const NotificationPrefs(this.push, this.email, this.dailyHour);
  final Map<String, bool> push;
  final Map<String, bool> email;
  final int? dailyHour;
  factory NotificationPrefs.fromJson(Map<String, dynamic> j) => NotificationPrefs(
        ((j['push'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', v == true)),
        ((j['email'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', v == true)),
        (j['daily_summary_hour'] as num?)?.toInt(),
      );
}

final notificationPrefsProvider = FutureProvider<NotificationPrefs>(retry: retryNetworkOnly, (ref) async =>
    NotificationPrefs.fromJson(await ref.watch(apiClientProvider).get<Map<String, dynamic>>('/me/notification-prefs')));

/// Settings > Notifications and email: push categories (safety always on), email per type, daily summary time.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});
  @override
  ConsumerState<NotificationSettingsScreen> createState() => _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState extends ConsumerState<NotificationSettingsScreen> {
  NotificationPrefs? _local;

  Future<void> _patch(Map<String, dynamic> body) async {
    try {
      final j = await ref.read(apiClientProvider).patch<Map<String, dynamic>>('/me/notification-prefs', data: body);
      setState(() => _local = NotificationPrefs.fromJson(j));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ref.read(screenStringsProvider('notifications')).t(ApiError.from(e).messageKey))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('notifications'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final prefs = _local ?? ref.watch(notificationPrefsProvider).value;
    Widget section(String title) => Padding(
          padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.lg, Space.screenHorizontal, Space.xs),
          child: Text(title, style: t.titleMedium),
        );
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('notifset.title')), backgroundColor: c.background),
      body: prefs == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(children: [
              section(s.t('notifset.push')),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
                child: Row(children: [
                  AppIcon(AppIcons.shieldCheck, size: 18, color: c.successText),
                  const SizedBox(width: Space.xs),
                  Expanded(child: Text(s.t('notifset.safety_always'), style: t.bodySmall)),
                ]),
              ),
              for (final k in const ['family', 'account', 'marketing'])
                SwitchListTile(
                  title: Text(s.t('notifset.push_$k')),
                  value: prefs.push[k] ?? false,
                  onChanged: (v) => _patch({'push': {k: v}}),
                ),
              section(s.t('notifset.email')),
              for (final k in const ['family_joined', 'new_device_login', 'sos_summary', 'subscription', 'gift', 'daily_summary', 'chat', 'announcements'])
                SwitchListTile(
                  title: Text(s.t('notifset.email_$k')),
                  value: prefs.email[k] ?? false,
                  onChanged: (v) => _patch({'email': {k: v}}),
                ),
              ListTile(
                title: Text(s.t('notifset.daily_time')),
                trailing: DropdownButton<int?>(
                  value: prefs.dailyHour,
                  items: [
                    DropdownMenuItem<int?>(value: null, child: Text(s.t('notifset.daily_off'))),
                    for (var h = 6; h <= 23; h++) DropdownMenuItem<int?>(value: h, child: Text('${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}')),
                  ],
                  onChanged: (v) => _patch({'daily_summary_hour': v}),
                ),
              ),
              const SizedBox(height: Space.xl),
            ]),
    );
  }
}
