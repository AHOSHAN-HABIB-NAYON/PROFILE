import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'alerts/alerts_screens.dart';
import 'child/child_home_screen.dart';
import 'family/ui/family_screen.dart';
import 'family/ui/member_screen.dart';
import 'history/history_screen.dart';
import 'home/home_screen.dart';
import 'map/map_screen.dart';
import 'me/me_screen.dart';
import 'places/places_screen.dart';
import 'safety/safe_walk_screens.dart';
import 'safety/sos_screens.dart';

/// Phase 2 screens (Home, Map, Profile, Family, Member, invite, report misuse), keyed by navigation id.
final mainScreens = <String, Widget Function(GoRouterState state)>{
  'home': (_) => const HomeScreen(),
  'map': (_) => const MapScreen(),
  'history': (_) => const HistoryScreen(),
  'profile': (_) => const MeScreen(),
  'family': (_) => const FamilyScreen(),
  'invite': (_) => const FamilyScreen(),
  'member': (st) => MemberScreen(memberId: st.pathParameters['id'] ?? ''),
  'report_misuse': (_) => const ReportMisuseScreen(),
  // Phase 5: notifications.
  'alerts': (_) => const AlertsScreen(),
  'settings_notifications': (_) => const NotificationSettingsScreen(),
  // Phase 4: places and safety.
  'places': (_) => const PlacesScreen(),
  'place_edit': (st) => PlaceEditScreen(placeId: st.uri.queryParameters['id']),
  'safe_walk': (_) => const SafeWalkScreen(),
  'emergency_contacts': (_) => const EmergencyContactsScreen(),
  'child_home': (_) => const ChildHomeScreen(),
  'who_can_see_me': (_) => const WhoCanSeeMeScreen(),
  'child_sos': (_) => const ChildSosScreen(),
  'child_safe_walk': (_) => const ChildSafeWalkScreen(),
};
