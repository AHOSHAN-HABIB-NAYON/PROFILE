import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/strings.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/net/api_error.dart';
import '../../core/state/buttons.dart';
import '../../core/state/state_views.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/widgets/fields.dart';
import '../../nav/router.dart';
import '../family/data/family_models.dart';
import '../family/data/family_repo.dart';
import '../map/map_screen.dart' show myPositionProvider;
import '../safety/data/safety_repo.dart';

String placeTypeLabel(Strings s, String type) => s.t('places.type_${const {'home', 'school', 'coaching'}.contains(type) ? type : 'custom'}');

String placeTypeIcon(String type) => switch (type) {
      'home' => AppIcons.home,
      'school' => AppIcons.star,
      'coaching' => AppIcons.clock,
      _ => AppIcons.locationPin,
    };

/// Map that picks a point: the pin stays in the centre, the circle shows the alert area.
/// Swappable in tests (platform views do not run there).
typedef PickerMapBuilder = Widget Function(double lat, double lng, int radiusM, ValueChanged<(double, double)> onCenter);

final pickerMapBuilderProvider = Provider<PickerMapBuilder>((ref) => (lat, lng, r, onCenter) => _GooglePickerMap(lat: lat, lng: lng, radiusM: r, onCenter: onCenter));

class _GooglePickerMap extends StatefulWidget {
  const _GooglePickerMap({required this.lat, required this.lng, required this.radiusM, required this.onCenter});
  final double lat;
  final double lng;
  final int radiusM;
  final ValueChanged<(double, double)> onCenter;
  @override
  State<_GooglePickerMap> createState() => _GooglePickerMapState();
}

class _GooglePickerMapState extends State<_GooglePickerMap> {
  late LatLng _center = LatLng(widget.lat, widget.lng);
  GoogleMapController? _map;

  @override
  void didUpdateWidget(covariant _GooglePickerMap old) {
    super.didUpdateWidget(old);
    final moved = (old.lat - widget.lat).abs() > 1e-6 || (old.lng - widget.lng).abs() > 1e-6;
    if (moved && ((_center.latitude - widget.lat).abs() > 1e-6 || (_center.longitude - widget.lng).abs() > 1e-6)) {
      _center = LatLng(widget.lat, widget.lng);
      _map?.animateCamera(CameraUpdate.newLatLng(_center));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Stack(alignment: Alignment.center, children: [
      GoogleMap(
        initialCameraPosition: CameraPosition(target: _center, zoom: 16),
        mapType: MapType.hybrid,
        zoomControlsEnabled: false,
        mapToolbarEnabled: false,
        myLocationButtonEnabled: false,
        onMapCreated: (m) => _map = m,
        onCameraMove: (p) => setState(() => _center = p.target),
        onCameraIdle: () => widget.onCenter((_center.latitude, _center.longitude)),
        circles: {
          Circle(
            circleId: const CircleId('area'),
            center: _center,
            radius: widget.radiusM.toDouble(),
            fillColor: c.primary.withValues(alpha: 0.18),
            strokeColor: c.primary,
            strokeWidth: 2,
          ),
        },
      ),
      // Pin tip on the exact centre.
      IgnorePointer(
        child: Padding(
          padding: const EdgeInsets.only(bottom: 36),
          child: AppIcon(AppIcons.locationPinFilled, size: 40, color: c.primaryText),
        ),
      ),
    ]);
  }
}

/// Places list (home / school / coaching / custom) with the plan limit upsell.
class PlacesScreen extends ConsumerWidget {
  const PlacesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('places'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final async = ref.watch(placesProvider);
    final family = ref.watch(familyProvider).value;
    final names = <String, String>{for (final m in family?.members ?? const <FamilyMember>[]) m.id: m.name};
    final st = async.value;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('places.title')), backgroundColor: c.background),
      floatingActionButton: st == null || st.atLimit
          ? null
          : FloatingActionButton.extended(
              key: const Key('add_place'),
              backgroundColor: c.primaryFill,
              foregroundColor: c.onPrimaryFill,
              onPressed: () => context.push(locationFor('place_edit')),
              icon: AppIcon(AppIcons.plus, color: c.onPrimaryFill),
              label: Text(s.t('places.add')),
            ),
      body: switch (async) {
        AsyncData(:final value) => RefreshIndicator(
            onRefresh: () async => ref.invalidate(placesProvider),
            child: ListView(padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.sm, Space.screenHorizontal, 96), children: [
              if (value.places.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: Space.xxl),
                  child: MessageView(icon: AppIcons.locationPin, title: s.t('places.empty_title'), body: s.t('places.empty_body')),
                ),
              for (final p in value.places)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.sm),
                  child: _PlaceRow(
                    place: p,
                    strings: s,
                    who: p.appliesTo.isEmpty ? s.t('places.applies_all') : p.appliesTo.map((id) => names[id] ?? '').where((n) => n.isNotEmpty).join(', '),
                    onTap: () => context.push('${locationFor('place_edit')}?id=${p.id}'),
                  ),
                ),
              if (value.atLimit)
                Container(
                  key: const Key('places_upsell'),
                  margin: const EdgeInsets.only(top: Space.sm),
                  padding: const EdgeInsets.all(Space.md),
                  decoration: BoxDecoration(
                    color: c.accent.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(Radii.card),
                    border: Border.all(color: c.accent.withValues(alpha: 0.4)),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      AppIcon(AppIcons.crown, color: c.primaryText),
                      const SizedBox(width: Space.xs),
                      Expanded(child: Text(s.t('state.limit_title'), style: t.titleMedium)),
                    ]),
                    const SizedBox(height: Space.xs),
                    Text(s.t('places.limit', {'max': value.maxPlaces ?? 0}), style: t.bodyMedium),
                    const SizedBox(height: Space.sm),
                    AppButton(label: s.t('state.limit_cta'), kind: ButtonKind.secondary, onPressed: () => context.go(locationFor('premium'))),
                  ]),
                ),
            ]),
          ),
        AsyncError(:final error) => MessageView(
            icon: AppIcons.alertCircle,
            title: s.t('state.error_title'),
            body: s.t(ApiError.from(error).messageKey),
            action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: () => ref.invalidate(placesProvider)),
          ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _PlaceRow extends StatelessWidget {
  const _PlaceRow({required this.place, required this.strings, required this.who, required this.onTap});
  final Place place;
  final Strings strings;
  final String who;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final s = strings;
    return Material(
      color: c.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.card), side: BorderSide(color: c.border)),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.card),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Space.sm),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.12), shape: BoxShape.circle),
              child: AppIcon(placeTypeIcon(place.type), color: c.primaryText),
            ),
            const SizedBox(width: Space.sm),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(place.name, style: t.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                Text('${placeTypeLabel(s, place.type)} · ${s.t('places.radius', {'meters': place.radiusM})}', style: t.bodySmall),
                if (who.isNotEmpty) Text(who, style: t.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
              ]),
            ),
            AppIcon(AppIcons.chevronRight, color: c.muted),
          ]),
        ),
      ),
    );
  }
}

/// Add / edit a place: pin drop on the map, name, type, radius 100-300 m, which children it is for.
class PlaceEditScreen extends ConsumerStatefulWidget {
  const PlaceEditScreen({super.key, this.placeId});
  final String? placeId;
  @override
  ConsumerState<PlaceEditScreen> createState() => _PlaceEditScreenState();
}

class _PlaceEditScreenState extends ConsumerState<PlaceEditScreen> {
  final _name = TextEditingController();
  String _type = 'home';
  int _radius = 150;
  double? _lat;
  double? _lng;
  Set<String> _children = {};
  bool _busy = false;
  String? _error;
  bool _loaded = false;
  double? _shownLat;
  double? _shownLng;

  Place? get _existing => widget.placeId == null
      ? null
      : ref.read(placesProvider).value?.places.where((p) => p.id == widget.placeId).firstOrNull;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _init() {
    if (_loaded) return;
    final p = _existing;
    if (p != null) {
      _name.text = p.name;
      _type = p.type;
      _radius = p.radiusM;
      _lat = p.lat;
      _lng = p.lng;
      _children = p.appliesTo.toSet();
      _loaded = true;
    } else if (widget.placeId == null) {
      final me = ref.read(myPositionProvider).value;
      if (me != null) {
        _lat = me.latitude;
        _lng = me.longitude;
      }
      _loaded = me != null;
    }
  }

  Future<void> _save() async {
    final s = ref.read(screenStringsProvider('places'));
    if (_name.text.trim().isEmpty) {
      setState(() => _error = 'places.err_name');
      return;
    }
    final fid = ref.read(familyIdProvider);
    _lat ??= _shownLat;
    _lng ??= _shownLng;
    if (fid == null || _lat == null || _lng == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(safetyRepoProvider).savePlace(fid, {
        'name': _name.text.trim(),
        'type': _type,
        'lat': double.parse(_lat!.toStringAsFixed(6)),
        'lng': double.parse(_lng!.toStringAsFixed(6)),
        'radius_m': _radius,
        'applies_to': _children.toList(),
      }, id: widget.placeId);
      ref.invalidate(placesProvider);
      if (mounted) context.pop();
    } catch (e) {
      final err = ApiError.from(e);
      if (!mounted) return;
      if (err.code == 'PLAN_LIMIT_REACHED') {
        setState(() => _error = null);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('places.limit', {'max': (err.details?['max'] as Object?) ?? 0}))));
      } else {
        setState(() => _error = err.messageKey);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final s = ref.read(screenStringsProvider('places'));
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.t('places.delete_title')),
        content: Text(s.t('places.delete_body', {'name': _name.text})),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.t('common.cancel'))),
          TextButton(
            key: const Key('confirm_delete_place'),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(s.t('places.delete_confirm'), style: TextStyle(color: context.colors.dangerText)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final fid = ref.read(familyIdProvider);
    if (fid == null) return;
    try {
      await ref.read(safetyRepoProvider).deletePlace(fid, widget.placeId!);
      ref.invalidate(placesProvider);
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) setState(() => _error = ApiError.from(e).messageKey);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('places'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    ref.watch(placesProvider);
    final me = ref.watch(myPositionProvider);
    _init();
    final kids = (ref.watch(familyProvider).value?.members ?? const <FamilyMember>[]).where((m) => m.role == 'child').toList();
    final picker = ref.watch(pickerMapBuilderProvider);
    final lat = _lat ?? me.value?.latitude ?? 23.8103;
    final lng = _lng ?? me.value?.longitude ?? 90.4125;
    _shownLat = lat;
    _shownLng = lng;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text(s.t(widget.placeId == null ? 'places.new_title' : 'places.edit_title')),
        backgroundColor: c.background,
      ),
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: ListView(padding: const EdgeInsets.all(Space.screenHorizontal), children: [
              Semantics(
                label: s.t('places.pin_a11y'),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(Radii.cardLarge),
                  child: SizedBox(
                    height: 220,
                    child: picker(lat, lng, _radius, (p) {
                      _lat = p.$1;
                      _lng = p.$2;
                    }),
                  ),
                ),
              ),
              const SizedBox(height: Space.xs),
              Row(children: [
                Expanded(child: Text(s.t('places.pin_hint'), style: t.bodySmall)),
                TextButton.icon(
                  onPressed: me.value == null
                      ? null
                      : () => setState(() {
                            _lat = me.value!.latitude;
                            _lng = me.value!.longitude;
                          }),
                  icon: AppIcon(AppIcons.recenter, size: 18, color: c.primaryText),
                  label: Text(s.t('places.use_my_location')),
                ),
              ]),
              const SizedBox(height: Space.sm),
              AppTextField(
                key: const Key('place_name'),
                label: s.t('places.name'),
                hint: s.t('places.name_hint'),
                controller: _name,
                icon: placeTypeIcon(_type),
                error: _error == 'places.err_name' ? s.t(_error!) : null,
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
              ),
              const SizedBox(height: Space.md),
              Text(s.t('places.type'), style: t.labelLarge),
              const SizedBox(height: Space.xs),
              Wrap(spacing: Space.xs, runSpacing: Space.xs, children: [
                for (final ty in const ['home', 'school', 'coaching', 'custom'])
                  ChoiceChip(
                    label: Text(placeTypeLabel(s, ty)),
                    selected: _type == ty,
                    onSelected: (_) => setState(() => _type = ty),
                  ),
              ]),
              const SizedBox(height: Space.md),
              Text(s.t('places.radius_label', {'meters': _radius}), style: t.labelLarge),
              Slider(
                value: _radius.toDouble(),
                min: 100,
                max: 300,
                divisions: 8,
                label: '$_radius m',
                onChanged: (v) => setState(() => _radius = v.round()),
              ),
              Text(s.t('places.applies'), style: t.labelLarge),
              if (kids.isEmpty) Text(s.t('places.no_children'), style: t.bodySmall),
              for (final k in kids)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _children.isEmpty || _children.contains(k.id),
                  title: Text(k.name),
                  onChanged: (v) => setState(() {
                    final all = kids.map((x) => x.id).toSet();
                    final cur = _children.isEmpty ? {...all} : {..._children};
                    if (v == true) {
                      cur.add(k.id);
                    } else {
                      cur.remove(k.id);
                    }
                    // Everyone selected (or nobody) means "all children".
                    _children = (cur.length == all.length || cur.isEmpty) ? {} : cur;
                  }),
                ),
              if (_error != null && _error != 'places.err_name')
                Padding(padding: const EdgeInsets.only(top: Space.sm), child: Text(s.t(_error!), style: t.bodyMedium!.copyWith(color: c.dangerText))),
              if (widget.placeId != null)
                Padding(
                  padding: const EdgeInsets.only(top: Space.md),
                  child: AppButton(key: const Key('delete_place'), label: s.t('places.delete'), kind: ButtonKind.text, onPressed: _busy ? null : _delete),
                ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.sm),
            child: SizedBox(
              width: double.infinity,
              child: AppButton(key: const Key('save_place'), label: s.t('common.save'), loading: _busy, onPressed: _busy ? null : _save),
            ),
          ),
        ]),
      ),
    );
  }
}
