import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/prefs/prefs.dart';
import 'package:nirapod/core/session/session.dart';
import 'package:nirapod/features/onboarding/data/onboarding_repository.dart';
import 'package:nirapod/features/onboarding/onboarding_flow.dart';
import 'package:nirapod/features/onboarding/screens/child_screens.dart';

import '../helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('splashDestination', () {
    const adult = AuthUser(id: 'a', role: AppRole.parent);
    const child = AuthUser(id: 'c', role: AppRole.child, authProvider: 'device');

    test('signed in -> home / child_home / profile_setup', () {
      expect(splashDestination(session: const SignedIn(adult), onboardingDone: false, role: null), 'home');
      expect(splashDestination(session: const SignedIn(child), onboardingDone: true, role: RoleChoice.parent), 'child_home');
      expect(splashDestination(session: const SignedIn(adult, needsProfileSetup: true), onboardingDone: true, role: null), 'profile_setup');
    });

    test('signed out + onboarding done -> remembered login page', () {
      for (final (role, id) in [
        (RoleChoice.parent, 'login_parent'),
        (RoleChoice.probashi, 'login_probashi'),
        (RoleChoice.member, 'login_member'),
        (RoleChoice.child, 'child_code'),
        (null, 'role'),
      ]) {
        expect(splashDestination(session: const SignedOut(), onboardingDone: true, role: role), id, reason: '$role');
      }
    });

    test('first launch -> welcome (role alone does not skip onboarding)', () {
      expect(splashDestination(session: const SignedOut(), onboardingDone: false, role: null), 'welcome');
      expect(splashDestination(session: const SignedOut(), onboardingDone: false, role: RoleChoice.child), 'welcome');
      expect(splashDestination(session: const SessionUnknown(), onboardingDone: false, role: null), 'welcome');
    });
  });

  test('resume step: next unfinished permission page, then role', () {
    expect(resumeScreenFor(0), 'perm_notifications');
    expect(resumeScreenFor(1), 'perm_how_location');
    expect(resumeScreenFor(2), 'perm_location');
    expect(resumeScreenFor(3), 'role');
    expect(resumeScreenFor(9), 'role');
    expect(resumeScreenFor(-1), 'perm_notifications');
  });

  test('progress is stored in prefs, only moves forward, and survives a restart', () async {
    var container = ProviderContainer(overrides: await overrides());
    var p = container.read(onboardingProgressProvider);
    expect(p.completedSteps, 0);
    await p.completePage('perm_notifications');
    await p.completePage('perm_how_location');
    await p.completePage('perm_notifications'); // going back does not lose progress
    expect(p.completedSteps, 2);
    expect(p.resumeScreen, 'perm_location');
    final prefs = container.read(prefsProvider);
    expect(prefs.getInt(PrefKeys.onboardingStep), 2);
    container.dispose();

    // "Restart": a new container over the same stored values.
    container = ProviderContainer(overrides: await overrides(prefs: {PrefKeys.onboardingStep: 2}));
    p = container.read(onboardingProgressProvider);
    expect(p.resumeScreen, 'perm_location');
    expect(p.done, isFalse);
    await p.chooseRole(RoleChoice.member);
    expect(p.done, isTrue);
    expect(p.role, RoleChoice.member);
    container.dispose();
  });

  test('consent request body matches the contract', () {
    expect(consentBody(type: ConsentType.backgroundLocationDisclosure, granted: false), {
      'type': 'background_location_disclosure',
      'version': '2026-10',
      'granted': false,
    });
    expect(
      consentBody(type: ConsentType.childLocationSharing, granted: true, details: {'shown_member_ids': ['m1']}),
      {'type': 'child_location_sharing', 'version': '2026-10', 'granted': true, 'details': {'shown_member_ids': ['m1']}},
    );
  });

  test('family member parsing, initials and visibility', () {
    final m = FamilyMemberInfo.fromJson({'id': 'm1', 'name': 'Mina Rahman', 'role': 'parent', 'avatar_thumb_url': null});
    expect(m.initials, 'MR');
    expect(m.canSeeChild, isTrue);
    expect(FamilyMemberInfo.fromJson({'id': 'm2', 'name': 'রাফি', 'role': 'child'}).canSeeChild, isFalse);
    expect(FamilyMemberInfo.fromJson({'id': 'm3', 'name': '', 'role': 'guardian'}).initials, '?');
  });

  test('phone brand guide preselection', () {
    expect(brandFor('Xiaomi'), PhoneBrand.xiaomi);
    expect(brandFor('Redmi'), PhoneBrand.xiaomi);
    expect(brandFor('OPPO'), PhoneBrand.oppo);
    expect(brandFor('vivo'), PhoneBrand.vivo);
    expect(brandFor('realme'), PhoneBrand.realme);
    expect(brandFor('samsung'), PhoneBrand.samsung);
    expect(brandFor('Google'), PhoneBrand.other);
    expect(brandFor(null), PhoneBrand.other);
  });
}
