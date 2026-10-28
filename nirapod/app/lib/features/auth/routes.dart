import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Screens owned by the auth + profile feature, keyed by screen id from docs/CONTRACTS/navigation.json.
/// Ids: login_parent, login_probashi, login_member, child_code, register, verify_email, forgot_email,
/// forgot_code, forgot_new, forgot_done, profile_setup, child_code_generate, sessions, legal_privacy, legal_terms.
final authScreens = <String, Widget Function(GoRouterState state)>{};
