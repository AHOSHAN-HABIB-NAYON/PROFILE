import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/net/api_client.dart';
import '../../../core/net/providers.dart';

/// Consent texts are versioned; bump when the disclosure or consent wording changes.
const consentVersion = '2026-10';

abstract final class ConsentType {
  static const backgroundLocationDisclosure = 'background_location_disclosure';
  static const childLocationSharing = 'child_location_sharing';
}

/// A family member as shown on the child consent screen (no locations, ever).
class FamilyMemberInfo {
  const FamilyMemberInfo({required this.id, required this.name, required this.role, this.avatarUrl, this.relationship});

  final String id;
  final String name;
  final String role; // parent | guardian | child
  final String? avatarUrl;
  final String? relationship;

  bool get canSeeChild => role == 'parent' || role == 'guardian';

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final first = String.fromCharCode(parts.first.runes.first);
    if (parts.length == 1) return first.toUpperCase();
    return (first + String.fromCharCode(parts.last.runes.first)).toUpperCase();
  }

  factory FamilyMemberInfo.fromJson(Map<String, dynamic> j) => FamilyMemberInfo(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        role: (j['role'] as String?) ?? 'guardian',
        avatarUrl: j['avatar_thumb_url'] as String?,
        relationship: j['relationship'] as String?,
      );
}

/// API calls of the onboarding feature (docs/CONTRACTS/openapi.yaml).
class OnboardingRepository {
  OnboardingRepository(this._api);
  final ApiClient _api;

  /// POST /me/consents
  Future<void> postConsent({required String type, required bool granted, Map<String, Object?>? details}) =>
      _api.post<dynamic>('/me/consents', data: consentBody(type: type, granted: granted, details: details));

  /// GET /families/{familyId} -> members with name, avatar and role.
  Future<List<FamilyMemberInfo>> familyMembers(String familyId) async {
    final raw = await _api.get<dynamic>('/families/${Uri.encodeComponent(familyId)}');
    final family = raw is Map && raw['family'] is Map ? raw['family'] as Map : raw;
    final members = family is Map ? family['members'] : null;
    if (members is! List) return const [];
    return [for (final m in members) if (m is Map) FamilyMemberInfo.fromJson(m.cast<String, dynamic>())];
  }
}

/// Request body for POST /me/consents (kept pure for tests).
Map<String, Object?> consentBody({required String type, required bool granted, Map<String, Object?>? details}) => {
      'type': type,
      'version': consentVersion,
      'granted': granted,
      'details': ?details,
    };

final onboardingRepositoryProvider = Provider<OnboardingRepository>((ref) => OnboardingRepository(ref.watch(apiClientProvider)));
