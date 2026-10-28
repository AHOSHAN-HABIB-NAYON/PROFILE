import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'tz_utils.dart';

/// Overridden in main() after loading zone.tab.
final tzDataProvider = Provider<TzData>((ref) => throw UnimplementedError('tz data not loaded'));
