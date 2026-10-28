import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/motion/motion.dart';
import '../../../core/net/api_error.dart';
import '../../../core/session/session.dart';
import '../../../core/state/buttons.dart';
import '../../../core/state/skeleton.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/widgets/brand/confetti.dart';
import '../../../core/widgets/success_check.dart';
import '../../../nav/router.dart';
import '../data/onboarding_repository.dart';
import '../data/permission_gateway.dart';
import '../demos/child_demos.dart';
import '../widgets/permission_page.dart';
import 'permission_step.dart';

const _childNs = 'child_onboarding';

void _goTo(BuildContext context, String id) => context.go(locationFor(id));

// ---------------------------------------------------------------------------------------------
// A. Background location ("Allow all the time") with the Play prominent disclosure FIRST.
// ---------------------------------------------------------------------------------------------

class ChildBackgroundScreen extends ConsumerStatefulWidget {
  const ChildBackgroundScreen({super.key});

  @override
  ConsumerState<ChildBackgroundScreen> createState() => _ChildBackgroundState();
}

class _ChildBackgroundState extends PermissionStepState<ChildBackgroundScreen> {
  @override
  OnbPermission get permission => OnbPermission.locationAlways;

  @override
  Future<void> advance() async {
    if (mounted) _goTo(context, 'child_perm_battery');
  }

  /// The disclosure is on screen above the button; tapping Continue is the explicit consent.
  /// Then: while-in-use first (if needed), then "all the time". The consent record is stored with
  /// the outcome; a network failure never blocks the child.
  @override
  Future<PermResult> request() async {
    var r = PermResult.granted;
    if (!(await gateway.status(OnbPermission.locationWhenInUse)).isGranted) {
      r = await gateway.request(OnbPermission.locationWhenInUse);
    }
    if (r.isGranted) r = await gateway.request(OnbPermission.locationAlways);
    _record(granted: true, osResult: r);
    return r;
  }

  void _record({required bool granted, PermResult? osResult}) {
    final repo = ref.read(onboardingRepositoryProvider);
    unawaited(repo
        .postConsent(
          type: ConsentType.backgroundLocationDisclosure,
          granted: granted,
          details: {'os_permission': osResult?.name ?? 'not_requested'},
        )
        .catchError((Object _) {}));
  }

  Future<void> _notNow() async {
    _record(granted: false);
    await advance();
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider(_childNs));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return PermissionPageScaffold(
      progress: StepProgress(strings: s, current: 1),
      demo: BackgroundDemo(strings: s),
      title: s.t('childperm.bg_title'),
      body: s.t('perm.how_who'),
      extra: [
        // Prominent disclosure (Google Play User Data policy), shown before any request.
        Semantics(
          container: true,
          child: Container(
            key: const Key('bg_disclosure'),
            padding: const EdgeInsets.all(Space.md),
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: BorderRadius.circular(Radii.card),
              border: Border.all(color: c.primaryText, width: 1.5),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                AppIcon(AppIcons.locationPin, size: 22, color: c.primaryText),
                const SizedBox(width: Space.xs),
                Expanded(child: Semantics(header: true, child: Text(s.t('childperm.bg_disclosure_title'), style: t.titleMedium))),
              ]),
              const SizedBox(height: Space.xs),
              Text(s.t('childperm.bg_disclosure'), style: t.bodyMedium),
            ]),
          ),
        ),
        if (showDenied)
          DeniedPanel(
            title: s.t('perm.denied_title'),
            body: s.t('childperm.bg_denied'),
            settingsLabel: s.t('common.open_settings'),
            onOpenSettings: openSettings,
          )
        else if (granted)
          GrantedNote(label: s.t('childperm.bg_granted'))
        else
          _HintArrow(text: s.t('childperm.bg_hint')),
      ],
      primaryLabel: s.t('common.continue'),
      onPrimary: onContinue,
      busy: busy,
      notNowLabel: showDenied ? null : s.t('common.not_now'),
      onNotNow: _notNow,
    );
  }
}

/// "On the next screen choose 'Allow all the time'" with a gently nudging arrow.
class _HintArrow extends StatefulWidget {
  const _HintArrow({required this.text});
  final String text;

  @override
  State<_HintArrow> createState() => _HintArrowState();
}

class _HintArrowState extends State<_HintArrow> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (Motion.reduced(context)) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      key: const Key('bg_hint'),
      padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.sm),
      decoration: BoxDecoration(
        color: c.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(Radii.card),
      ),
      child: Row(children: [
        Expanded(child: Text(widget.text, style: Theme.of(context).textTheme.bodyMedium!.copyWith(color: c.text))),
        const SizedBox(width: Space.xs),
        RepaintBoundary(
          child: SlideTransition(
            position: CurvedAnimation(parent: _c, curve: Curves.easeInOut).drive(Tween(begin: Offset.zero, end: const Offset(0, 0.25))),
            child: AppIcon(AppIcons.chevronDown, size: 28, color: c.primaryText),
          ),
        ),
      ]),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// B. Battery: device-specific guides + system battery-optimization settings via intent.
// ---------------------------------------------------------------------------------------------

enum PhoneBrand { xiaomi, oppo, vivo, realme, samsung, other }

/// Maps a manufacturer string to a guide (Redmi/POCO are Xiaomi; OnePlus uses the Oppo guide).
PhoneBrand brandFor(String? manufacturer) {
  final m = (manufacturer ?? '').toLowerCase();
  if (m.contains('xiaomi') || m.contains('redmi') || m.contains('poco')) return PhoneBrand.xiaomi;
  if (m.contains('oppo') || m.contains('oneplus')) return PhoneBrand.oppo;
  if (m.contains('vivo') || m.contains('iqoo')) return PhoneBrand.vivo;
  if (m.contains('realme')) return PhoneBrand.realme;
  if (m.contains('samsung')) return PhoneBrand.samsung;
  return PhoneBrand.other;
}

class ChildBatteryScreen extends ConsumerStatefulWidget {
  const ChildBatteryScreen({super.key});

  @override
  ConsumerState<ChildBatteryScreen> createState() => _ChildBatteryState();
}

class _ChildBatteryState extends ConsumerState<ChildBatteryScreen> {
  PhoneBrand _brand = PhoneBrand.other;

  @override
  void initState() {
    super.initState();
    unawaited(ref.read(permissionGatewayProvider).deviceManufacturer().then((m) {
      if (mounted && m != null) setState(() => _brand = brandFor(m));
    }));
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider(_childNs));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final steps = s.t('childperm.brand_${_brand == PhoneBrand.other ? 'other' : _brand.name}').split(' > ');
    return PermissionPageScaffold(
      progress: StepProgress(strings: s, current: 2),
      demo: BatteryDemo(strings: s),
      title: s.t('childperm.battery_title'),
      body: s.t('childperm.battery_body'),
      extra: [
        Text(s.t('childperm.battery_pick'), style: t.titleMedium),
        Wrap(
          spacing: Space.xs,
          runSpacing: Space.xs,
          children: [
            for (final b in PhoneBrand.values)
              _BrandChip(
                key: Key('brand_${b.name}'),
                label: s.t('childperm.brand_name_${b.name}'),
                selected: b == _brand,
                onTap: () => setState(() => _brand = b),
              ),
          ],
        ),
        Container(
          key: const Key('brand_guide'),
          padding: const EdgeInsets.all(Space.md),
          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Radii.card), border: Border.all(color: c.border)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(s.t('childperm.battery_steps'), style: t.bodySmall),
            const SizedBox(height: Space.xs),
            for (var i = 0; i < steps.length; i++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: Space.xxs),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(
                    width: 26,
                    height: 26,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: i == steps.length - 1 ? c.primaryFill : c.primary.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      localDigits(s, i + 1),
                      style: t.labelMedium!.copyWith(color: i == steps.length - 1 ? c.onPrimaryFill : c.primaryText),
                    ),
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(child: Padding(padding: const EdgeInsets.only(top: 2), child: Text(steps[i].trim(), style: t.bodyMedium))),
                ]),
              ),
          ]),
        ),
        AppButton(
          key: const Key('open_battery'),
          label: s.t('childperm.battery_open'),
          kind: ButtonKind.secondary,
          leading: AppIcon(AppIcons.battery, size: 20, color: c.primaryText),
          onPressed: () => ref.read(permissionGatewayProvider).openBatterySettings(),
        ),
      ],
      primaryLabel: s.t('common.continue'),
      onPrimary: () => _goTo(context, 'child_consent'),
      notNowLabel: s.t('common.not_now'),
      onNotNow: () => _goTo(context, 'child_consent'),
    );
  }
}

class _BrandChip extends StatelessWidget {
  const _BrandChip({super.key, required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: PressScale(
        onTap: onTap,
        haptic: false,
        child: AnimatedContainer(
          duration: Motion.of(context, Motion.navIconMorph),
          constraints: const BoxConstraints(minHeight: Sizes.minTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: Space.md),
          decoration: BoxDecoration(
            color: selected ? c.primary.withValues(alpha: 0.12) : c.surface,
            borderRadius: BorderRadius.circular(Radii.pill),
            border: Border.all(color: selected ? c.primaryText : c.border, width: selected ? 1.5 : 1),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (selected) ...[AppIcon(AppIcons.check, size: 16, color: c.primaryText), const SizedBox(width: 4)],
            Flexible(
              child: Text(label, style: Theme.of(context).textTheme.labelLarge!.copyWith(color: selected ? c.primaryText : c.text)),
            ),
          ]),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// C. Consent: what is shared and which family members can see it.
// ---------------------------------------------------------------------------------------------

class ChildConsentScreen extends ConsumerStatefulWidget {
  const ChildConsentScreen({super.key});

  @override
  ConsumerState<ChildConsentScreen> createState() => _ChildConsentState();
}

enum _Load { loading, ready, offline, error }

class _ChildConsentState extends ConsumerState<ChildConsentScreen> {
  _Load _load = _Load.loading;
  List<FamilyMemberInfo> _members = const [];
  bool _saving = false;
  bool _saveFailed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_fetch());
  }

  Future<void> _fetch() async {
    setState(() => _load = _Load.loading);
    final session = ref.read(sessionControllerProvider);
    final familyId = session is SignedIn ? session.user.familyId : null;
    if (familyId == null) {
      setState(() => _load = _Load.error);
      return;
    }
    try {
      final all = await ref.read(onboardingRepositoryProvider).familyMembers(familyId);
      if (!mounted) return;
      setState(() {
        _members = all.where((m) => m.canSeeChild).toList();
        _load = _Load.ready;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _load = ApiError.from(e).kind == ApiErrorKind.network ? _Load.offline : _Load.error);
    }
  }

  Future<void> _understand() async {
    setState(() {
      _saving = true;
      _saveFailed = false;
    });
    try {
      await ref.read(onboardingRepositoryProvider).postConsent(
        type: ConsentType.childLocationSharing,
        granted: true,
        details: {'shown_member_ids': [for (final m in _members) m.id]},
      );
      if (mounted) _goTo(context, 'child_all_set');
    } catch (_) {
      if (mounted) setState(() => _saveFailed = true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider(_childNs));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.md, Space.screenHorizontal, Space.md),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                StepProgress(strings: s, current: 3),
                const SizedBox(height: Space.xl),
                Semantics(header: true, child: Text(s.t('childperm.consent_title'), style: t.headlineSmall)),
                const SizedBox(height: Space.md),
                _InfoRow(icon: AppIcons.locationPin, text: s.t('childperm.consent_shared')),
                const SizedBox(height: Space.sm),
                _InfoRow(icon: AppIcons.eye, text: s.t('childperm.consent_visible')),
                const SizedBox(height: Space.xl),
                Text(s.t('childperm.consent_who'), style: t.titleMedium),
                const SizedBox(height: Space.sm),
                _membersSection(s),
                if (_saveFailed) ...[
                  const SizedBox(height: Space.md),
                  _ErrorLine(text: s.t('childperm.consent_save_error')),
                ],
              ]),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.md),
            child: SizedBox(
              width: double.infinity,
              child: AppButton(
                key: const Key('consent_ok'),
                label: s.t('childperm.consent_ok'),
                large: true,
                loading: _saving,
                onPressed: _load == _Load.ready ? _understand : null,
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _membersSection(Strings s) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    switch (_load) {
      case _Load.loading:
        return Semantics(label: s.t('common.loading'), liveRegion: true, child: const SkeletonList(rows: 2));
      case _Load.offline:
      case _Load.error:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _ErrorLine(
            key: const Key('consent_load_error'),
            icon: _load == _Load.offline ? AppIcons.wifiOff : AppIcons.alertCircle,
            text: s.t(_load == _Load.offline ? 'childperm.consent_offline' : 'childperm.consent_error'),
          ),
          const SizedBox(height: Space.sm),
          AppButton(key: const Key('consent_retry'), label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: _fetch),
        ]);
      case _Load.ready:
        if (_members.isEmpty) {
          return _InfoRow(icon: AppIcons.users, text: s.t('childperm.consent_empty'));
        }
        return Column(children: [
          for (final m in _members)
            Semantics(
              container: true,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: Space.xs),
                child: Row(children: [
                  _Avatar(member: m),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(m.name, style: t.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                      Text(
                        [
                          s.t(m.role == 'parent' ? 'childperm.role_parent' : 'childperm.role_guardian'),
                          if (m.relationship != null && m.relationship!.isNotEmpty) m.relationship!,
                        ].join(' · '),
                        style: t.bodySmall!.copyWith(color: c.muted),
                      ),
                    ]),
                  ),
                ]),
              ),
            ),
        ]);
    }
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.member});
  final FamilyMemberInfo member;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final initials = Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.14), shape: BoxShape.circle),
      child: Text(member.initials, style: Theme.of(context).textTheme.titleMedium!.copyWith(color: c.primaryText)),
    );
    final url = member.avatarUrl;
    if (url == null || !url.startsWith('https://')) return ExcludeSemantics(child: initials);
    return ExcludeSemantics(
      child: ClipOval(
        child: Image.network(url, width: 48, height: 48, fit: BoxFit.cover, errorBuilder: (_, _, _) => initials),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});
  final String icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AppIcon(icon, size: 22, color: context.colors.primaryText),
        const SizedBox(width: Space.sm),
        Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium)),
      ]);
}

class _ErrorLine extends StatelessWidget {
  const _ErrorLine({super.key, required this.text, this.icon = AppIcons.alertCircle});
  final String text;
  final String icon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      liveRegion: true,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AppIcon(icon, size: 20, color: c.warningText),
        const SizedBox(width: Space.xs),
        Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium)),
      ]),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Final: "You're all set" with light confetti.
// ---------------------------------------------------------------------------------------------

class ChildAllSetScreen extends ConsumerWidget {
  const ChildAllSetScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider(_childNs));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Scaffold(
      backgroundColor: c.background,
      body: Stack(children: [
        const Positioned.fill(child: IgnorePointer(child: ExcludeSemantics(child: RepaintBoundary(child: ConfettiBurst())))),
        SafeArea(
          child: Column(children: [
            Expanded(
              child: LayoutBuilder(
                builder: (context, box) => SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: box.maxHeight),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      SuccessCheck(size: 96, semanticLabel: s.t('childperm.allset_title')),
                      const SizedBox(height: Space.xl),
                      Semantics(header: true, child: Text(s.t('childperm.allset_title'), style: t.headlineSmall, textAlign: TextAlign.center)),
                      const SizedBox(height: Space.xs),
                      Text(s.t('childperm.allset_body'), style: t.bodyLarge!.copyWith(color: c.muted), textAlign: TextAlign.center),
                    ]),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.lg),
              child: SizedBox(
                width: double.infinity,
                child: AppButton(key: const Key('allset_continue'), label: s.t('common.continue'), large: true, onPressed: () => _goTo(context, 'child_home')),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}
