import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/prefs/prefs.dart';

enum MapKind { normal, satellite, hybrid, terrain }

/// Map options live inside the map (never in Settings) and are remembered per device.
class MapPrefs {
  const MapPrefs({
    this.kind = MapKind.satellite,
    this.threeD = false,
    this.nearby = true,
    this.places = true,
    this.trail = false,
    this.accuracy = true,
    this.labels = true,
  });

  final MapKind kind;
  final bool threeD;
  final bool nearby;
  final bool places;
  final bool trail;
  final bool accuracy;
  final bool labels;

  MapPrefs copyWith({MapKind? kind, bool? threeD, bool? nearby, bool? places, bool? trail, bool? accuracy, bool? labels}) => MapPrefs(
        kind: kind ?? this.kind,
        threeD: threeD ?? this.threeD,
        nearby: nearby ?? this.nearby,
        places: places ?? this.places,
        trail: trail ?? this.trail,
        accuracy: accuracy ?? this.accuracy,
        labels: labels ?? this.labels,
      );

  String encode() => [kind.name, threeD, nearby, places, trail, accuracy, labels].join('|');

  static MapPrefs decode(String? s) {
    if (s == null) return const MapPrefs();
    final p = s.split('|');
    if (p.length != 7) return const MapPrefs();
    bool b(int i) => p[i] == 'true';
    return MapPrefs(
      kind: MapKind.values.firstWhere((k) => k.name == p[0], orElse: () => MapKind.satellite),
      threeD: b(1), nearby: b(2), places: b(3), trail: b(4), accuracy: b(5), labels: b(6),
    );
  }
}

class MapPrefsController extends Notifier<MapPrefs> {
  static const key = 'map_prefs';

  @override
  MapPrefs build() => MapPrefs.decode(ref.read(prefsProvider).getString(key));

  /// Applies [change] to the CURRENT prefs (so quick successive taps never undo each other).
  Future<void> update(MapPrefs Function(MapPrefs current) change) async {
    state = change(state);
    await ref.read(prefsProvider).setString(key, state.encode());
  }
}

final mapPrefsProvider = NotifierProvider<MapPrefsController, MapPrefs>(MapPrefsController.new);
