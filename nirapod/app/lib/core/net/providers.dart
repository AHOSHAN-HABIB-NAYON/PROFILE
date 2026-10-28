import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../session/session.dart';
import 'api_client.dart';
import 'token_store.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

/// One API client for the app. When a refresh fails the session ends and the router returns to Login.
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(
      tokens: ref.watch(tokenStoreProvider),
      onSessionExpired: () => ref.read(sessionControllerProvider.notifier).signedOutLocally(),
    ));
