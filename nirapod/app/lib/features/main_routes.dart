import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'family/ui/family_screen.dart';
import 'family/ui/member_screen.dart';
import 'home/home_screen.dart';
import 'map/map_screen.dart';
import 'me/me_screen.dart';

/// Phase 2 screens (Home, Map, Profile, Family, Member, invite, report misuse), keyed by navigation id.
final mainScreens = <String, Widget Function(GoRouterState state)>{
  'home': (_) => const HomeScreen(),
  'map': (_) => const MapScreen(),
  'profile': (_) => const MeScreen(),
  'family': (_) => const FamilyScreen(),
  'invite': (_) => const FamilyScreen(),
  'member': (st) => MemberScreen(memberId: st.pathParameters['id'] ?? ''),
  'report_misuse': (_) => const ReportMisuseScreen(),
};
