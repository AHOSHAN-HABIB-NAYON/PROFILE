import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/trust/trust.dart';
import '../family/data/family_models.dart';
import '../home/widgets/header_buttons.dart' show avatarColorFor, initialsOf, paintDefaultAvatar;
import 'map_prefs.dart';
import 'map_styles.dart';

/// Everything the map needs to draw. Built by the screens; drawn by [FamilyMapView].
class MapPin {
  const MapPin({required this.id, required this.name, required this.lat, required this.lng, required this.accuracyM, required this.trust, this.photoUrl});
  final String? photoUrl;
  final String id;
  final String name;
  final double lat;
  final double lng;
  final double accuracyM;
  final Trust trust;
}

/// A saved place (Home, School...) drawn as its alert circle.
class MapPlace {
  const MapPlace({required this.id, required this.name, required this.lat, required this.lng, required this.radiusM});
  final String id;
  final String name;
  final double lat;
  final double lng;
  final int radiusM;
}

class FamilyMapData {
  const FamilyMapData({
    this.pins = const [],
    this.nearby = const [],
    this.prefs = const MapPrefs(),
    this.compact = false,
    this.trail = const [],
    this.places = const [],
    this.onLongPress,
    this.onPlaceTap,
    this.embedded = false,
    this.connectFromId,
  });

  /// The map sits inside a scrolling page (e.g. History > Routes): it takes drags and pinches first.
  final bool embedded;

  /// Draw a line with the distance from this member (usually "you") to every other member on the map.
  final String? connectFromId;

  /// Saved places, shown when the "My places" layer is on.
  final List<MapPlace> places;

  /// Press and hold on the map (e.g. to add a place there).
  final ValueChanged<(double, double)>? onLongPress;
  final ValueChanged<String>? onPlaceTap;
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

class _GoogleFamilyMapState extends State<GoogleFamilyMap> with SingleTickerProviderStateMixin implements FamilyMapController {
  GoogleMapController? _map;
  final _icons = <String, BitmapDescriptor>{};
  final _labels = <String, BitmapDescriptor>{};

  // Live animation: markers glide from where they were to the new position instead of jumping.
  late final AnimationController _move = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
    ..addListener(() => setState(() {}));
  Map<String, LatLng> _from = {};
  double _zoom = 14;
  double _pulse = 0;
  Timer? _pulseTimer;

  /// About 10 frames a second is smooth enough for a soft pulse and cheap for the map.
  void _syncPulse() {
    final want = !widget.data.compact && widget.data.pins.any((p) => p.trust == Trust.live) && !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    if (want && _pulseTimer == null) {
      _pulseTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
        if (mounted) setState(() => _pulse = (_pulse + 0.06) % 1.0);
      });
    } else if (!want && _pulseTimer != null) {
      _pulseTimer!.cancel();
      _pulseTimer = null;
    }
  }

  /// Ring size in meters for 12-40 screen pixels at the current zoom.
  double _pulseRadius(double lat) {
    final metersPerPx = 156543.03392 * math.cos(lat * math.pi / 180) / math.pow(2, _zoom);
    return (12 + 28 * _pulse) * metersPerPx;
  }
  Map<String, LatLng> _to = {};
  String _fittedIds = '';

  @override
  void initState() {
    super.initState();
    _to = {for (final p in widget.data.pins) p.id: LatLng(p.lat, p.lng)};
    _from = Map.of(_to);
  }

  @override
  void dispose() {
    _pulseTimer?.cancel();
    _move.dispose();
    super.dispose();
  }

  /// Where each marker is drawn right now (mid-animation positions while moving).
  LatLng _shown(MapPin p) {
    final to = _to[p.id] ?? LatLng(p.lat, p.lng);
    final from = _from[p.id];
    if (from == null || !_move.isAnimating) return to;
    final k = Curves.easeInOut.transform(_move.value);
    return LatLng(from.latitude + (to.latitude - from.latitude) * k, from.longitude + (to.longitude - from.longitude) * k);
  }

  @override
  void didUpdateWidget(GoogleFamilyMap old) {
    super.didUpdateWidget(old);
    final next = {for (final p in widget.data.pins) p.id: LatLng(p.lat, p.lng)};
    final moved = next.entries.any((e) => _to[e.key] != null && _to[e.key] != e.value);
    _from = {for (final p in widget.data.pins) p.id: _shown(p)};
    _to = next;
    if (moved) _move.forward(from: 0);
    _ensureIcons();
    _autoFit();
    _syncPulse();
    final t = widget.data.trail, o = old.data.trail;
    if (t.length > 1 && (t.length != o.length || t.first != o.first || t.last != o.last)) {
      fitAll([for (final p in t) MapPin(id: '', name: '', lat: p.$1, lng: p.$2, accuracyM: 0, trust: Trust.live)]);
    }
  }

  /// Small embedded maps (Home preview) always show everyone; refit when people appear or leave.
  void _autoFit() {
    final d = widget.data;
    if (!d.compact || _map == null) return;
    final ids = (d.pins.map((p) => p.id).toList()..sort()).join(',');
    if (ids == _fittedIds || d.pins.isEmpty) return;
    _fittedIds = ids;
    fitAll(d.pins);
  }

  Future<BitmapDescriptor?> _label(String text) async {
    final hit = _labels[text];
    if (hit != null) return hit;
    final c = context.colors;
    _labels[text] = await _distanceLabel(text, c.surface, c.primaryText);
    if (mounted) setState(() {});
    return _labels[text];
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncPulse();
    _ensureIcons();
  }

  Future<void> _ensureIcons() async {
    final c = context.colors;
    for (final p in widget.data.pins) {
      final key = _iconKey(p);
      if (_icons.containsKey(key)) continue;
      final ring = switch (p.trust) { Trust.live => c.success, Trust.recent => c.warning, _ => c.muted };
      final height = widget.data.compact ? 34.0 : 52.0;
      // Avatar pin first (instant), then the photo version when it has loaded.
      _icons[key] = await _pinMarker(null, avatarColorFor(initialsOf(p.name)), ring, c.primary, height: height);
      if (mounted) setState(() {});
      if (p.photoUrl != null) {
        final photo = await _loadPhoto(p.photoUrl!);
        if (photo != null) {
          _icons[key] = await _pinMarker(photo, avatarColorFor(initialsOf(p.name)), ring, c.primary, height: height);
          if (mounted) setState(() {});
        }
      }
    }
  }

  String _iconKey(MapPin p) => '${p.id}|${p.trust.name}|${p.name}|${p.photoUrl ?? ''}|${widget.data.compact}';

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
      gestureRecognizers: d.embedded ? {Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer())} : const {},
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
          _fittedIds = (d.pins.map((p) => p.id).toList()..sort()).join(',');
          fitAll(d.pins);
        }
      },
      onLongPress: d.compact || d.onLongPress == null ? null : (p) => d.onLongPress!((p.latitude, p.longitude)),
      markers: {
        if (d.prefs.places)
          for (final pl in d.places)
            Marker(
              markerId: MarkerId('p:${pl.id}'),
              position: LatLng(pl.lat, pl.lng),
              icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
              infoWindow: InfoWindow(title: pl.name, onTap: d.onPlaceTap == null ? null : () => d.onPlaceTap!(pl.id)),
            ),
        for (final (id, at, text) in _connectors())
          if (_labels[text] != null)
            Marker(
              markerId: MarkerId('d:$id'),
              position: at,
              icon: _labels[text]!,
              anchor: const Offset(0.5, 0.5),
              zIndexInt: 1,
              consumeTapEvents: true,
            ),
        for (final p in d.pins)
          Marker(
            markerId: MarkerId('m:${p.id}'),
            position: _shown(p),
            zIndexInt: 2,
            icon: _icons[_iconKey(p)] ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
            anchor: const Offset(0.5, 1.0),
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
        if (_from0 != null)
          for (final p in d.pins)
            if (p.id != _from0!.id)
              Polyline(
                polylineId: PolylineId('c:${p.id}'),
                points: [_shown(_from0!), _shown(p)],
                color: c.primary.withValues(alpha: 0.8),
                width: d.compact ? 2 : 3,
                geodesic: true,
                patterns: [PatternItem.dash(18), PatternItem.gap(10)],
              ),
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
      onCameraMove: (pos) => _zoom = pos.zoom,
      circles: {
        // Live pulse: a soft ring that grows and fades around everyone updating right now.
        if (!d.compact && _pulseTimer != null)
          for (final p in d.pins)
            if (p.trust == Trust.live)
              Circle(
                circleId: CircleId('pulse:${p.id}'),
                center: _shown(p),
                radius: _pulseRadius(_shown(p).latitude),
                fillColor: c.success.withValues(alpha: 0.22 * (1 - _pulse)),
                strokeColor: c.success.withValues(alpha: 0.5 * (1 - _pulse)),
                strokeWidth: 1,
                zIndex: 0,
              ),
        if (d.prefs.places)
          for (final pl in d.places)
            Circle(
              circleId: CircleId('p:${pl.id}'),
              center: LatLng(pl.lat, pl.lng),
              radius: pl.radiusM.toDouble(),
              fillColor: c.accent.withValues(alpha: 0.15),
              strokeColor: c.accent,
              strokeWidth: 2,
            ),
        if (d.prefs.accuracy)
          for (final p in d.pins)
            Circle(
              circleId: CircleId('a:${p.id}'),
              center: _shown(p),
              radius: p.accuracyM.clamp(5, 2000).toDouble(),
              fillColor: c.primary.withValues(alpha: 0.12),
              strokeColor: c.primary.withValues(alpha: 0.5),
              strokeWidth: 1,
            ),
      },
    );
  }

  /// The member lines start from ("you" when on the map, otherwise nobody).
  MapPin? get _from0 {
    final id = widget.data.connectFromId;
    if (id == null || widget.data.pins.length < 2) return null;
    return widget.data.pins.where((p) => p.id == id).firstOrNull;
  }

  /// (id, midpoint, distance text) for every line.
  List<(String, LatLng, String)> _connectors() {
    final a = _from0;
    if (a == null) return const [];
    final out = <(String, LatLng, String)>[];
    final pa = _shown(a);
    for (final p in widget.data.pins) {
      if (p.id == a.id) continue;
      final pb = _shown(p);
      final m = _meters(pa, pb);
      final text = m < 1000 ? '${m.round()} m' : '${(m / 1000).toStringAsFixed(m < 10000 ? 1 : 0)} km';
      out.add((p.id, LatLng((pa.latitude + pb.latitude) / 2, (pa.longitude + pb.longitude) / 2), text));
      if (!_labels.containsKey(text)) _label(text);
    }
    return out;
  }

  static double _meters(LatLng a, LatLng b) {
    const r = 6371000.0;
    double rad(double d) => d * math.pi / 180;
    final dLat = rad(b.latitude - a.latitude);
    final dLng = rad(b.longitude - a.longitude);
    final h = math.sin(dLat / 2) * math.sin(dLat / 2) + math.cos(rad(a.latitude)) * math.cos(rad(b.latitude)) * math.sin(dLng / 2) * math.sin(dLng / 2);
    return 2 * r * math.asin(math.sqrt(h));
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

/// Loads a member photo for drawing into a marker (null on any error or after 10 s).
Future<ui.Image?> _loadPhoto(String url) async {
  final done = Completer<ui.Image?>();
  final stream = NetworkImage(url).resolve(ImageConfiguration.empty);
  late final ImageStreamListener l;
  l = ImageStreamListener((info, _) {
    if (!done.isCompleted) done.complete(info.image);
    stream.removeListener(l);
  }, onError: (_, _) {
    if (!done.isCompleted) done.complete(null);
    stream.removeListener(l);
  });
  stream.addListener(l);
  return done.future.timeout(const Duration(seconds: 10), onTimeout: () => null);
}

/// Google-style pin: white teardrop with a shadow, the photo (or default avatar) in the round head, and a
/// status dot (green live, amber recent, grey stale). The tip is the exact position.
Future<BitmapDescriptor> _pinMarker(ui.Image? photo, Color avatarBg, Color status, Color brand, {double height = 52}) async {
  const w = 120.0, h = 150.0, r = 54.0;
  const head = Offset(w / 2, 58);
  final rec = ui.PictureRecorder();
  final canvas = Canvas(rec);
  final pin = Path()
    ..addOval(Rect.fromCircle(center: head, radius: r))
    ..moveTo(head.dx - r * 0.55, head.dy + r * 0.83)
    ..quadraticBezierTo(w / 2, h - 18, w / 2, h - 4)
    ..quadraticBezierTo(w / 2, h - 18, head.dx + r * 0.55, head.dy + r * 0.83)
    ..close();
  canvas.drawPath(pin.shift(const Offset(0, 3)), Paint()..color = const Color(0x40000000)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4));
  canvas.drawPath(pin, Paint()..color = Colors.white);
  canvas.drawCircle(head, r - 3, Paint()..color = brand..style = PaintingStyle.stroke..strokeWidth = 3);
  const inner = r - 8;
  if (photo != null) {
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: head, radius: inner)));
    final src = Rect.fromLTWH(0, 0, photo.width.toDouble(), photo.height.toDouble());
    final side = math.min(src.width, src.height);
    final crop = Rect.fromCenter(center: src.center, width: side, height: side);
    canvas.drawImageRect(photo, crop, Rect.fromCircle(center: head, radius: inner), Paint()..filterQuality = FilterQuality.medium);
    canvas.restore();
  } else {
    paintDefaultAvatar(canvas, head, inner, avatarBg);
  }
  final dot = head + const Offset(r * 0.68, r * 0.68);
  canvas.drawCircle(dot, 15, Paint()..color = Colors.white);
  canvas.drawCircle(dot, 11, Paint()..color = status);
  final img = await rec.endRecording().toImage(w.toInt(), h.toInt());
  final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
  return BitmapDescriptor.bytes(bytes!.buffer.asUint8List(), width: height * w / h, height: height);
}

/// White pill with the distance, drawn in the middle of a member line.
Future<BitmapDescriptor> _distanceLabel(String text, Color bg, Color fg) async {
  final tp = TextPainter(
    text: TextSpan(text: text, style: TextStyle(color: fg, fontSize: 30, fontWeight: FontWeight.w700)),
    textDirection: TextDirection.ltr,
  )..layout();
  final w = tp.width + 36, h = tp.height + 16;
  final rec = ui.PictureRecorder();
  final canvas = Canvas(rec);
  final r = RRect.fromRectAndRadius(Rect.fromLTWH(2, 2, w - 4, h - 4), Radius.circular(h / 2));
  canvas.drawRRect(r.shift(const Offset(0, 2)), Paint()..color = const Color(0x33000000));
  canvas.drawRRect(r, Paint()..color = bg);
  canvas.drawRRect(r, Paint()..color = fg..style = PaintingStyle.stroke..strokeWidth = 3);
  tp.paint(canvas, Offset((w - tp.width) / 2, (h - tp.height) / 2));
  final img = await rec.endRecording().toImage(w.ceil(), h.ceil());
  final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
  return BitmapDescriptor.bytes(bytes!.buffer.asUint8List(), width: w / 3, height: h / 3);
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
