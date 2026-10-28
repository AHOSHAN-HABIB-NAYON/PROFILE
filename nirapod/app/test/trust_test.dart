import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/trust/trust.dart';

void main() {
  final now = DateTime.utc(2026, 10, 28, 12);
  Trust at(Duration age) => trustFor(lastUpdate: now.subtract(age), now: now);

  test('Live under 2 minutes, Recent 2-15, Stale over 15', () {
    expect(at(Duration.zero), Trust.live);
    expect(at(const Duration(minutes: 1, seconds: 59)), Trust.live);
    expect(at(const Duration(minutes: 2)), Trust.recent);
    expect(at(const Duration(minutes: 15)), Trust.recent);
    expect(at(const Duration(minutes: 15, seconds: 1)), Trust.stale);
    expect(at(const Duration(days: 3)), Trust.stale);
  });

  test('Unavailable with a reason, or with no update at all', () {
    expect(trustFor(lastUpdate: null, now: now), Trust.unavailable);
    expect(trustFor(lastUpdate: now, now: now, reason: UnavailableReason.locationOff), Trust.unavailable);
    expect(reasonKey(UnavailableReason.batterySaver), 'trust.reason_battery_saver');
  });

  test('future timestamps beyond small clock skew are never shown as live', () {
    expect(trustFor(lastUpdate: now.add(const Duration(seconds: 10)), now: now), Trust.live);
    expect(trustFor(lastUpdate: now.add(const Duration(minutes: 10)), now: now), Trust.stale);
  });
}
