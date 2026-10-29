import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/prefs/prefs.dart';
import '../../../core/session/session.dart';

/// Values carried between the steps of the auth flows (register -> verify, forgot email -> code -> new).
class AuthFlowState {
  const AuthFlowState({this.verifyEmail, this.forgotEmail, this.forgotCode, this.googleName, this.googlePhotoUrl});
  final String? verifyEmail;
  final String? forgotEmail;
  final String? forgotCode;

  /// Prefill for profile setup after a first Google sign-up.
  final String? googleName;
  final String? googlePhotoUrl;

  AuthFlowState copyWith({String? verifyEmail, String? forgotEmail, String? forgotCode, String? googleName, String? googlePhotoUrl}) =>
      AuthFlowState(
        verifyEmail: verifyEmail ?? this.verifyEmail,
        forgotEmail: forgotEmail ?? this.forgotEmail,
        forgotCode: forgotCode ?? this.forgotCode,
        googleName: googleName ?? this.googleName,
        googlePhotoUrl: googlePhotoUrl ?? this.googlePhotoUrl,
      );
}

class AuthFlow extends Notifier<AuthFlowState> {
  @override
  AuthFlowState build() => const AuthFlowState();

  void setVerifyEmail(String email) => state = state.copyWith(verifyEmail: email);
  void setForgotEmail(String email) => state = AuthFlowState(
        verifyEmail: state.verifyEmail,
        forgotEmail: email,
        googleName: state.googleName,
        googlePhotoUrl: state.googlePhotoUrl,
      );
  void setForgotCode(String code) => state = state.copyWith(forgotCode: code);
  void setGooglePrefill({String? name, String? photoUrl}) => state = state.copyWith(googleName: name, googlePhotoUrl: photoUrl);
  void clear() => state = const AuthFlowState();
}

final authFlowProvider = NotifierProvider<AuthFlow, AuthFlowState>(AuthFlow.new);

/// Login screen id for the role picked on "Who are you?" (remembered on the device).
String loginScreenFor(RoleChoice? role) => switch (role) {
      RoleChoice.probashi => 'login_probashi',
      RoleChoice.member => 'login_member',
      _ => 'login_parent',
    };

RoleChoice? savedRoleChoiceOf(WidgetRef ref) => roleChoiceFromName(ref.read(prefsProvider).getString(PrefKeys.roleChoice));

/// Where a freshly signed-in user goes (spec Phase 1 item 6). Children never see adult screens.
String destinationAfterAuth(AuthUser user, {required bool needsProfileSetup}) {
  if (user.isChild) return 'child_home';
  if (needsProfileSetup) return 'profile_setup';
  return 'home';
}
