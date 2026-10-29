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
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Radii.card),
        child: Padding(
          padding: const EdgeInsets.all(Space.sm),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            RingAvatar(
              size: 52,
              url: member.avatarThumbUrl,
              initials: initialsOf(member.name),
              ringColor: trust == Trust.live ? c.success : (trust == Trust.recent ? c.warning : c.border),
            ),
            const SizedBox(width: Space.sm),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(isMe ? '${member.name} (${s.t('home.you')})' : member.name, style: t.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(subtitle, style: t.bodySmall, maxLines: 2),
                const SizedBox(height: Space.xxs),
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
                const SizedBox(height: Space.xxs),
                Wrap(spacing: Space.sm, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  if (live?.batteryPct != null)
                    Semantics(
                      label: s.t('home.battery', {'pct': live!.batteryPct!}),
                      excludeSemantics: true,
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        AppIcon(AppIcons.battery, size: 18, color: live!.batteryPct! <= 20 ? c.dangerText : c.successText),
                        const SizedBox(width: 2),
                        Flexible(child: Text('${live!.batteryPct}%', style: t.labelMedium)),
                      ]),
                    ),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: (live?.online ?? false) ? c.success : Colors.transparent,
                        border: Border.all(color: (live?.online ?? false) ? c.success : c.muted, width: 1.5),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Flexible(child: Text((live?.online ?? false) ? s.t('home.online') : s.t('home.offline'), style: t.labelMedium)),
                  ]),
                ]),
                if (showLocalTime && memberTime != null && !isMe)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(s.t('home.local_time_for', {'time': memberTime, 'name': member.name}), style: t.bodySmall),
                  ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
