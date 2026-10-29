import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/languages.dart';
import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/net/api_error.dart';
import '../../../core/prefs/prefs.dart';
import '../../../core/session/session.dart';
import '../../../core/state/buttons.dart';
import '../../../core/state/skeleton.dart';
import '../../../core/state/state_views.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/tz/tz_provider.dart';
import '../../../core/tz/tz_utils.dart';
import '../../../core/widgets/auth_scaffold.dart';
import '../../../core/widgets/fields.dart';
import '../../../nav/router.dart';
import '../data/auth_api.dart';
import '../data/auth_flow.dart';
import '../data/validators.dart';
import '../photo/avatar_picker.dart';
import '../photo/photo_controller.dart';
import '../photo/photo_flow.dart';
import '../photo/photo_sheet.dart' show googlePhoto, PickDone;
import '../ui/auth_widgets.dart';
import 'countries.dart';
import 'detection.dart';
import 'pickers.dart';
import 'profile_repo.dart';
import 'travel_service.dart';

/// What happens after "Continue", by the role picked on "Who are you?" (the server role wins:
/// a guardian is treated as "other family member").
enum SetupNext { parentFamily, probashiChoice, home }

SetupNext nextAfterSetup(RoleChoice? choice, AuthUser user) {
  if (user.role == AppRole.guardian) return SetupNext.home;
  return switch (choice) {
    RoleChoice.probashi => user.familyId == null ? SetupNext.probashiChoice : SetupNext.home,
    RoleChoice.member => SetupNext.home,
    _ => SetupNext.parentFamily, // creates the family if none, then the child code
  };
}

/// "Complete your profile" (once after registration / first Google sign-up; also reachable from Profile).
class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  late final TextEditingController _name;
  String? _country;
  String? _zone;
  String _source = 'manual';
  bool _autoDetected = false;
  bool _confirmZone = false;
  bool _tzAuto = true;
  bool _detecting = true;
  bool _submitted = false;
  bool _saving = false;
  bool _savedOffline = false;
  String? _error;
  bool _showProbashi = false;
  bool _showInvite = false;
  final _invite = TextEditingController();
  String? _inviteError;
  DateTime _now = DateTime.now();
  Timer? _tick;

  AuthUser? get _user {
    final s = ref.read(sessionControllerProvider);
    return s is SignedIn ? s.user : null;
  }

  @override
  void initState() {
    super.initState();
    final u = _user;
    final flow = ref.read(authFlowProvider);
    _name = TextEditingController(text: u?.name ?? flow.googleName ?? '');
    _tzAuto = u?.tzAuto ?? true;
    _schedule();
    unawaited(_detect());
    final g = flow.googlePhotoUrl;
    if (g != null && (u?.avatarUrl == null) && ref.read(photoControllerProvider).local == null) unawaited(_prefillGooglePhoto(g));
  }

  void _schedule() {
    _tick = Timer(untilNextMinute(DateTime.now()), () {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
      _schedule();
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _name.dispose();
    _invite.dispose();
    super.dispose();
  }

  Future<void> _prefillGooglePhoto(String url) async {
    final r = await googlePhoto(url);
    if (r is PickDone && mounted) await ref.read(photoControllerProvider.notifier).setPhoto(r.jpeg);
  }

  Future<void> _detect() async {
    final u = _user;
    final tz = ref.read(tzDataProvider);
    if (u?.countryIso2 != null && tz.isValidZone(u?.timezone)) {
      setState(() {
        _country = u!.countryIso2;
        _zone = u.timezone;
        _source = u.detectedSource ?? 'manual';
        _autoDetected = _source != 'manual';
        _detecting = false;
      });
      return;
    }
    final d = await detectCountryZone(
      tz: tz,
      readZone: ref.read(deviceZoneReaderProvider),
      readRegion: ref.read(localeRegionReaderProvider),
      ipHint: ref.read(authApiProvider).geoHint,
    );
    if (!mounted) return;
    setState(() {
      _country = d.country;
      _zone = d.timezone;
      _source = d.source?.name ?? 'manual';
      _autoDetected = d.source != null;
      _confirmZone = d.needsZoneConfirmation;
      _detecting = false;
    });
  }

  /// Pickers save immediately (offline: kept on this phone and synced later).
  void _saveField(Map<String, dynamic> f) {
    unawaited(ref.read(profileRepoProvider).save(f).then((o) {
      if (o == SaveOutcome.savedOffline && mounted) setState(() => _savedOffline = true);
    }).catchError((Object _) {}));
  }

  Future<void> _pickCountry(Strings s) async {
    final names = await ref.read(countryNamesProvider.future);
    if (!mounted) return;
    final cc = await showCountryPicker(context, strings: s, names: names, selected: _country);
    if (cc == null || !mounted) return;
    final tz = ref.read(tzDataProvider);
    final zones = tz.zonesForCountry(cc);
    setState(() {
      _country = cc;
      _source = 'manual';
      _autoDetected = false;
      if (_zone == null || tz.countryForZone(_zone!) != cc) {
        _zone = zones.isEmpty ? _zone : zones.first;
        _confirmZone = zones.length > 1;
      }
    });
    _saveField({'country_iso2': cc, 'timezone': ?_zone, 'detected_source': 'manual'});
    if (_confirmZone) await _pickZone(s);
  }

  Future<void> _pickZone(Strings s) async {
    final names = await ref.read(countryNamesProvider.future);
    if (!mounted) return;
    final z = await showZonePicker(context, strings: s, names: names, tz: ref.read(tzDataProvider), selected: _zone, country: _country);
    if (z == null || !mounted) return;
    final cc = ref.read(tzDataProvider).countryForZone(z);
    setState(() {
      _zone = z;
      _confirmZone = false;
      _source = 'manual';
      _autoDetected = false;
      if (cc != null) _country = cc;
    });
    // A manual choice wins until the device zone really changes.
    unawaited(ref.read(travelWatcherProvider).noteManualChoice());
    _saveField({'timezone': z, 'country_iso2': ?cc, 'detected_source': 'manual'});
  }

  Future<void> _continue() async {
    final name = cleanName(_name.text);
    setState(() {
      _submitted = true;
      _error = null;
    });
    if (name == null) return;
    setState(() => _saving = true);
    try {
      final outcome = await ref.read(profileRepoProvider).save({
        'name': name,
        'country_iso2': ?_country,
        'timezone': ?_zone,
        'tz_auto': _tzAuto,
        'detected_source': _source,
        'language': ref.read(languageProvider).code,
      });
      if (_source != 'manual') await ref.read(travelWatcherProvider).rememberDeviceZone(_zone);
      if (outcome == SaveOutcome.savedOffline) _savedOffline = true;
      ref.read(sessionControllerProvider.notifier).profileCompleted();
      ref.read(authFlowProvider.notifier).clear();
      if (!mounted) return;
      if (_savedOffline) _snack(ref.read(screenStringsProvider('profile_setup')).t('profile.saved_offline'));
      final user = _user;
      final next = user == null ? SetupNext.home : nextAfterSetup(roleChoiceFromName(ref.read(prefsProvider).getString(PrefKeys.roleChoice)), user);
      switch (next) {
        case SetupNext.home:
          context.go(locationFor('home'));
        case SetupNext.probashiChoice:
          setState(() {
            _saving = false;
            _showProbashi = true;
          });
        case SetupNext.parentFamily:
          await _createFamilyAndCode();
      }
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.code == 'VALIDATION_FAILED' ? 'profile.err_name' : e.messageKey;
      });
    }
  }

  Future<void> _createFamilyAndCode() async {
    final u = _user;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      if (u != null && u.familyId == null) {
        final id = await ref.read(authApiProvider).ensureFamily();
        await ref.read(profileRepoProvider).applyUser(AuthUser.fromJson({...u.toJson(), 'family_id': id, 'role': u.role?.name ?? 'parent'}));
      }
      if (mounted) context.go(locationFor('child_code_generate'));
    } on ApiError catch (e) {
      if (!mounted) return;
      if (e.kind == ApiErrorKind.network) {
        // Offline: the family is created later from Home ("Create your family" card).
        context.go(locationFor('home'));
        return;
      }
      setState(() {
        _saving = false;
        _error = e.messageKey;
      });
    }
  }

  Future<void> _joinWithInvite() async {
    final code = normalizeFamilyCode(_invite.text);
    if (code.isEmpty) {
      setState(() => _inviteError = 'profile.err_invite');
      return;
    }
    setState(() {
      _saving = true;
      _inviteError = null;
    });
    try {
      await ref.read(authApiProvider).acceptInvite(code);
      try {
        await ref.read(profileRepoProvider).applyUser(await ref.read(authApiProvider).me());
      } catch (_) {}
      if (mounted) context.go(locationFor('home'));
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _inviteError = e.kind == ApiErrorKind.network ? 'err.network' : 'profile.err_invite';
      });
    }
  }

  void _snack(String text) => ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(text)));

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('profile_setup'));
    return AuthScaffold(
      showLanguage: false,
      backLabel: s.t('common.back'),
      body: _showProbashi ? _probashi(context, s) : _form(context, s),
    );
  }

  Widget _form(BuildContext context, Strings s) {
    final photo = ref.watch(photoControllerProvider);
    final session = ref.watch(sessionControllerProvider);
    final user = session is SignedIn ? session.user : null;
    final flow = ref.watch(authFlowProvider);
    final googleUrl = flow.googlePhotoUrl ?? (user?.authProvider == 'google' ? user?.avatarUrl : null);
    final hasPhoto = photo.local != null || (!photo.removed && user?.avatarUrl != null);
    final nameError = _submitted && cleanName(_name.text) == null ? s.t('profile.err_name') : null;
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AuthHeading(title: s.t('profile.setup_title'), subtitle: s.t('profile.setup_subtitle')),
      if (_savedOffline) ...[StatusBanner(icon: AppIcons.wifiOff, text: s.t('profile.saved_offline')), const SizedBox(height: Space.md)],
      Center(
        child: AvatarPicker(
          size: Sizes.profileSetupAvatar,
          local: photo.local,
          url: photo.removed ? null : user?.avatarUrl,
          name: _name.text,
          progress: photo.status == PhotoStatus.uploading ? photo.progress : null,
          semanticLabel: s.t('profile.change_photo'),
          onTap: _saving ? null : () => runPhotoFlow(context, ref, s, googlePhotoUrl: googleUrl, canRemove: hasPhoto),
        ),
      ),
      const SizedBox(height: Space.xs),
      _photoStatus(context, s, photo, hasPhoto),
      const SizedBox(height: Space.lg),
      AppTextField(
        label: s.t('profile.full_name'),
        controller: _name,
        icon: AppIcons.user,
        maxLength: 120,
        error: nameError,
        enabled: !_saving,
        textCapitalization: TextCapitalization.words,
        autofillHints: const [AutofillHints.name],
        textInputAction: TextInputAction.done,
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: Space.lg),
      if (_detecting)
        const Shimmer(child: Column(children: [SkeletonBox(height: 64, radius: Radii.card), SizedBox(height: Space.sm), SkeletonBox(height: 64, radius: Radii.card)]))
      else ...[
        _countryRow(context, s),
        const SizedBox(height: Space.sm),
        _zoneRow(context, s),
        if (_confirmZone) ...[const SizedBox(height: Space.xs), InlineMessage(s.t('profile.tz_confirm'), error: false)],
      ],
      const SizedBox(height: Space.sm),
      MergeSemantics(
        child: SwitchListTile(
          value: _tzAuto,
          contentPadding: EdgeInsets.zero,
          activeThumbColor: c.primaryFill,
          title: Text(s.t('profile.tz_auto'), style: t.bodyLarge),
          subtitle: Text(s.t('profile.tz_auto_body'), style: t.bodySmall!.copyWith(color: c.muted)),
          onChanged: _saving
              ? null
              : (v) {
                  setState(() => _tzAuto = v);
                  _saveField({'tz_auto': v});
                },
        ),
      ),
      if (_error != null) ...[const SizedBox(height: Space.xs), InlineMessage(s.t(_error!))],
      const SizedBox(height: Space.lg),
      AppButton(label: s.t('common.continue'), large: true, loading: _saving, onPressed: _saving || _detecting ? null : _continue),
    ]);
  }

  Widget _photoStatus(BuildContext context, Strings s, PhotoState photo, bool hasPhoto) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    if (photo.status == PhotoStatus.uploading) {
      return Semantics(
        liveRegion: true,
        child: Text(s.t('profile.uploading', {'percent': (photo.progress * 100).round()}), style: t.bodySmall!.copyWith(color: c.muted), textAlign: TextAlign.center),
      );
    }
    if (photo.status == PhotoStatus.failed) {
      return Column(children: [
        Text(s.t('profile.upload_failed'), style: t.bodySmall!.copyWith(color: c.warningText), textAlign: TextAlign.center),
        TextLink(label: s.t('profile.photo_retry'), onTap: () => ref.read(photoControllerProvider.notifier).upload()),
      ]);
    }
    if (!hasPhoto) {
      return Center(child: TextLink(label: s.t('profile.skip_photo'), bold: false, onTap: () => ref.read(photoControllerProvider.notifier).skip()));
    }
    return const SizedBox.shrink();
  }

  Widget _rowCard(BuildContext context, {required String label, required Widget lead, required String title, String? sub, required VoidCallback onTap, required String a11y}) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      label: a11y,
      excludeSemantics: true,
      child: Material(
        color: c.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.card), side: BorderSide(color: c.border)),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.card),
          onTap: _saving ? null : onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.sm),
              child: Row(children: [
                lead,
                const SizedBox(width: Space.sm),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(label, style: t.labelMedium!.copyWith(color: c.muted)),
                    Text(title, style: t.bodyLarge!.copyWith(fontWeight: FontWeight.w600)),
                    if (sub != null) Text(sub, style: t.bodySmall!.copyWith(color: c.muted)),
                  ]),
                ),
                AppIcon(AppIcons.chevronRight, size: 20, color: c.muted),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _countryRow(BuildContext context, Strings s) {
    final names = ref.watch(countryNamesProvider).value;
    final cc = _country;
    final name = cc == null ? s.t('profile.set_country') : (names?.name(cc, s.language) ?? cc);
    final sub = cc != null && _autoDetected ? s.t('profile.detected') : null;
    return _rowCard(
      context,
      label: s.t('profile.country'),
      lead: cc == null ? AppIcon(AppIcons.globe, color: context.colors.muted) : Flag4x3(cc),
      title: name,
      sub: sub,
      a11y: '${s.t('profile.country')}, $name${sub == null ? '' : ', $sub'}',
      onTap: () => _pickCountry(s),
    );
  }

  Widget _zoneRow(BuildContext context, Strings s) {
    final z = _zone;
    final language = languageFor(s.language);
    final use24h = MediaQuery.alwaysUse24HourFormatOf(context);
    final time = z == null ? null : formatLocalTime(_now, z, language: language, use24h: use24h);
    final title = z == null ? s.t('profile.tz_confirm') : cityOf(z);
    final sub = z == null
        ? null
        : '${s.t('profile.utc_offset', {'offset': localizeOffset(formatUtcOffset(inZone(_now, z).timeZoneOffset), language)})} · $time';
    return _rowCard(
      context,
      label: s.t('profile.timezone'),
      lead: AppIcon(AppIcons.clock, color: context.colors.primaryText),
      title: title,
      sub: sub,
      a11y: '${s.t('profile.timezone')}, $title${sub == null ? '' : ', $sub'}',
      onTap: () => _pickZone(s),
    );
  }

  Widget _probashi(BuildContext context, Strings s) {
    final c = context.colors;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AuthHeading(title: s.t('profile.probashi_title')),
      Container(
        padding: const EdgeInsets.all(Space.md),
        decoration: BoxDecoration(
          color: c.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(Radii.card),
          border: Border.all(color: c.primary.withValues(alpha: 0.25)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AppIcon(AppIcons.crown, color: c.primaryText),
          const SizedBox(width: Space.sm),
          Expanded(child: Text(s.t('profile.probashi_gift'), style: Theme.of(context).textTheme.bodyMedium)),
        ]),
      ),
      const SizedBox(height: Space.xl),
      AppButton(label: s.t('profile.probashi_create'), large: true, loading: _saving && !_showInvite, onPressed: _saving ? null : _createFamilyAndCode),
      const SizedBox(height: Space.sm),
      AppButton(
        label: s.t('profile.probashi_join'),
        kind: ButtonKind.secondary,
        onPressed: _saving ? null : () => setState(() => _showInvite = true),
      ),
      if (_showInvite) ...[
        const SizedBox(height: Space.md),
        AppTextField(
          label: s.t('profile.invite_label'),
          controller: _invite,
          icon: AppIcons.users,
          maxLength: 8,
          textCapitalization: TextCapitalization.characters,
          error: _inviteError == null ? null : s.t(_inviteError!),
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _joinWithInvite(),
        ),
        const SizedBox(height: Space.sm),
        AppButton(label: s.t('profile.invite_join'), loading: _saving, onPressed: _saving ? null : _joinWithInvite),
      ],
      if (_error != null) ...[const SizedBox(height: Space.sm), InlineMessage(s.t(_error!))],
    ]);
  }
}
