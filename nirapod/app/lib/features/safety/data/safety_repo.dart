import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/net/api_client.dart';
import '../../../core/net/providers.dart';
import '../../../core/net/retry.dart';
import '../../family/data/family_repo.dart';

DateTime? _dt(Object? v) => v is String ? DateTime.tryParse(v)?.toUtc() : null;
double? _d(Object? v) => v is num ? v.toDouble() : null;

class Place {
  const Place({
    required this.id,
    required this.name,
    required this.type,
    required this.lat,
    required this.lng,
    required this.radiusM,
    this.appliesTo = const [],
  });
  final String id;
  final String name;
  final String type; // home | school | coaching | custom
  final double lat;
  final double lng;
  final int radiusM;
  final List<String> appliesTo; // empty = all children

  factory Place.fromJson(Map<String, dynamic> j) => Place(
    id: j['id'] as String,
    name: j['name'] as String,
    type: j['type'] as String? ?? 'custom',
    lat: _d(j['lat']) ?? 0,
    lng: _d(j['lng']) ?? 0,
    radiusM: (j['radius_m'] as num?)?.toInt() ?? 150,
    appliesTo: ((j['applies_to'] as List?) ?? const []).cast<String>(),
  );
}

class PlacesState {
  const PlacesState(this.places, {this.maxPlaces});
  final List<Place> places;
  final int? maxPlaces;
  bool get atLimit => maxPlaces != null && places.length >= maxPlaces!;
}

class SosDelivery {
  const SosDelivery({required this.name, required this.channel, required this.status, this.isMember = true});
  final String name;
  final String channel; // socket | email | push
  final String status; // queued | sent | delivered | seen | responded | failed
  final bool isMember;

  factory SosDelivery.fromJson(Map<String, dynamic> j) {
    final r = (j['recipient'] as Map?)?.cast<String, dynamic>() ?? const {};
    final name = (r['name'] as String?)?.trim();
    return SosDelivery(
      name: (name == null || name.isEmpty) ? (r['email'] as String? ?? '') : name,
      channel: j['channel'] as String? ?? 'socket',
      status: j['status'] as String? ?? 'queued',
      isMember: r['type'] == 'member',
    );
  }
}

class SosEvent {
  const SosEvent({
    required this.id,
    required this.status,
    required this.memberId,
    required this.memberName,
    required this.startedAt,
    this.lat,
    this.lng,
    this.mapUrl,
    this.deliveries = const [],
  });
  final String id;
  final String status; // active | resolved | cancelled
  final String memberId;
  final String memberName;
  final DateTime startedAt;
  final double? lat;
  final double? lng;
  final String? mapUrl;
  final List<SosDelivery> deliveries;
  bool get open => status == 'active' || status == 'sending';

  factory SosEvent.fromJson(Map<String, dynamic> j) {
    final m = (j['member'] as Map?)?.cast<String, dynamic>() ?? const {};
    return SosEvent(
      id: j['id'] as String,
      status: j['status'] as String? ?? 'active',
      memberId: m['id'] as String? ?? '',
      memberName: m['name'] as String? ?? '',
      startedAt: _dt(j['started_at']) ?? DateTime.now().toUtc(),
      lat: _d(j['lat']),
      lng: _d(j['lng']),
      mapUrl: j['map_url'] as String?,
      deliveries: ((j['deliveries'] as List?) ?? const [])
          .map((e) => SosDelivery.fromJson((e as Map).cast<String, dynamic>()))
          .toList(),
    );
  }
}

class Trip {
  const Trip({
    required this.id,
    required this.status,
    required this.memberId,
    required this.memberName,
    required this.startedAt,
    required this.expectedAt,
    this.destinationName,
    this.overdue = false,
    this.stopped = false,
  });
  final String id;
  final String status;
  final String memberId;
  final String memberName;
  final DateTime startedAt;
  final DateTime expectedAt;
  final String? destinationName;
  final bool overdue;
  final bool stopped;

  factory Trip.fromJson(Map<String, dynamic> j) {
    final m = (j['member'] as Map?)?.cast<String, dynamic>() ?? const {};
    final dest = (j['destination'] as Map?)?.cast<String, dynamic>();
    return Trip(
      id: j['id'] as String,
      status: j['status'] as String? ?? 'active',
      memberId: m['id'] as String? ?? '',
      memberName: m['name'] as String? ?? '',
      startedAt: _dt(j['started_at']) ?? DateTime.now().toUtc(),
      expectedAt: _dt(j['expected_arrival_at']) ?? DateTime.now().toUtc(),
      destinationName: dest?['name'] as String?,
      overdue: j['overdue'] == true,
      stopped: j['stopped'] == true,
    );
  }
}

class EmergencyContact {
  const EmergencyContact({required this.id, required this.name, required this.email, this.relationship});
  final String id;
  final String name;
  final String email;
  final String? relationship;
  factory EmergencyContact.fromJson(Map<String, dynamic> j) => EmergencyContact(
    id: j['id'] as String,
    name: j['name'] as String? ?? '',
    email: j['email'] as String? ?? '',
    relationship: j['relationship'] as String?,
  );
}

/// Places, SOS, safe arrival, safe walk and emergency contacts (Phase 4). Paths under /api/v1.
class SafetyRepo {
  SafetyRepo(this._api);
  final ApiClient _api;

  Future<PlacesState> places(String familyId) async {
    final j = await _api.get<Map<String, dynamic>>('/families/$familyId/places');
    return PlacesState(
      ((j['places'] as List?) ?? const []).map((e) => Place.fromJson((e as Map).cast<String, dynamic>())).toList(),
      maxPlaces: (j['max_places'] as num?)?.toInt(),
    );
  }

  Future<Place> savePlace(String familyId, Map<String, dynamic> body, {String? id}) async => Place.fromJson(
    id == null
        ? await _api.post<Map<String, dynamic>>('/families/$familyId/places', data: body)
        : await _api.patch<Map<String, dynamic>>('/families/$familyId/places/$id', data: body),
  );

  Future<void> deletePlace(String familyId, String id) => _api.delete<dynamic>('/families/$familyId/places/$id');

  Future<SosEvent> sendSos({double? lat, double? lng, double? accuracyM, String trigger = 'button'}) async =>
      SosEvent.fromJson(await _api.post<Map<String, dynamic>>('/sos', data: {
        'trigger': trigger,
        if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
        'accuracy_m': ?accuracyM,
      }));

  Future<SosEvent> sos(String id) async => SosEvent.fromJson(await _api.get<Map<String, dynamic>>('/sos/$id'));

  Future<List<SosEvent>> openSos(String familyId) async => (await _api.get<List<dynamic>>('/families/$familyId/sos'))
      .map((e) => SosEvent.fromJson((e as Map).cast<String, dynamic>()))
      .toList();

  Future<void> ackSos(String id, String state) => _api.post<dynamic>('/sos/$id/ack', data: {'state': state});

  Future<SosEvent> resolveSos(String id) async =>
      SosEvent.fromJson(await _api.post<Map<String, dynamic>>('/sos/$id/resolve', data: {}));

  Future<String?> safeArrival() async =>
      (await _api.post<Map<String, dynamic>>('/safe-arrival', data: {}))['place'] as String?;

  Future<Trip> startTrip(int minutes) async =>
      Trip.fromJson(await _api.post<Map<String, dynamic>>('/trips', data: {'minutes': minutes}));

  Future<Trip?> myTrip() async {
    final j = await _api.get<dynamic>('/trips/active');
    return j is Map ? Trip.fromJson(j.cast<String, dynamic>()) : null;
  }

  Future<List<Trip>> familyTrips(String familyId) async => (await _api.get<List<dynamic>>('/families/$familyId/trips'))
      .map((e) => Trip.fromJson((e as Map).cast<String, dynamic>()))
      .toList();

  Future<void> arriveTrip(String id) => _api.post<dynamic>('/trips/$id/arrive', data: {});
  Future<void> cancelTrip(String id) => _api.post<dynamic>('/trips/$id/cancel', data: {});

  Future<List<EmergencyContact>> contacts(String familyId) async =>
      (await _api.get<List<dynamic>>('/families/$familyId/emergency-contacts'))
          .map((e) => EmergencyContact.fromJson((e as Map).cast<String, dynamic>()))
          .toList();

  Future<void> addContact(String familyId, {required String name, required String email, String? relationship}) =>
      _api.post<dynamic>('/families/$familyId/emergency-contacts', data: {
        'name': name,
        'email': email,
        if (relationship != null && relationship.trim().isNotEmpty) 'relationship': relationship.trim(),
      });

  Future<void> removeContact(String familyId, String id) =>
      _api.delete<dynamic>('/families/$familyId/emergency-contacts/$id');

  /// First emergency service number for the user's country ("general" first), from the server table.
  Future<String?> emergencyNumber() async {
    final j = await _api.get<Map<String, dynamic>>('/emergency-numbers');
    final list = ((j['numbers'] as List?) ?? const []).cast<Map<String, dynamic>>();
    if (list.isEmpty) return null;
    final general = list.where((e) => e['service'] == 'general').firstOrNull;
    return ((general ?? list.first)['number']) as String?;
  }
}

final safetyRepoProvider = Provider<SafetyRepo>((ref) => SafetyRepo(ref.watch(apiClientProvider)));

final placesProvider = FutureProvider<PlacesState>(retry: retryNetworkOnly, (ref) async {
  final id = ref.watch(familyIdProvider);
  if (id == null) return const PlacesState([]);
  return ref.watch(safetyRepoProvider).places(id);
});

final familyTripsProvider = FutureProvider<List<Trip>>(retry: retryNetworkOnly, (ref) async {
  final id = ref.watch(familyIdProvider);
  if (id == null) return const [];
  return ref.watch(safetyRepoProvider).familyTrips(id);
});

final myTripProvider = FutureProvider<Trip?>(retry: retryNetworkOnly, (ref) => ref.watch(safetyRepoProvider).myTrip());

final emergencyNumberProvider = FutureProvider<String?>(retry: retryNetworkOnly, (ref) async {
  try {
    return await ref.watch(safetyRepoProvider).emergencyNumber();
  } catch (_) {
    return null;
  }
});

final emergencyContactsProvider = FutureProvider<List<EmergencyContact>>(retry: retryNetworkOnly, (ref) async {
  final id = ref.watch(familyIdProvider);
  if (id == null) return const [];
  return ref.watch(safetyRepoProvider).contacts(id);
});
