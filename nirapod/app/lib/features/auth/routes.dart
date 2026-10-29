import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/session.dart';
import 'data/auth_service.dart';
import 'family/child_code_generate_screen.dart';
import 'legal/legal_screen.dart';
import 'profile/profile_setup_screen.dart';
import 'sessions/sessions_screen.dart';
import 'ui/child_code_screen.dart';
import 'ui/forgot_screens.dart';
import 'ui/login_screen.dart';
import 'ui/register_screen.dart';
import 'ui/verify_email_screen.dart';

/// Screens owned by the auth + profile feature, keyed by screen id from docs/CONTRACTS/navigation.json.
/// Ids: login_parent, login_probashi, login_member, child_code, register, verify_email, forgot_email,
/// forgot_code, forgot_new, forgot_done, profile_setup, child_code_generate, sessions, legal_privacy, legal_terms.
final authScreens = <String, Widget Function(GoRouterState state)>{
  'login_parent': (_) => const LoginScreen(role: RoleChoice.parent),
  'login_probashi': (_) => const LoginScreen(role: RoleChoice.probashi),
  'login_member': (_) => const LoginScreen(role: RoleChoice.member),
  'child_code': (_) => const ChildCodeScreen(),
  'register': (_) => const RegisterScreen(),
  'verify_email': (_) => const VerifyEmailScreen(),
  'forgot_email': (_) => const ForgotEmailScreen(),
  'forgot_code': (_) => const ForgotCodeScreen(),
  'forgot_new': (_) => const ForgotNewPasswordScreen(),
  'forgot_done': (_) => const ForgotDoneScreen(),
  'profile_setup': (_) => const ProfileSetupScreen(),
  'child_code_generate': (_) => const ChildCodeGenerateScreen(),
  'sessions': (_) => const SessionsScreen(),
  'legal_terms': (_) => const LegalScreen(doc: LegalDoc.terms),
  'legal_privacy': (_) => const LegalScreen(doc: LegalDoc.privacy),
};

/// Installs the auth feature's session behaviour (restore from the Keystore + /me, and sign-out that
/// revokes on the server and clears this phone). Called once from main().
void installAuthFeature() {
  SessionController.restoreImpl = (ref) => ref.read(authServiceProvider).restore();
  SessionController.signOutImpl = (ref) => ref.read(authServiceProvider).signOut();
}
