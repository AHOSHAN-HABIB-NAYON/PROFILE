import 'package:flutter_test/flutter_test.dart';
import 'package:nirapod/core/log/log.dart';

void main() {
  test('logs never contain emails, coordinates or tokens', () {
    final lines = <String>[];
    Log.sink = lines.add;
    Log.info('loc', 'fix 23.810331, 90.412521 for rafi@example.com Bearer abc.def');
    Log.sink = null;
    final out = lines.single;
    for (final bad in ['23.810331', '90.412521', 'rafi@example.com', 'abc.def']) {
      expect(out.contains(bad), isFalse, reason: bad);
    }
  });
}
