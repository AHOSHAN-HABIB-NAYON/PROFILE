/// Location trust labels. Never show an old or estimated position as live.
/// Live < 2 min, Recent 2-15 min, Stale > 15 min, Unavailable with a reason.
enum Trust { live, recent, stale, unavailable }

enum UnavailableReason { phoneOff, locationOff, permissionRemoved, batterySaver, noNetwork, unknown }

const liveWindow = Duration(minutes: 2);
const recentWindow = Duration(minutes: 15);

Trust trustFor({required DateTime? lastUpdate, required DateTime now, UnavailableReason? reason}) {
  if (reason != null || lastUpdate == null) return Trust.unavailable;
  final age = now.difference(lastUpdate);
  // A timestamp from the future (clock skew) is not trusted as live.
  if (age.isNegative) return age.abs() <= const Duration(seconds: 30) ? Trust.live : Trust.stale;
  if (age < liveWindow) return Trust.live;
  if (age <= recentWindow) return Trust.recent;
  return Trust.stale;
}

String trustKey(Trust t) => switch (t) {
      Trust.live => 'trust.live',
      Trust.recent => 'trust.recent',
      Trust.stale => 'trust.stale',
      Trust.unavailable => 'trust.unavailable',
    };

String reasonKey(UnavailableReason r) => switch (r) {
      UnavailableReason.phoneOff => 'trust.reason_phone_off',
      UnavailableReason.locationOff => 'trust.reason_location_off',
      UnavailableReason.permissionRemoved => 'trust.reason_permission_removed',
      UnavailableReason.batterySaver => 'trust.reason_battery_saver',
      UnavailableReason.noNetwork => 'trust.reason_no_network',
      UnavailableReason.unknown => 'trust.reason_unknown',
    };
