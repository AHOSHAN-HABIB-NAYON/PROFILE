import '../../core/net/retry.dart';

import 'package:flutter/material.dart';

import '../../core/permissions/permission_card.dart';
import '../onboarding/data/permission_gateway.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
import '../../core/state/buttons.dart';
import '../../nav/router.dart';
import '../home/home_screen.dart' show pinsFor;
import '../safety/data/safety_repo.dart';
import '../home/widgets/profile_row.dart' show homeClockProvider;
import 'family_map.dart';
import 'live_watch.dart';
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
  bool _hideSetup = false;

  void _addPlaceAt((double, double)? at) {
    final base = locationFor('place_edit');
    context.push(at == null ? base : '$base?lat=${at.$1.toStringAsFixed(6)}&lng=${at.$2.toStringAsFixed(6)}');
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('map'));
    final prefs = ref.watch(mapPrefsProvider);
    final family = ref.watch(familyProvider).value;
    final live = ref.watch(liveProvider).value ?? const {};
    final me = ref.watch(myPositionProvider).value;
    final now = ref.watch(homeClockProvider)();
    final pins = family == null ? <MapPin>[] : pinsFor(family, live, now);
    final user = switch (ref.watch(sessionControllerProvider)) {
      SignedIn(:final user) => user,
      _ => null,
    };
    // Adults set where children go (Home, School...). Children never manage places.
    final adult = family != null && user != null && user.role != AppRole.child;
    final placesAsync = adult ? ref.watch(placesProvider) : null;
    final places = [
      for (final p in placesAsync?.value?.places ?? const <Place>[])
        MapPlace(id: p.id, name: p.name, lat: p.lat, lng: p.lng, radiusM: p.radiusM),
    ];
    final showSetup = adult && !_hideSetup && placesAsync?.hasValue == true && places.isEmpty;
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
    return LiveWatch(child: Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: FamilyMapView(
              data: FamilyMapData(
                pins: pins,
                nearby: nearby,
                prefs: prefs,
                places: places,
                connectFromId: user?.id,
                onLongPress: adult ? _addPlaceAt : null,
                onPlaceTap: (id) => context.push('${locationFor('place_edit')}?id=$id'),
              ),
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
          PositionedDirectional(
            top: MediaQuery.paddingOf(context).top + Space.sm,
            start: Space.sm,
            end: 72,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              PermissionNeededCard(permission: OnbPermission.locationWhenInUse, strings: s),
              if (showSetup)
                _PlacesSetupCard(
                  strings: s,
                  onAdd: () => _addPlaceAt(me == null ? null : (me.latitude, me.longitude)),
                  onClose: () => setState(() => _hideSetup = true),
                ),
            ]),
          ),
          // Map controls: two grouped cards on the right edge (like the system maps app).
          PositionedDirectional(
            top: MediaQuery.paddingOf(context).top + Space.sm,
            end: Space.sm,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [
              MapControlGroup(children: [
                MapControlButton(icon: AppIcons.layers, label: s.t('map.layers'), onTap: () => _layers(context, s)),
                MapControlButton(icon: AppIcons.compass, label: s.t('map.compass'), onTap: () => _map?.resetNorth()),
              ]),
              const SizedBox(height: Space.sm),
              if (adult) ...[
                MapControlGroup(children: [
                  MapControlButton(
                    key: const Key('map_add_place'),
                    icon: AppIcons.plus,
                    label: s.t('map.add_place'),
                    primary: true,
                    onTap: () => _addPlaceAt(me == null ? null : (me.latitude, me.longitude)),
                  ),
                ]),
                const SizedBox(height: Space.sm),
              ],
              MapControlGroup(children: [
                MapControlButton(
                  icon: AppIcons.recenter,
                  label: s.t('map.recenter'),
                  primary: true,
                  onTap: () {
                    setState(() => _follow = null);
                    if (me != null) {
                      _map?.focus(me.latitude, me.longitude);
                    } else {
                      ref.invalidate(myPositionProvider);
                    }
                  },
                ),
                MapControlButton(
                  icon: AppIcons.users,
                  label: s.t('map.show_all'),
                  onTap: () {
                    setState(() => _follow = null);
                    _map?.fitAll(pins);
                  },
                ),
              ]),
            ]),
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
          if (me == null && (ref.watch(permissionStatusProvider(OnbPermission.locationWhenInUse)).value?.isGranted ?? false))
            SafeArea(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: const EdgeInsets.all(Space.sm),
                  child: _LocationOffCard(strings: s, onRetry: () => ref.invalidate(myPositionProvider)),
                ),
              ),
            ),
        ],
      ),
    ));
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
    // Feature switched off by the admin: show nothing instead of an empty sheet.
    if (async case AsyncError(:final error) when ApiError.from(error).code == 'FEATURE_DISABLED') return const SizedBox.shrink();
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

/// Location permission is given but no position came back (GPS / location turned off): offer to turn it on.
class _LocationOffCard extends StatefulWidget {
  const _LocationOffCard({required this.strings, required this.onRetry});
  final Strings strings;
  final VoidCallback onRetry;
  @override
  State<_LocationOffCard> createState() => _LocationOffCardState();
}

class _LocationOffCardState extends State<_LocationOffCard> {
  late final AppLifecycleListener _listener;

  @override
  void initState() {
    super.initState();
    _listener = AppLifecycleListener(onResume: widget.onRetry);
  }

  @override
  void dispose() {
    _listener.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Material(
      color: c.surface,
      elevation: 4,
      shadowColor: Colors.black26,
      borderRadius: BorderRadius.circular(Radii.card),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.sm, Space.sm, Space.xs, Space.sm),
        child: Row(children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: c.warning.withValues(alpha: 0.16), shape: BoxShape.circle),
            child: AppIcon(AppIcons.locationPin, size: 20, color: c.warningText),
          ),
          const SizedBox(width: Space.sm),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text(s.t('map.loc_off_title'), style: t.titleSmall),
              Text(s.t('map.loc_off_body'), style: t.bodySmall!.copyWith(color: c.muted)),
            ]),
          ),
          TextButton(
            onPressed: () async {
              await Geolocator.openLocationSettings();
              widget.onRetry();
            },
            child: Text(s.t('map.loc_off_button'), style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ]),
      ),
    );
  }
}

/// A rounded card holding stacked map buttons, separated by hairlines.
class MapControlGroup extends StatelessWidget {
  const MapControlGroup({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surface,
      elevation: 3,
      shadowColor: Colors.black26,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: c.border)),
      clipBehavior: Clip.antiAlias,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) Container(width: 28, height: 1, color: c.border),
          children[i],
        ],
      ]),
    );
  }
}

/// 48dp square map button with a tooltip and TalkBack label.
/// First-time guide: how to set where children go.
class _PlacesSetupCard extends StatelessWidget {
  const _PlacesSetupCard({required this.strings, required this.onAdd, required this.onClose});
  final Strings strings;
  final VoidCallback onAdd;
  final VoidCallback onClose;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final s = strings;
    return Card(
      key: const Key('map_places_setup'),
      margin: const EdgeInsets.only(top: Space.xs),
      color: c.surface,
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.card)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.md, Space.sm, Space.xs, Space.sm),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            AppIcon(AppIcons.locationPinFilled, size: 20, color: c.primaryText),
            const SizedBox(width: Space.xs),
            Expanded(child: Text(s.t('map.setup_title'), style: t.titleSmall)),
            IconButton(
              tooltip: s.t('common.close'),
              visualDensity: VisualDensity.compact,
              onPressed: onClose,
              icon: AppIcon(AppIcons.close, size: 18, color: c.muted),
            ),
          ]),
          Padding(
            padding: const EdgeInsetsDirectional.only(end: Space.sm),
            child: Text(s.t('map.setup_body'), style: t.bodySmall),
          ),
          const SizedBox(height: Space.sm),
          AppButton(key: const Key('map_setup_add'), label: s.t('map.add_place'), onPressed: onAdd),
          const SizedBox(height: Space.xs),
          Text(s.t('map.long_press_hint'), style: t.bodySmall!.copyWith(color: c.muted)),
        ]),
      ),
    );
  }
}

class MapControlButton extends StatelessWidget {
  const MapControlButton({super.key, required this.icon, required this.label, required this.onTap, this.primary = false});
  final String icon;
  final String label;
  final VoidCallback onTap;
  final bool primary;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Tooltip(
      message: label,
      child: Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: InkWell(
          onTap: onTap,
          child: SizedBox.square(
            dimension: Sizes.minTouchTarget,
            child: Center(child: AppIcon(icon, size: 22, color: primary ? c.primaryText : c.text)),
          ),
        ),
      ),
    );
  }
}
