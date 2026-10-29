import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/trust/trust.dart';
import '../family/data/family_models.dart';
import '../home/widgets/header_buttons.dart' show initialsOf;
import 'map_prefs.dart';
import 'map_styles.dart';

/// Everything the map needs to draw. Built by the screens; drawn by [FamilyMapView].
class MapPin {
  const MapPin({required this.id, required this.name, required this.lat, required this.lng, required this.accuracyM, required this.trust});
  final String id;
  final String name;
  final double lat;
  final double lng;
  final double accuracyM;
  final Trust trust;
}

class FamilyMapData {
  const FamilyMapData({this.pins = const [], this.nearby = const [], this.prefs = const MapPrefs(), this.compact = false, this.trail = const []});
  final List<MapPin> pins;
  final List<NearbyPlace> nearby;
  final MapPrefs prefs;

  /// Route points (lat, lng) drawn as a line, e.g. History > Routes (always shown when not empty).
  final List<(double, double)> trail;

  /// Home preview: no gestures, no controls.
  final bool compact;
}

/// Lets screens move the camera without knowing the map implementation.
abstract class FamilyMapController {
  Future<void> focus(double lat, double lng, {double zoom = 16});
  Future<void> fitAll(List<MapPin> pins);
  Future<void> resetNorth();
}

typedef FamilyMapBuilder = Widget Function(FamilyMapData data, ValueChanged<FamilyMapController> onReady, ValueChanged<String> onPinTap);

/// Swappable map implementation (tests use a plain placeholder; platform views do not run in tests).
final familyMapBuilderProvider = Provider<FamilyMapBuilder>(
  (ref) => (data, onReady, onPinTap) => GoogleFamilyMap(data: data, onReady: onReady, onPinTap: onPinTap),
);

/// Ignore low-accuracy jumps: keep the previous position when the new fix is much less accurate and
/// would move the marker further than its own uncertainty (GPS jitter smoothing).
LivePoint smoothPoint(LivePoint? prev, LivePoint next) {
  if (prev == null) return next;
  if (next.accuracyM > 100 && next.accuracyM > prev.accuracyM * 3) return prev;
  return next;
}

class GoogleFamilyMap extends StatefulWidget {
  const GoogleFamilyMap({super.key, required this.data, required this.onReady, required this.onPinTap});
  final FamilyMapData data;
  final ValueChanged<FamilyMapController> onReady;
  final ValueChanged<String> onPinTap;

  @override
  State<GoogleFamilyMap> createState() => _GoogleFamilyMapState();
}

class _GoogleFamilyMapState extends State<GoogleFamilyMap> implements FamilyMapController {
  GoogleMapController? _map;
  final _icons = <String, BitmapDescriptor>{};

  @override
  void didUpdateWidget(GoogleFamilyMap old) {
    super.didUpdateWidget(old);
    _ensureIcons();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _ensureIcons();
  }

  Future<void> _ensureIcons() async {
    final c = context.colors;
    for (final p in widget.data.pins) {
      final key = '${p.id}|${p.trust.name}|${p.name}';
      if (_icons.containsKey(key)) continue;
      final ring = switch (p.trust) { Trust.live => c.success, Trust.recent => c.warning, _ => c.muted };
      _icons[key] = await _avatarMarker(initialsOf(p.name), c.primary, c.accent, ring);
      if (mounted) setState(() {});
    }
  }

  MapType get _type => switch (widget.data.prefs.kind) {
        MapKind.normal => MapType.normal,
        MapKind.satellite => MapType.satellite,
        MapKind.hybrid => MapType.hybrid,
        MapKind.terrain => MapType.terrain,
      };

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final c = context.colors;
    final first = d.pins.isNotEmpty ? LatLng(d.pins.first.lat, d.pins.first.lng) : const LatLng(23.8103, 90.4125);
    return GoogleMap(
      initialCameraPosition: CameraPosition(target: first, zoom: 14, tilt: d.prefs.threeD ? 60 : 0),
      mapType: _type,
      style: d.prefs.kind == MapKind.normal || d.prefs.kind == MapKind.terrain
          ? (dark ? (d.prefs.labels ? darkMapStyle : darkMapStyleNoLabels) : (d.prefs.labels ? null : lightMapStyleNoLabels))
          : null,
      buildingsEnabled: d.prefs.threeD,
      tiltGesturesEnabled: !d.compact,
      rotateGesturesEnabled: !d.compact,
      scrollGesturesEnabled: !d.compact,
      zoomGesturesEnabled: !d.compact,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      compassEnabled: !d.compact,
      myLocationEnabled: !d.compact,
      myLocationButtonEnabled: false,
      liteModeEnabled: false,
      onMapCreated: (m) {
        _map = m;
        widget.onReady(this);
        if (d.trail.length > 1) {
          fitAll([for (final p in d.trail) MapPin(id: '', name: '', lat: p.$1, lng: p.$2, accuracyM: 0, trust: Trust.live)]);
        } else if (d.pins.isNotEmpty) {
          fitAll(d.pins);
        }
      },
      markers: {
        for (final p in d.pins)
          Marker(
            markerId: MarkerId('m:${p.id}'),
            position: LatLng(p.lat, p.lng),
            icon: _icons['${p.id}|${p.trust.name}|${p.name}'] ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
            anchor: const Offset(0.5, 0.5),
            infoWindow: InfoWindow(title: p.name),
            onTap: () => widget.onPinTap(p.id),
          ),
        if (d.prefs.nearby)
          for (final n in d.nearby)
            Marker(
              markerId: MarkerId('n:${n.id}'),
              position: LatLng(n.lat, n.lng),
              icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
              infoWindow: InfoWindow(title: n.name, snippet: n.address),
            ),
      },
      polylines: {
        if (d.trail.length > 1)
          Polyline(
            polylineId: const PolylineId('trail'),
            points: [for (final p in d.trail) LatLng(p.$1, p.$2)],
            color: c.accent,
            width: 5,
            jointType: JointType.round,
            startCap: Cap.roundCap,
            endCap: Cap.roundCap,
          ),
      },
      circles: {
        if (d.prefs.accuracy)
          for (final p in d.pins)
            Circle(
              circleId: CircleId('a:${p.id}'),
              center: LatLng(p.lat, p.lng),
              radius: p.accuracyM.clamp(5, 2000).toDouble(),
              fillColor: c.primary.withValues(alpha: 0.12),
              strokeColor: c.primary.withValues(alpha: 0.5),
              strokeWidth: 1,
            ),
      },
    );
  }

  @override
  Future<void> focus(double lat, double lng, {double zoom = 16}) async {
    await _map?.animateCamera(CameraUpdate.newCameraPosition(
      CameraPosition(target: LatLng(lat, lng), zoom: zoom, tilt: widget.data.prefs.threeD ? 60 : 0),
    ));
  }

  @override
  Future<void> fitAll(List<MapPin> pins) async {
    if (pins.isEmpty || _map == null) return;
    if (pins.length == 1) return focus(pins.first.lat, pins.first.lng, zoom: 15);
    var s = pins.first.lat, n = s, w = pins.first.lng, e = w;
    for (final p in pins) {
      s = p.lat < s ? p.lat : s;
      n = p.lat > n ? p.lat : n;
      w = p.lng < w ? p.lng : w;
      e = p.lng > e ? p.lng : e;
    }
    await _map!.animateCamera(CameraUpdate.newLatLngBounds(LatLngBounds(southwest: LatLng(s, w), northeast: LatLng(n, e)), 72));
  }

  @override
  Future<void> resetNorth() async {
    final pos = await _map?.getVisibleRegion();
    if (pos == null) return;
    final center = LatLng((pos.northeast.latitude + pos.southwest.latitude) / 2, (pos.northeast.longitude + pos.southwest.longitude) / 2);
    await _map?.animateCamera(CameraUpdate.newCameraPosition(CameraPosition(target: center, zoom: await _map!.getZoomLevel(), bearing: 0, tilt: 0)));
  }
}

/// Circular avatar marker (gradient with initials, coloured status ring) drawn once per member/state.
Future<BitmapDescriptor> _avatarMarker(String initials, Color a, Color b, Color ring) async {
  const size = 96.0;
  final rec = ui.PictureRecorder();
  final canvas = Canvas(rec);
  const center = Offset(size / 2, size / 2);
  canvas.drawCircle(center, size / 2, Paint()..color = Colors.white);
  canvas.drawCircle(center, size / 2 - 4, Paint()..color = ring);
  canvas.drawCircle(
    center,
    size / 2 - 10,
    Paint()..shader = ui.Gradient.linear(Offset.zero, const Offset(size, size), [a, b]),
  );
  final tp = TextPainter(
    text: TextSpan(text: initials, style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700)),
    textDirection: TextDirection.ltr,
  )..layout();
  tp.paint(canvas, center - Offset(tp.width / 2, tp.height / 2));
  final img = await rec.endRecording().toImage(size.toInt(), size.toInt());
  final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
  return BitmapDescriptor.bytes(bytes!.buffer.asUint8List(), width: 44, height: 44);
}

/// A FamilyMapView that reads the builder from providers.
class FamilyMapView extends ConsumerWidget {
  const FamilyMapView({super.key, required this.data, required this.onReady, required this.onPinTap});
  final FamilyMapData data;
  final ValueChanged<FamilyMapController> onReady;
  final ValueChanged<String> onPinTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) => ref.watch(familyMapBuilderProvider)(data, onReady, onPinTap);
}
