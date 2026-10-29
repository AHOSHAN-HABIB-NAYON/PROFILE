import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/numerals.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/net/api_error.dart';
import '../../core/session/session.dart';
import '../../core/state/buttons.dart';
import '../../core/state/state_views.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/tz/tz_utils.dart';
import '../../core/widgets/fields.dart';
import '../../nav/router.dart';
import '../family/data/family_repo.dart';
import '../family/data/realtime.dart';
import 'data/safety_repo.dart';

const walkChoices = [10, 15, 20, 30, 45, 60];

/// Child "Heading home": pick when you will arrive, start; while active: expected time, "I arrived", end.
class ChildSafeWalkScreen extends ConsumerStatefulWidget {
  const ChildSafeWalkScreen({super.key});
  @override
  ConsumerState<ChildSafeWalkScreen> createState() => _ChildSafeWalkScreenState();
}

class _ChildSafeWalkScreenState extends ConsumerState<ChildSafeWalkScreen> {
  int _minutes = 20;
  bool _busy = false;
  String? _error;

  Future<void> _run(Future<void> Function() f) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await f();
      ref.invalidate(myTripProvider);
    } catch (e) {
      if (mounted) setState(() => _error = ApiError.from(e).messageKey);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('child_home'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final language = ref.watch(languageProvider);
    final session = ref.watch(sessionControllerProvider);
    final zone = session is SignedIn ? (session.user.timezone ?? 'UTC') : 'UTC';
    final tripAsync = ref.watch(myTripProvider);
    final trip = tripAsync.value;
    final places = ref.watch(placesProvider).value?.places ?? const <Place>[];
    final home = places.where((p) => p.type == 'home').firstOrNull;
    final digits = s.language == 'bn' ? 'beng' : 'latn';
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('walk.heading_home')), backgroundColor: c.background),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.screenHorizontal),
          child: tripAsync.isLoading && trip == null
              ? const Center(child: CircularProgressIndicator())
              : trip == null
                  ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Expanded(
                        child: ListView(children: [
                          Center(
                            child: Container(
                              width: 96,
                              height: 96,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(color: c.accent.withValues(alpha: 0.15), shape: BoxShape.circle),
                              child: AppIcon(AppIcons.walk, size: 48, color: c.primaryText),
                            ),
                          ),
                          const SizedBox(height: Space.md),
                          Text(home == null ? s.t('walk.no_home') : s.t('walk.to_place', {'place': home.name}), style: t.bodyLarge, textAlign: TextAlign.center),
                          const SizedBox(height: Space.lg),
                          Text(s.t('walk.pick_time'), style: t.titleMedium),
                          const SizedBox(height: Space.sm),
                          Wrap(spacing: Space.xs, runSpacing: Space.xs, children: [
                            for (final m in walkChoices)
                              ChoiceChip(
                                key: Key('walk_$m'),
                                label: Text(s.t('walk.minutes', {'minutes': localizeDigits('$m', digits)})),
                                selected: _minutes == m,
                                onSelected: (_) => setState(() => _minutes = m),
                              ),
                          ]),
                          if (_error != null) Padding(padding: const EdgeInsets.only(top: Space.md), child: Text(s.t(_error!), style: t.bodyMedium!.copyWith(color: c.dangerText))),
                        ]),
                      ),
                      AppButton(
                        key: const Key('walk_start'),
                        label: s.t('walk.start'),
                        large: true,
                        loading: _busy,
                        onPressed: _busy ? null : () => _run(() => ref.read(safetyRepoProvider).startTrip(_minutes)),
                      ),
                    ])
                  : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Expanded(
                        child: ListView(children: [
                          const SizedBox(height: Space.lg),
                          Center(
                            child: Container(
                              width: 96,
                              height: 96,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(color: c.success.withValues(alpha: 0.15), shape: BoxShape.circle),
                              child: AppIcon(AppIcons.shieldCheck, size: 48, color: c.successText),
                            ),
                          ),
                          const SizedBox(height: Space.md),
                          Semantics(liveRegion: true, child: Text(s.t('walk.active_title'), style: t.headlineSmall, textAlign: TextAlign.center)),
                          const SizedBox(height: Space.xs),
                          Text(
                            s.t('walk.expected', {'time': formatLocalTime(trip.expectedAt, zone, language: language, use24h: false)}),
                            style: t.titleMedium!.copyWith(color: trip.overdue ? c.dangerText : c.muted),
                            textAlign: TextAlign.center,
                          ),
                          if (trip.destinationName != null)
                            Padding(
                              padding: const EdgeInsets.only(top: Space.xs),
                              child: Text(s.t('walk.to_place', {'place': trip.destinationName!}), style: t.bodyMedium, textAlign: TextAlign.center),
                            ),
                          if (_error != null) Padding(padding: const EdgeInsets.only(top: Space.md), child: Text(s.t(_error!), style: t.bodyMedium!.copyWith(color: c.dangerText))),
                        ]),
                      ),
                      AppButton(
                        key: const Key('walk_arrived'),
                        label: s.t('walk.i_arrived'),
                        large: true,
                        loading: _busy,
                        onPressed: _busy
                            ? null
                            : () => _run(() async {
                                  await ref.read(safetyRepoProvider).arriveTrip(trip.id);
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('walk.arrived'))));
                                    context.go(locationFor('child_home'));
                                  }
                                }),
                      ),
                      const SizedBox(height: Space.xs),
                      AppButton(
                        key: const Key('walk_end'),
                        label: s.t('walk.end'),
                        kind: ButtonKind.text,
                        onPressed: _busy ? null : () => _run(() => ref.read(safetyRepoProvider).cancelTrip(trip.id)),
                      ),
                    ]),
        ),
      ),
    );
  }
}

/// Parents/guardians: everyone on a safe walk right now, with late / stopped warnings, call and end.
class SafeWalkScreen extends ConsumerStatefulWidget {
  const SafeWalkScreen({super.key});
  @override
  ConsumerState<SafeWalkScreen> createState() => _SafeWalkScreenState();
}

class _SafeWalkScreenState extends ConsumerState<SafeWalkScreen> {
  StreamSubscription<RealtimeEvent>? _sub;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _sub = ref.read(realtimeProvider).events.listen((e) {
      if (e.name == 'trip.updated') ref.invalidate(familyTripsProvider);
    });
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => ref.invalidate(familyTripsProvider));
  }

  @override
  void dispose() {
    _sub?.cancel();
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('safe_walk'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final language = ref.watch(languageProvider);
    final session = ref.watch(sessionControllerProvider);
    final zone = session is SignedIn ? (session.user.timezone ?? 'UTC') : 'UTC';
    final async = ref.watch(familyTripsProvider);
    String time(DateTime d) => formatLocalTime(d, zone, language: language, use24h: false);
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('walk.title')), backgroundColor: c.background),
      body: switch (async) {
        AsyncData(:final value) when value.isEmpty => Padding(
            padding: const EdgeInsets.all(Space.screenHorizontal),
            child: MessageView(icon: AppIcons.walk, title: s.t('walk.empty_title'), body: s.t('walk.empty_body')),
          ),
        AsyncData(:final value) => ListView(padding: const EdgeInsets.all(Space.screenHorizontal), children: [
            for (final trip in value)
              Container(
                margin: const EdgeInsets.only(bottom: Space.sm),
                padding: const EdgeInsets.all(Space.md),
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: BorderRadius.circular(Radii.card),
                  border: Border.all(color: trip.overdue || trip.stopped ? c.warning : c.border, width: trip.overdue || trip.stopped ? 2 : 1),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    AppIcon(AppIcons.walk, color: c.primaryText),
                    const SizedBox(width: Space.xs),
                    Expanded(child: Text(trip.memberName, style: t.titleMedium)),
                    Text(s.t('walk.started', {'time': time(trip.startedAt)}), style: t.bodySmall),
                  ]),
                  const SizedBox(height: Space.xs),
                  if (trip.destinationName != null) Text(s.t('walk.to_place', {'place': trip.destinationName!}), style: t.bodyMedium),
                  Row(children: [
                    AppIcon(trip.overdue || trip.stopped ? AppIcons.alertCircle : AppIcons.clock, size: 18, color: trip.overdue || trip.stopped ? c.warningText : c.muted),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        trip.overdue
                            ? s.t('walk.overdue', {'time': time(trip.expectedAt)})
                            : (trip.stopped ? s.t('walk.stopped') : '${s.t('walk.on_the_way')} · ${s.t('walk.expected', {'time': time(trip.expectedAt)})}'),
                        style: t.bodyMedium!.copyWith(color: trip.overdue || trip.stopped ? c.warningText : null),
                      ),
                    ),
                  ]),
                  const SizedBox(height: Space.sm),
                  Row(children: [
                    Expanded(
                      child: AppButton(
                        label: s.t('walk.open'),
                        kind: ButtonKind.secondary,
                        onPressed: () => context.push(locationFor('member', param: trip.memberId)),
                      ),
                    ),
                    const SizedBox(width: Space.xs),
                    Expanded(
                      child: AppButton(
                        label: s.t('walk.end_for'),
                        kind: ButtonKind.text,
                        onPressed: () async {
                          await ref.read(safetyRepoProvider).cancelTrip(trip.id);
                          ref.invalidate(familyTripsProvider);
                        },
                      ),
                    ),
                  ]),
                ]),
              ),
          ]),
        AsyncError(:final error) => MessageView(
            icon: AppIcons.alertCircle,
            title: s.t('state.error_title'),
            body: s.t(ApiError.from(error).messageKey),
            action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: () => ref.invalidate(familyTripsProvider)),
          ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

/// Emergency contacts (email only, no SMS): up to 5 per family.
class EmergencyContactsScreen extends ConsumerStatefulWidget {
  const EmergencyContactsScreen({super.key});
  @override
  ConsumerState<EmergencyContactsScreen> createState() => _EmergencyContactsScreenState();
}

class _EmergencyContactsScreenState extends ConsumerState<EmergencyContactsScreen> {
  Future<void> _add() async {
    final s = ref.read(screenStringsProvider('emergency_contacts'));
    final name = TextEditingController();
    final email = TextEditingController();
    final rel = TextEditingController();
    String? error;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(Space.screenHorizontal, 0, Space.screenHorizontal, MediaQuery.viewInsetsOf(ctx).bottom + Space.md),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(s.t('econ.add'), style: Theme.of(ctx).textTheme.titleMedium),
            const SizedBox(height: Space.sm),
            AppTextField(label: s.t('econ.name'), controller: name, icon: AppIcons.user),
            const SizedBox(height: Space.sm),
            AppTextField(label: s.t('econ.email'), controller: email, icon: AppIcons.mail, keyboardType: TextInputType.emailAddress, error: error),
            const SizedBox(height: Space.sm),
            AppTextField(label: s.t('econ.relationship'), controller: rel, icon: AppIcons.heart),
            const SizedBox(height: Space.md),
            AppButton(
              label: s.t('common.save'),
              onPressed: () async {
                final ok = name.text.trim().isNotEmpty && RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email.text.trim());
                if (!ok) {
                  setSheet(() => error = s.t('econ.err'));
                  return;
                }
                try {
                  await ref.read(safetyRepoProvider).addContact(ref.read(familyIdProvider)!, name: name.text.trim(), email: email.text.trim(), relationship: rel.text);
                  ref.invalidate(emergencyContactsProvider);
                  if (ctx.mounted) Navigator.pop(ctx);
                } catch (e) {
                  final err = ApiError.from(e);
                  setSheet(() => error = err.details?['reason'] == 'max_contacts' ? s.t('econ.max') : s.t(err.messageKey));
                }
              },
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('emergency_contacts'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final async = ref.watch(emergencyContactsProvider);
    final list = async.value ?? const <EmergencyContact>[];
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('econ.title')), backgroundColor: c.background),
      floatingActionButton: list.length >= 5
          ? null
          : FloatingActionButton.extended(
              backgroundColor: c.primaryFill,
              foregroundColor: c.onPrimaryFill,
              onPressed: _add,
              icon: AppIcon(AppIcons.plus, color: c.onPrimaryFill),
              label: Text(s.t('econ.add')),
            ),
      body: ListView(padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.sm, Space.screenHorizontal, 96), children: [
        Text(s.t('econ.body'), style: t.bodyMedium!.copyWith(color: c.muted)),
        const SizedBox(height: Space.md),
        if (async.isLoading && list.isEmpty) const Center(child: CircularProgressIndicator()),
        if (!async.isLoading && list.isEmpty) MessageView(icon: AppIcons.users, title: s.t('econ.empty')),
        for (final e in list)
          Card(
            child: ListTile(
              leading: AppIcon(AppIcons.mail, color: c.primaryText),
              title: Text(e.name),
              subtitle: Text([e.email, if (e.relationship != null) e.relationship!].join(' · ')),
              trailing: IconButton(
                tooltip: s.t('econ.remove', {'name': e.name}),
                icon: AppIcon(AppIcons.close, color: c.muted),
                onPressed: () async {
                  await ref.read(safetyRepoProvider).removeContact(ref.read(familyIdProvider)!, e.id);
                  ref.invalidate(emergencyContactsProvider);
                },
              ),
            ),
          ),
      ]),
    );
  }
}
