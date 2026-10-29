import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/numerals.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/net/api_error.dart';
import '../../../core/session/session.dart';
import '../../../core/state/buttons.dart';
import '../../../core/state/skeleton.dart';
import '../../../core/state/state_views.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/trust/trust.dart';
import '../../../core/trust/trust_label.dart';
import '../../../core/tz/tz_utils.dart';
import '../../../nav/router.dart';
import '../../home/widgets/header_buttons.dart';
import '../../home/widgets/member_card.dart' show reasonFrom;
import '../../home/widgets/profile_row.dart' show homeClockProvider;
import '../../map/family_map.dart';
import '../../map/map_prefs.dart';
import '../data/family_models.dart';
import '../data/family_repo.dart';

/// Member page: location with trust label and accuracy, battery, online state, local time, today's route
/// (Phase 3), call, "Where are you?", "Request update now", safe walk, remove / re-link.
class MemberScreen extends ConsumerStatefulWidget {
  const MemberScreen({super.key, required this.memberId});
  final String memberId;

  @override
  ConsumerState<MemberScreen> createState() => _MemberScreenState();
}

class _MemberScreenState extends ConsumerState<MemberScreen> {
  bool _requesting = false;

  Future<void> _request(Family f, FamilyMember m) async {
    final s = ref.read(screenStringsProvider('member'));
    setState(() => _requesting = true);
    String msg;
    try {
      await ref.read(familyRepoProvider).requestUpdate(f.id, m.id);
      msg = s.t('member.requested', {'name': m.name});
    } catch (e) {
      final err = ApiError.from(e);
      msg = err.kind == ApiErrorKind.rateLimited
          ? s.t('member.request_wait', {'seconds': (err.details?['retry_after_s'] as Object?) ?? 120})
          : s.t(err.messageKey);
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _remove(Family f, FamilyMember m) async {
    final s = ref.read(screenStringsProvider('member'));
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.t('member.remove_title', {'name': m.name})),
        content: Text(m.isChild ? s.t('member.remove_child_body') : s.t('member.remove_adult_body')),
        actions: [
          FilledButton(autofocus: true, onPressed: () => Navigator.pop(ctx, false), child: Text(s.t('common.cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.t('member.remove'), style: TextStyle(color: ctx.colors.dangerText))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(familyRepoProvider).removeMember(f.id, m.id);
      ref.invalidate(familyProvider);
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t(ApiError.from(e).messageKey))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('member'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final familyAsync = ref.watch(familyProvider);
    final session = ref.watch(sessionControllerProvider);
    final me = session is SignedIn ? session.user : null;
    final lang = ref.watch(languageProvider);
    final now = ref.watch(homeClockProvider)();
    final use24h = MediaQuery.alwaysUse24HourFormatOf(context);
    return Scaffold(
      appBar: AppBar(backgroundColor: c.background),
      body: switch (familyAsync) {
        AsyncData(:final value?) when value.member(widget.memberId) != null => () {
            final f = value;
            final m = f.member(widget.memberId)!;
            final live = ref.watch(liveProvider).value?[m.id];
            final reason = reasonFrom(live?.unavailableReason == 'no_data' ? null : live?.unavailableReason);
            final trust = trustFor(lastUpdate: live?.lastUpdateAt, now: now, reason: reason);
            final viewerZone = me?.timezone ?? 'UTC';
            final updated = live?.lastUpdateAt == null ? '—' : formatLocalTime(live!.lastUpdateAt!, viewerZone, language: lang, use24h: use24h);
            final isParent = me?.role == AppRole.parent || me?.role == AppRole.guardian;
            final p = live?.point;
            return ListView(padding: const EdgeInsets.all(Space.screenHorizontal), children: [
              Row(children: [
                RingAvatar(size: 72, url: m.avatarThumbUrl, initials: initialsOf(m.name), ringColor: trust == Trust.live ? c.success : c.border),
                const SizedBox(width: Space.md),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(m.name, style: t.headlineSmall),
                    if (m.relationship != null) Text(m.relationship!, style: t.bodySmall),
                    if (m.timezone != null)
                      Text(s.t('member.local_time', {'time': formatLocalTime(now, m.timezone!, language: lang, use24h: use24h)}), style: t.bodySmall),
                  ]),
                ),
              ]),
              const SizedBox(height: Space.md),
              if (p != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(Radii.cardLarge),
                  child: SizedBox(
                    height: 200,
                    child: FamilyMapView(
                      data: FamilyMapData(
                        pins: [MapPin(id: m.id, name: m.name, lat: p.lat, lng: p.lng, accuracyM: p.accuracyM, trust: trust)],
                        prefs: ref.watch(mapPrefsProvider),
                      ),
                      onReady: (_) {},
                      onPinTap: (_) {},
                    ),
                  ),
                ),
              const SizedBox(height: Space.sm),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(Space.md),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.t('member.location'), style: t.titleMedium),
                    const SizedBox(height: Space.xxs),
                    if (m.isAdult && m.sharingStatus != 'active')
                      Text(s.t('member.sharing_off', {'name': m.name}), style: t.bodySmall)
                    else ...[
                      TrustLabel(trust: trust, strings: s, updatedAt: updated, reason: reason),
                      if (p != null)
                        Text(localizeDigits(s.t('member.accuracy', {'meters': p.accuracyM.round()}), lang.numerals), style: t.bodySmall),
                      if (live?.batteryPct != null)
                        Text(localizeDigits(s.t('home.battery', {'pct': live!.batteryPct!}), lang.numerals), style: t.bodySmall),
                    ],
                  ]),
                ),
              ),
              const SizedBox(height: Space.sm),
              Row(children: [
                Expanded(
                  child: AppButton(
                    label: s.t('member.call'),
                    kind: ButtonKind.secondary,
                    leading: AppIcon(AppIcons.phone, size: 18, color: c.primaryText),
                    onPressed: () async {
                      // No phone numbers are collected: open the dialer so the user picks the contact.
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('member.no_phone'))));
                      await launchUrl(Uri(scheme: 'tel'));
                    },
                  ),
                ),
                const SizedBox(width: Space.xs),
                if (isParent && m.isChild)
                  Expanded(
                    child: AppButton(
                      label: s.t('member.message'),
                      kind: ButtonKind.secondary,
                      leading: AppIcon(AppIcons.message, size: 18, color: c.primaryText),
                      onPressed: _requesting ? null : () => _request(f, m),
                    ),
                  ),
              ]),
              if (isParent && m.isChild) ...[
                const SizedBox(height: Space.xs),
                AppButton(
                  label: s.t('member.request_update'),
                  loading: _requesting,
                  leading: AppIcon(AppIcons.refresh, size: 18, color: c.onPrimaryFill),
                  onPressed: () => _request(f, m),
                ),
              ],
              const SizedBox(height: Space.md),
              Card(
                child: ListTile(
                  title: Text(s.t('member.route_today')),
                  subtitle: Text(s.t('member.route_soon')),
                  leading: AppIcon(AppIcons.history, color: c.primaryText),
                ),
              ),
              Card(
                child: ListTile(
                  title: Text(s.t('member.safe_walk')),
                  leading: AppIcon(AppIcons.walk, color: c.primaryText),
                  trailing: AppIcon(AppIcons.chevronRight, color: c.muted),
                  onTap: () => context.push(locationFor('safe_walk')),
                ),
              ),
              if (isParent && m.id != me?.id && m.id != f.ownerMemberId) ...[
                if (m.isChild)
                  TextButton(onPressed: () => context.push(locationFor('child_code_generate')), child: Text(s.t('member.relink'))),
                TextButton(onPressed: () => _remove(f, m), child: Text(s.t('member.remove'), style: TextStyle(color: c.dangerText))),
              ],
            ]);
          }(),
        AsyncData() => MessageView(icon: AppIcons.info, title: s.t('state.empty_title')),
        AsyncError() => MessageView(
            icon: AppIcons.alertCircle,
            title: s.t('state.error_title'),
            body: s.t('err.network'),
            action: AppButton(label: s.t('common.retry'), onPressed: () => ref.invalidate(familyProvider)),
          ),
        _ => const Padding(padding: EdgeInsets.all(Space.screenHorizontal), child: SkeletonList()),
      },
    );
  }
}
