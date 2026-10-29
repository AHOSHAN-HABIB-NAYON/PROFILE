/// Family + live location models (docs/CONTRACTS/openapi.yaml: Family, Member, MemberLocation).
class FamilyMember {
  const FamilyMember({
    required this.id,
    required this.name,
    required this.role,
    this.avatarThumbUrl,
    this.relationship,
    this.isOverseas = false,
    this.timezone,
    this.countryIso2,
    this.sharingStatus = 'pending',
  });

  final String id;
  final String name;
  final String role; // parent | guardian | child
  final String? avatarThumbUrl;
  final String? relationship;
  final bool isOverseas;
  final String? timezone;
  final String? countryIso2;
  final String sharingStatus; // pending | active | paused | stopped

  bool get isChild => role == 'child';
  bool get isAdult => !isChild;

  factory FamilyMember.fromJson(Map<String, dynamic> j) => FamilyMember(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        role: (j['role'] as String?) ?? 'guardian',
        avatarThumbUrl: j['avatar_thumb_url'] as String?,
        relationship: j['relationship'] as String?,
        isOverseas: j['is_overseas'] as bool? ?? false,
        timezone: j['timezone'] as String?,
        countryIso2: j['country_iso2'] as String?,
        sharingStatus: (j['sharing_status'] as String?) ?? 'pending',
      );
}

class Family {
  const Family({required this.id, this.name, this.ownerMemberId, this.plan = 'free', this.members = const []});
  final String id;
  final String? name;
  final String? ownerMemberId;
  final String plan;
  final List<FamilyMember> members;

  FamilyMember? member(String id) => members.where((m) => m.id == id).firstOrNull;

  factory Family.fromJson(Map<String, dynamic> j) {
    final f = j['family'] is Map ? (j['family'] as Map).cast<String, dynamic>() : j;
    return Family(
      id: f['id'] as String,
      name: f['name'] as String?,
      ownerMemberId: f['owner_member_id'] as String?,
      plan: (f['plan'] as String?) ?? 'free',
      members: ((f['members'] as List<dynamic>?) ?? const [])
          .map((m) => FamilyMember.fromJson((m as Map).cast<String, dynamic>()))
          .toList(),
    );
  }
}

class LivePoint {
  const LivePoint({required this.recordedAt, required this.lat, required this.lng, required this.accuracyM, this.batteryPct});
  final DateTime recordedAt;
  final double lat;
  final double lng;
  final double accuracyM;
  final int? batteryPct;

  factory LivePoint.fromJson(Map<String, dynamic> j) => LivePoint(
        recordedAt: DateTime.parse(j['recorded_at'] as String),
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
        accuracyM: (j['accuracy_m'] as num?)?.toDouble() ?? 0,
        batteryPct: (j['battery_pct'] as num?)?.toInt(),
      );
}

class MemberLive {
  const MemberLive({required this.memberId, this.point, this.lastUpdateAt, this.batteryPct, this.online = false, this.unavailableReason, this.placeName});
  final String memberId;
  final LivePoint? point;
  final DateTime? lastUpdateAt;
  final int? batteryPct;
  final bool online;
  final String? unavailableReason;
  final String? placeName;

  factory MemberLive.fromJson(Map<String, dynamic> j) => MemberLive(
        memberId: j['member_id'] as String,
        point: j['point'] is Map ? LivePoint.fromJson((j['point'] as Map).cast<String, dynamic>()) : null,
        lastUpdateAt: j['last_update_at'] == null ? null : DateTime.parse(j['last_update_at'] as String),
        batteryPct: (j['battery_pct'] as num?)?.toInt(),
        online: j['online'] as bool? ?? false,
        unavailableReason: j['unavailable_reason'] as String?,
        placeName: j['place_name'] as String?,
      );

  /// Applies a realtime `location.update`.
  MemberLive withPoint(LivePoint p) => MemberLive(
        memberId: memberId,
        point: p,
        lastUpdateAt: p.recordedAt,
        batteryPct: p.batteryPct ?? batteryPct,
        online: true,
        unavailableReason: null,
        placeName: placeName,
      );
}

class NearbyPlace {
  const NearbyPlace({required this.id, required this.name, required this.category, required this.lat, required this.lng, required this.distanceM, this.address});
  final String id;
  final String name;
  final String category;
  final double lat;
  final double lng;
  final int distanceM;
  final String? address;

  factory NearbyPlace.fromJson(Map<String, dynamic> j) => NearbyPlace(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        category: (j['category'] as String?) ?? 'store',
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
        distanceM: (j['distance_m'] as num?)?.toInt() ?? 0,
        address: j['address'] as String?,
      );
}
