import 'package:flutter/material.dart';

import '../../../core/i18n/languages.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/trust/trust.dart';
import '../../../core/trust/trust_label.dart';
import '../../../core/tz/tz_utils.dart';
import '../../family/data/family_models.dart';
import 'header_buttons.dart';

UnavailableReason? reasonFrom(String? r) => switch (r) {
      'phone_off' => UnavailableReason.phoneOff,
      'location_off' => UnavailableReason.locationOff,
      'permission_removed' => UnavailableReason.permissionRemoved,
      'battery_saver' => UnavailableReason.batterySaver,
      'no_network' => UnavailableReason.noNetwork,
      null => null,
      _ => UnavailableReason.unknown,
    };

/// Member card: photo, name, relationship/role, battery, online state, trust label with the exact
/// last-update time, current place, and the member's own local time (from their saved zone).
class MemberCard extends StatelessWidget {
  const MemberCard({
    super.key,
    required this.member,
    required this.live,
    required this.strings,
    required this.language,
    required this.now,
    required this.use24h,
    required this.onTap,
    required this.viewerZone,
    this.isMe = false,
    this.showLocalTime = true,
  });

  final FamilyMember member;
  final MemberLive? live;
  final Strings strings;
  final Language language;
  final DateTime now;
  final bool use24h;
  final VoidCallback onTap;

  /// Last-update times are shown in the viewer's saved zone.
  final String viewerZone;
  final bool isMe;
  final bool showLocalTime;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final s = strings;
    final sharingOff = member.isAdult && member.sharingStatus != 'active';
    final last = live?.lastUpdateAt;
    final reason = sharingOff ? null : reasonFrom(live?.unavailableReason == 'no_data' ? null : live?.unavailableReason);
    final trust = trustFor(lastUpdate: last, now: now, reason: reason);
    final updated = last == null ? '—' : formatLocalTime(last, viewerZone, language: language, use24h: use24h);
    final role = switch (member.role) {
      'child' => s.t('home.role_child'),
      'parent' => s.t('home.role_parent'),
      _ => s.t('home.role_guardian'),
    };
    final subtitle = [member.relationship ?? role, if (live?.placeName != null) live!.placeName!].join(' · ');
    final memberTime = member.timezone == null ? null : formatLocalTime(now, member.timezone!, language: language, use24h: use24h);
    final online = live?.online ?? false;
    final low = (live?.batteryPct ?? 100) <= 20;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(Radii.card),
        border: Border.all(color: c.border.withValues(alpha: 0.6)),
        boxShadow: [BoxShadow(color: c.primary.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(Radii.card),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: Space.sm),
            child: Row(children: [
              // Photo with a ring for trust and a small dot for online.
              Stack(clipBehavior: Clip.none, children: [
                RingAvatar(
                  size: 50,
                  url: member.avatarThumbUrl,
                  initials: initialsOf(member.name),
                  ringColor: trust == Trust.live ? c.success : (trust == Trust.recent ? c.warning : c.border),
                ),
                PositionedDirectional(
                  end: 1,
                  bottom: 1,
                  child: Container(
                    width: 13,
                    height: 13,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: online ? c.success : c.surface,
                      border: Border.all(color: online ? c.surface : c.muted, width: 2),
                    ),
                  ),
                ),
              ]),
              const SizedBox(width: Space.sm),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text.rich(
                    TextSpan(children: [
                      TextSpan(text: isMe ? '${member.name} (${s.t('home.you')})' : member.name, style: t.titleMedium),
                      TextSpan(text: '  $subtitle', style: t.bodySmall),
                    ]),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  if (sharingOff)
                    Row(children: [
                      AppIcon(AppIcons.lock, size: 14, color: c.muted),
                      const SizedBox(width: 4),
                      Flexible(child: Text(s.t('member.sharing_off', {'name': member.name}), style: t.bodySmall)),
                    ])
                  else if (live?.point == null && reason == null)
                    Text(s.t('home.no_location'), style: t.bodySmall)
                  else
                    TrustLabel(trust: trust, strings: s, updatedAt: updated, reason: reason),
                  if (showLocalTime && memberTime != null && !isMe)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(s.t('home.local_time_for', {'time': memberTime, 'name': member.name}), style: t.bodySmall),
                    ),
                ]),
              ),
              const SizedBox(width: Space.xs),
              // Battery chip + online word on the end side.
              // Capped width: at very large text sizes it shrinks instead of pushing the name out.
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 84),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerEnd,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
                if (live?.batteryPct != null)
                  Semantics(
                    label: s.t('home.battery', {'pct': live!.batteryPct!}),
                    excludeSemantics: true,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: (low ? c.danger : c.success).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(Radii.pill),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        AppIcon(AppIcons.battery, size: 16, color: low ? c.dangerText : c.successText),
                        const SizedBox(width: 2),
                        Text('${live!.batteryPct}%', style: t.labelMedium!.copyWith(color: low ? c.dangerText : c.successText)),
                      ]),
                    ),
                  ),
                const SizedBox(height: 4),
                Text(online ? s.t('home.online') : s.t('home.offline'), style: t.bodySmall),
                  ]),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
