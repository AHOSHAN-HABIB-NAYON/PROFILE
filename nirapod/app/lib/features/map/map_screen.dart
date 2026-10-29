import '../../core/net/retry.dart';

import 'package:flutter/material.dart';

import '../../core/permissions/permission_card.dart';
import '../onboarding/data/permission_gateway.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:geolocator/geolocator.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/numerals.dart';
import '../../core/i18n/strings.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/net/api_error.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../family/data/family_models.dart';
import '../family/data/family_repo.dart';
import '../home/home_screen.dart' show pinsFor;
import '../home/widgets/header_buttons.dart';
import '../home/widgets/profile_row.dart' show homeClockProvider;
import 'family_map.dart';
import 'map_prefs.dart';

/// Own position (no extra permission: uses the while-in-use location permission from onboarding).
final myPositionProvider = FutureProvider.autoDispose<Position?>((ref) async {
  try {
    final p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied || p == LocationPermission.deniedForever) return null;
    return await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)),
    );
  } catch (_) {
    return null;
  }
});

/// Nearby places around a position, per category set.
final nearbyProvider = FutureProvider.autoDispose.family<List<NearbyPlace>, (double, double)>(retry: retryNetworkOnly, (
  ref,
  pos,
) async {
  return ref.watch(familyRepoProvider).nearby(pos.$1, pos.$2);
});

String formatDistance(int m, Strings s, String numerals) {
  final txt = m < 1000
      ? s.t('map.distance_m', {'m': m})
      : s.t('map.distance_km', {'km': (m / 1000).toStringAsFixed(1)});
  return localizeDigits(txt, numerals);
}

/// Full-screen map. ALL map options live here (never in Settings).
class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  FamilyMapController? _map;
  String? _follow;
  bool _centeredOnMe = false;

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('map'));
    final c = context.colors;
    final prefs = ref.watch(mapPrefsProvider);
    final family = ref.watch(familyProvider).value;
    final live = ref.watch(liveProvider).value ?? const {};
    final me = ref.watch(myPositionProvider).value;
    final now = ref.watch(homeClockProvider)();
    final pins = family == null ? <MapPin>[] : pinsFor(family, live, now);
    final nearby = (prefs.nearby && me != null)
        ? (ref.watch(nearbyProvider((me.latitude, me.longitude))).value ?? const <NearbyPlace>[])
        : const <NearbyPlace>[];
    // On connect: centre on the user's own position (once). Follow mode: keep the camera on that member.
    ref.listen(myPositionProvider, (_, next) {
      final p = next.value;
      if (p != null && _map != null && !_centeredOnMe) {
        _centeredOnMe = true;
        _map!.focus(p.latitude, p.longitude);
      }
    });
    ref.listen(liveProvider, (_, next) {
      final p = _follow == null ? null : next.value?[_follow!]?.point;
      if (p != null) _map?.focus(p.lat, p.lng);
    });
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: FamilyMapView(
              data: FamilyMapData(pins: pins, nearby: nearby, prefs: prefs),
              onReady: (m) {
                setState(() => _map = m);
                if (me != null && !_centeredOnMe) {
                  _centeredOnMe = true;
                  m.focus(me.latitude, me.longitude);
                }
              },
              onPinTap: (id) => setState(() => _follow = id),
            ),
          ),
          // Own position needs location: ask on the map itself.
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Space.sm, Space.sm, 64, 0),
              child: PermissionNeededCard(permission: OnbPermission.locationWhenInUse, strings: s),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: AlignmentDirectional.topEnd,
              child: Padding(
                padding: const EdgeInsets.all(Space.sm),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    HeaderCircle(
                      label: s.t('map.layers'),
                      onTap: () => _layers(context, s),
                      child: AppIcon(AppIcons.layers, color: c.text),
                    ),
                    const SizedBox(height: Space.xs),
                    HeaderCircle(
                      label: s.t('map.compass'),
                      onTap: () => _map?.resetNorth(),
                      child: AppIcon(AppIcons.compass, color: c.text),
                    ),
                    const SizedBox(height: Space.xs),
                    HeaderCircle(
                      label: s.t('map.recenter'),
                      onTap: () {
                        setState(() => _follow = null);
                        if (me != null) _map?.focus(me.latitude, me.longitude);
                      },
                      child: AppIcon(AppIcons.recenter, color: c.text),
                    ),
                    const SizedBox(height: Space.xs),
                    HeaderCircle(
                      label: s.t('map.show_all'),
                      onTap: () {
                        setState(() => _follow = null);
                        _map?.fitAll(pins);
                      },
                      child: AppIcon(AppIcons.users, color: c.text),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_follow != null && family?.member(_follow!) != null)
            SafeArea(
              child: Align(
                alignment: AlignmentDirectional.topStart,
                child: Padding(
                  padding: const EdgeInsets.all(Space.sm),
                  child: InputChip(
                    label: Text(s.t('map.follow', {'name': family!.member(_follow!)!.name})),
                    onDeleted: () => setState(() => _follow = null),
                    deleteButtonTooltipMessage: s.t('common.close'),
                  ),
                ),
              ),
            ),
          if (prefs.nearby && me != null)
            _NearbySheet(position: me, strings: s, onTap: (p) => _map?.focus(p.lat, p.lng, zoom: 17)),
          if (me == null)
            SafeArea(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: const EdgeInsets.all(Space.md),
                  child: Material(
                    color: c.surface,
                    borderRadius: BorderRadius.circular(Radii.card),
                    child: Padding(padding: const EdgeInsets.all(Space.md), child: Text(s.t('map.permission'))),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _layers(BuildContext context, Strings s) => showModalBottomSheet<void>(
    context: context,
    builder: (ctx) => Consumer(
      builder: (ctx, ref, _) {
        final p = ref.watch(mapPrefsProvider);
        final ctl = ref.read(mapPrefsProvider.notifier);
        Widget sw(String key, bool v, MapPrefs Function(MapPrefs, bool) f) =>
            SwitchListTile(title: Text(s.t(key)), value: v, onChanged: (x) => ctl.update((cur) => f(cur, x)));
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.only(bottom: Space.md),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
                child: Text(s.t('map.layers'), style: Theme.of(ctx).textTheme.headlineSmall),
              ),
              Padding(
                padding: const EdgeInsets.all(Space.screenHorizontal),
                child: SegmentedButton<MapKind>(
                  segments: [
                    for (final k in MapKind.values)
                      ButtonSegment(value: k, label: Text(s.t('map.type_${k.name}'), maxLines: 1)),
                  ],
                  selected: {p.kind},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) => ctl.update((cur) => cur.copyWith(kind: v.first)),
                ),
              ),
              sw('map.layer_3d', p.threeD, (cur, v) => cur.copyWith(threeD: v)),
              sw('map.layer_nearby', p.nearby, (cur, v) => cur.copyWith(nearby: v)),
              sw('map.layer_places', p.places, (cur, v) => cur.copyWith(places: v)),
              sw('map.layer_trail', p.trail, (cur, v) => cur.copyWith(trail: v)),
              sw('map.layer_accuracy', p.accuracy, (cur, v) => cur.copyWith(accuracy: v)),
              sw('map.layer_labels', p.labels, (cur, v) => cur.copyWith(labels: v)),
            ],
          ),
        );
      },
    ),
  );
}

const _categories = ['school', 'hospital', 'police', 'pharmacy', 'mosque', 'store'];

class _NearbySheet extends ConsumerStatefulWidget {
  const _NearbySheet({required this.position, required this.strings, required this.onTap});
  final Position position;
  final Strings strings;
  final ValueChanged<NearbyPlace> onTap;

  @override
  ConsumerState<_NearbySheet> createState() => _NearbySheetState();
}

class _NearbySheetState extends ConsumerState<_NearbySheet> {
  String? _cat;

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final lang = ref.watch(languageProvider);
    final async = ref.watch(nearbyProvider((widget.position.latitude, widget.position.longitude)));
    return DraggableScrollableSheet(
      initialChildSize: 0.22,
      minChildSize: 0.12,
      maxChildSize: 0.7,
      builder: (ctx, scroll) => Material(
        color: c.surface,
        elevation: 2,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.cardLarge)),
        child: ListView(
          controller: scroll,
          padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
          children: [
            Center(
              child: Container(
                margin: const EdgeInsets.symmetric(vertical: 8),
                width: 36,
                height: 4,
                decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            Text(s.t('map.nearby_title'), style: t.titleMedium),
            const SizedBox(height: Space.xs),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ChoiceChip(
                    label: Text(s.t('map.cat_all')),
                    selected: _cat == null,
                    onSelected: (_) => setState(() => _cat = null),
                  ),
                  for (final cat in _categories)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(start: Space.xs),
                      child: ChoiceChip(
                        label: Text(s.t('map.cat_$cat')),
                        selected: _cat == cat,
                        onSelected: (_) => setState(() => _cat = cat),
                      ),
                    ),
                ],
              ),
            ),
            ...switch (async) {
              AsyncData(:final value) => () {
                final list = value.where((p) => _cat == null || p.category == _cat).toList();
                if (list.isEmpty) {
                  return [
                    Padding(
                      padding: const EdgeInsets.all(Space.md),
                      child: Text(s.t('map.no_nearby'), style: t.bodySmall),
                    ),
                  ];
                }
                return [
                  for (final p in list)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: AppIcon(AppIcons.locationPin, color: c.primaryText),
                      title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                        [
                          s.t('map.cat_${p.category}'),
                          formatDistance(p.distanceM, s, lang.numerals),
                          if (p.address != null) p.address!,
                        ].join(' · '),
                        maxLines: 2,
                      ),
                      onTap: () => widget.onTap(p),
                    ),
                ];
              }(),
              AsyncError(:final error) => [
                Padding(
                  padding: const EdgeInsets.all(Space.md),
                  child: Text(
                    ApiError.from(error).code == 'FEATURE_DISABLED'
                        ? s.t('map.nearby_off')
                        : s.t(ApiError.from(error).messageKey),
                    style: t.bodySmall,
                  ),
                ),
              ],
              _ => [const Padding(padding: EdgeInsets.all(Space.md), child: LinearProgressIndicator())],
            },
          ],
        ),
      ),
    );
  }
}

/// Used by tests and the child home: the signed-in user id.
String? signedInUserId(WidgetRef ref) => switch (ref.watch(sessionControllerProvider)) {
  SignedIn(:final user) => user.id,
  _ => null,
};
