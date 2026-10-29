import '../../core/net/retry.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/net/providers.dart';
import '../family/data/family_repo.dart';

class TimelineEvent {
  const TimelineEvent({
    required this.id,
    required this.type,
    required this.memberId,
    required this.memberName,
    required this.at,
    this.data = const {},
  });
  final String id;
  final String type;
  final String? memberId;
  final String memberName;
  final DateTime at;
  final Map<String, dynamic> data;

  factory TimelineEvent.fromJson(Map<String, dynamic> j) => TimelineEvent(
    id: j['id'] as String,
    type: j['type'] as String,
    memberId: j['member_id'] as String?,
    memberName: (j['member_name'] as String?) ?? '',
    at: DateTime.parse(j['occurred_at'] as String),
    data: (j['data'] as Map?)?.cast<String, dynamic>() ?? const {},
  );

  bool get isSafety => const {
    'sos',
    'battery_low',
    'battery_critical',
    'offline',
    'location_off',
    'permission_removed',
    'safe_walk_overdue',
  }.contains(type);
}

class RoutePoint {
  const RoutePoint(this.at, this.lat, this.lng, this.accuracyM);
  final DateTime at;
  final double lat;
  final double lng;
  final double accuracyM;
}

class DayRoute {
  const DayRoute({required this.points, required this.timezone, required this.historyDays});
  final List<RoutePoint> points;
  final String timezone;
  final int historyDays;
}

/// Timeline filtered by category (null = all).
final timelineProvider = FutureProvider.autoDispose.family<List<TimelineEvent>, String?>(retry: retryNetworkOnly, (
  ref,
  category,
) async {
  final fid = ref.watch(familyIdProvider);
  if (fid == null) return const [];
  final list = await ref
      .watch(apiClientProvider)
      .get<List<dynamic>>('/families/$fid/timeline', query: {'limit': '100', 'category': ?category});
  return list.map((e) => TimelineEvent.fromJson((e as Map).cast<String, dynamic>())).toList();
});

/// One member's route for a date (YYYY-MM-DD, in the member's zone).
final routeProvider = FutureProvider.autoDispose.family<DayRoute, (String, String)>(retry: retryNetworkOnly, (
  ref,
  key,
) async {
  final fid = ref.watch(familyIdProvider);
  if (fid == null) return const DayRoute(points: [], timezone: 'UTC', historyDays: 3);
  final j = await ref
      .watch(apiClientProvider)
      .get<Map<String, dynamic>>('/families/$fid/members/${key.$1}/route', query: {'date': key.$2});
  return DayRoute(
    timezone: (j['timezone'] as String?) ?? 'UTC',
    historyDays: (j['history_days'] as num?)?.toInt() ?? 3,
    points: [
      for (final p in (j['points'] as List<dynamic>? ?? const []))
        RoutePoint(
          DateTime.parse((p as Map)['recorded_at'] as String),
          (p['lat'] as num).toDouble(),
          (p['lng'] as num).toDouble(),
          (p['accuracy_m'] as num?)?.toDouble() ?? 0,
        ),
    ],
  );
});
