import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/log/log.dart';
import '../../../core/net/api_error.dart';
import '../../../core/session/session.dart';
import '../data/auth_api.dart';
import '../profile/profile_repo.dart';

enum PhotoStatus { none, uploading, uploaded, failed }

class PhotoState {
  const PhotoState({this.local, this.status = PhotoStatus.none, this.progress = 0, this.removed = false});

  /// The processed 512x512 JPEG kept on this phone until the upload succeeds.
  final Uint8List? local;
  final PhotoStatus status;
  final double progress;

  /// The user chose "Remove photo" (hide any server avatar).
  final bool removed;
}

/// Uploads the profile photo with progress. A failure never blocks the flow: the local image stays and
/// the upload is retried in the background (and by the Retry button).
class PhotoController extends Notifier<PhotoState> {
  static Duration retryDelay = const Duration(seconds: 30);
  static const maxAutoRetries = 3;

  Timer? _retry;
  int _attempts = 0;

  @override
  PhotoState build() {
    ref.onDispose(() => _retry?.cancel());
    return const PhotoState();
  }

  /// Sets a newly cropped photo and starts uploading it. [upload] false keeps it local (e.g. a child
  /// before the session exists); call [upload] later.
  Future<void> setPhoto(Uint8List jpeg, {bool upload = true}) async {
    _retry?.cancel();
    _attempts = 0;
    state = PhotoState(local: jpeg);
    if (upload) await this.upload();
  }

  Future<void> upload() async {
    final bytes = state.local;
    if (bytes == null) return;
    _retry?.cancel();
    state = PhotoState(local: bytes, status: PhotoStatus.uploading);
    try {
      final res = await ref.read(authApiProvider).uploadPhoto(bytes, onProgress: (f) {
        if (state.status == PhotoStatus.uploading) state = PhotoState(local: bytes, status: PhotoStatus.uploading, progress: f);
      });
      state = PhotoState(local: bytes, status: PhotoStatus.uploaded, progress: 1);
      await _applyAvatar(res['avatar_url'] as String?, res['avatar_thumb_url'] as String?);
    } on ApiError catch (e) {
      Log.warn('photo', 'upload failed: ${e.kind.name}');
      state = PhotoState(local: bytes, status: PhotoStatus.failed);
      if (_attempts < maxAutoRetries) {
        _attempts++;
        _retry = Timer(retryDelay * _attempts, () => unawaited(upload()));
      }
    }
  }

  Future<void> remove() async {
    _retry?.cancel();
    state = const PhotoState(removed: true);
    try {
      await ref.read(authApiProvider).deletePhoto();
      await _applyAvatar(null, null);
    } catch (_) {
      // Best effort; the server photo is removed with the next successful upload or by retry later.
    }
  }

  /// Skip photo for now: forget anything local, keep whatever the server has.
  void skip() {
    _retry?.cancel();
    state = const PhotoState();
  }

  Future<void> _applyAvatar(String? url, String? thumb) async {
    final s = ref.read(sessionControllerProvider);
    if (s is! SignedIn) return;
    final user = AuthUser.fromJson({...s.user.toJson(), 'avatar_url': url, 'avatar_thumb_url': thumb});
    await ref.read(profileRepoProvider).applyUser(user);
  }
}

final photoControllerProvider = NotifierProvider<PhotoController, PhotoState>(PhotoController.new);
