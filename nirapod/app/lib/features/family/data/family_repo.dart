import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/net/api_client.dart';
import '../../../core/net/providers.dart';
import '../../../core/session/session.dart';
import 'family_models.dart';

/// Family API calls (Phase 2). All paths under /api/v1.
class FamilyRepo {
  FamilyRepo(this._api);
  final ApiClient _api;

  Future<Family> get(String familyId) async =>
      Family.fromJson(await _api.get<Map<String, dynamic>>('/families/$familyId'));

  Future<Family> create() async => Family.fromJson(await _api.post<Map<String, dynamic>>('/families', data: {}));

  Future<void> acceptInvite(String code) => _api.post<dynamic>('/invites/accept', data: {'code': code});

  Future<List<MemberLive>> live(String familyId) async {
    final list = await _api.get<List<dynamic>>('/families/$familyId/live');
    return list.map((e) => MemberLive.fromJson((e as Map).cast<String, dynamic>())).toList();
  }

  Future<Map<String, dynamic>> invite(String familyId, {String? email, String role = 'guardian', bool overseas = false}) =>
      _api.post<Map<String, dynamic>>('/families/$familyId/invites', data: {
        if (email != null && email.isNotEmpty) 'email': email,
        'role': role,
        'is_overseas': overseas,
      });

  Future<Family> patchMember(String familyId, String memberId, Map<String, dynamic> body) async =>
      Family.fromJson(await _api.patch<Map<String, dynamic>>('/families/$familyId/members/$memberId', data: body));

  Future<void> removeMember(String familyId, String memberId) => _api.delete<dynamic>('/families/$familyId/members/$memberId');

  Future<Family> transfer(String familyId, String newOwnerId) async => Family.fromJson(
      await _api.post<Map<String, dynamic>>('/families/$familyId/transfer', data: {'new_owner_member_id': newOwnerId}));

  Future<void> requestUpdate(String familyId, String memberId) =>
      _api.post<dynamic>('/families/$familyId/members/$memberId/request-update', data: {});

  Future<void> report(String category, {String? details}) => _api.post<dynamic>('/abuse-reports', data: {
        'category': category,
        if (details != null && details.trim().isNotEmpty) 'details': details.trim(),
      });

  Future<List<NearbyPlace>> nearby(double lat, double lng, {List<String>? categories}) async {
    final j = await _api.get<Map<String, dynamic>>('/nearby', query: {
      'lat': lat.toStringAsFixed(5),
      'lng': lng.toStringAsFixed(5),
      if (categories != null) 'categories': categories.join(','),
    });
    return ((j['places'] as List<dynamic>?) ?? const [])
        .map((e) => NearbyPlace.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }
}

final familyRepoProvider = Provider<FamilyRepo>((ref) => FamilyRepo(ref.watch(apiClientProvider)));

/// Signed-in user's family id (null = no family yet).
final familyIdProvider = Provider<String?>((ref) {
  final s = ref.watch(sessionControllerProvider);
  return s is SignedIn ? s.user.familyId : null;
});

/// The user's family (members, owner, plan). Refresh with ref.invalidate(familyProvider).
final familyProvider = FutureProvider<Family?>((ref) async {
  final id = ref.watch(familyIdProvider);
  if (id == null) return null;
  return ref.watch(familyRepoProvider).get(id);
});

/// Live positions: loaded from /live, refreshed every 30 s, and patched by realtime `location.update`.
class LiveController extends AsyncNotifier<Map<String, MemberLive>> {
  Timer? _timer;

  @override
  Future<Map<String, MemberLive>> build() async {
    final id = ref.watch(familyIdProvider);
    ref.onDispose(() => _timer?.cancel());
    if (id == null) return {};
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => refresh());
    return _load(id);
  }

  Future<Map<String, MemberLive>> _load(String id) async =>
      {for (final m in await ref.read(familyRepoProvider).live(id)) m.memberId: m};

  Future<void> refresh() async {
    final id = ref.read(familyIdProvider);
    if (id == null) return;
    try {
      state = AsyncData(await _load(id));
    } catch (_) {
      // Keep the cached data; the offline banner is driven by connectivity.
    }
  }

  void applyUpdate(String memberId, LivePoint p) {
    final cur = state.value ?? {};
    final prev = cur[memberId] ?? MemberLive(memberId: memberId);
    state = AsyncData({...cur, memberId: prev.withPoint(p)});
  }
}

final liveProvider = AsyncNotifierProvider<LiveController, Map<String, MemberLive>>(LiveController.new);
