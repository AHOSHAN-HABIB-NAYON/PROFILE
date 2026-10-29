import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/icons/app_icons.g.dart';
import '../../../core/net/api_error.dart';
import '../../../core/prefs/prefs.dart';
import '../../../core/session/session.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/tz/tz_provider.dart';
import '../../../core/widgets/auth_scaffold.dart';
import '../../../core/widgets/code_cells.dart';
import '../../../core/widgets/fields.dart';
import '../../../nav/router.dart';
import '../data/auth_api.dart';
import '../data/auth_errors.dart';
import '../data/auth_service.dart';
import '../data/validators.dart';
import '../photo/avatar_picker.dart';
import '../photo/photo_controller.dart';
import '../photo/photo_flow.dart';
import '../profile/detection.dart';
import '../profile/travel_service.dart';
import 'auth_widgets.dart';
import 'same_language.dart';

/// Child joins with the family code: six alphanumeric cells, first name, optional photo, no email or
/// password. Country and time zone are detected silently and sent (a parent can edit them).
class ChildCodeScreen extends ConsumerStatefulWidget {
  const ChildCodeScreen({super.key});

  @override
  ConsumerState<ChildCodeScreen> createState() => _ChildCodeScreenState();
}

class _ChildCodeScreenState extends ConsumerState<ChildCodeScreen> {
  final _name = TextEditingController();
  String _code = '';
  bool _remember = true;
  bool _submitted = false;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(ref.read(prefsProvider).setString(PrefKeys.roleChoice, RoleChoice.child.name));
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _codeOk => isValidFamilyCode(normalizeFamilyCode(_code));
  String? get _nameClean => cleanName(_name.text);

  Future<void> _join() async {
    setState(() {
      _submitted = true;
      _error = null;
    });
    if (!_codeOk || _nameClean == null) return;
    setState(() => _loading = true);
    try {
      final d = await detectCountryZone(
        tz: ref.read(tzDataProvider),
        readZone: ref.read(deviceZoneReaderProvider),
        readRegion: ref.read(localeRegionReaderProvider),
        ipHint: ref.read(authApiProvider).geoHint,
      );
      await ref.read(authServiceProvider).joinAsChild(
            code: normalizeFamilyCode(_code),
            firstName: _nameClean!,
            remember: _remember,
            timezone: d.timezone,
            countryIso2: d.country,
          );
      // Photo upload runs in the background and never blocks joining.
      unawaited(ref.read(photoControllerProvider.notifier).upload());
      if (!mounted) return;
      context.go(locationFor('child_perm_background'));
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = childCodeErrorKey(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final [s, p] = sameLanguageStrings(ref, const ['child_code', 'profile_setup']);
    final photo = ref.watch(photoControllerProvider);
    final c = context.colors;
    return AuthScaffold(
      backLabel: s.t('common.back'),
      illustration: BrandAssets.illustrationChild,
      body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        AuthHeading(title: s.t('child.code_title'), subtitle: s.t('child.code_body')),
        CodeCells(
          alphanumeric: true,
          enabled: !_loading,
          error: (_submitted && !_codeOk) || _error == 'child.err_code' || _error == 'child.err_expired',
          cellLabel: (n) => s.t('verify.digit', {'n': n}),
          onChanged: (v) => setState(() {
            _code = v;
            if (_error != null) _error = null;
          }),
          onCompleted: (v) => setState(() => _code = v),
        ),
        if (_submitted && !_codeOk) ...[const SizedBox(height: Space.xs), InlineMessage(s.t('child.err_code'))],
        const SizedBox(height: Space.lg),
        AppTextField(
          label: s.t('child.first_name'),
          controller: _name,
          icon: AppIcons.user,
          maxLength: 60,
          enabled: !_loading,
          textCapitalization: TextCapitalization.words,
          autofillHints: const [AutofillHints.givenName],
          error: _submitted && _nameClean == null ? s.t('child.err_name') : null,
          textInputAction: TextInputAction.done,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: Space.lg),
        Row(children: [
          AvatarPicker(
            size: 72,
            local: photo.local,
            name: _name.text,
            semanticLabel: s.t('child.add_photo'),
            onTap: _loading ? null : () => runPhotoFlow(context, ref, p, canRemove: photo.local != null, upload: false),
          ),
          const SizedBox(width: Space.md),
          Expanded(child: Text(s.t('child.add_photo'), style: Theme.of(context).textTheme.bodyMedium!.copyWith(color: c.muted))),
        ]),
        const SizedBox(height: Space.sm),
        MergeSemantics(
          child: Row(children: [
            SizedBox.square(
              dimension: Sizes.minTouchTarget,
              child: Checkbox(
                value: _remember,
                activeColor: c.primaryFill,
                onChanged: _loading ? null : (v) => setState(() => _remember = v ?? true),
              ),
            ),
            const SizedBox(width: Space.xxs),
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _loading ? null : () => setState(() => _remember = !_remember),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(s.t('child.remember'), style: Theme.of(context).textTheme.bodyMedium),
                ),
              ),
            ),
          ]),
        ),
        if (_error != null) ...[const SizedBox(height: Space.xs), InlineMessage(s.t(_error!))],
        const SizedBox(height: Space.lg),
        AppButton(label: s.t('child.join'), large: true, loading: _loading, onPressed: _loading ? null : _join),
        const SizedBox(height: Space.lg),
        Center(child: Text(s.t('child.footer'), style: Theme.of(context).textTheme.bodySmall!.copyWith(color: c.muted))),
      ]),
    );
  }
}
