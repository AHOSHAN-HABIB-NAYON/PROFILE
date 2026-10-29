import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import 'photo_pipeline.dart';

/// Circular crop with pinch-zoom and drag. Returns the final 512x512 JPEG (metadata stripped).
class CropScreen extends StatefulWidget {
  const CropScreen({super.key, required this.image, required this.strings});
  final Uint8List image;
  final Strings strings;

  @override
  State<CropScreen> createState() => _CropScreenState();
}

class _CropScreenState extends State<CropScreen> {
  final _tc = TransformationController();
  Size? _size;
  double? _viewport;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    imageSizeOf(widget.image).then((s) {
      if (mounted) setState(() => _size = s);
    }).catchError((Object _) {
      if (mounted) Navigator.of(context).pop();
    });
  }

  @override
  void dispose() {
    _tc.dispose();
    super.dispose();
  }

  void _center(double viewport, Size child) {
    if (_viewport == viewport) return;
    _viewport = viewport;
    _tc.value = Matrix4.translationValues(-(child.width - viewport) / 2, -(child.height - viewport) / 2, 0);
  }

  Future<void> _use() async {
    final size = _size, vp = _viewport;
    if (size == null || vp == null) return;
    setState(() => _busy = true);
    try {
      final rect = cropRectFor(image: size, viewport: vp, matrix: _tc.value);
      final out = await cropAndEncodeAsync(widget.image, rect);
      if (mounted) Navigator.of(context).pop(out);
    } catch (_) {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final c = context.colors;
    final size = _size;
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.md, Space.screenHorizontal, Space.md),
              child: Semantics(
                header: true,
                child: Text(s.t('profile.photo_crop'), style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
              ),
            ),
            Expanded(
              child: LayoutBuilder(builder: (context, box) {
                final vp = math.max(120.0, math.min(box.maxWidth - 2 * Space.screenHorizontal, math.min(box.maxHeight, 420.0)));
                if (size == null) return const Center(child: CircularProgressIndicator());
                final k = vp / math.min(size.width, size.height);
                final child = Size(size.width * k, size.height * k);
                _center(vp, child);
                return Center(
                  child: SizedBox.square(
                    dimension: vp,
                    child: ClipRect(
                      child: Directionality(
                        textDirection: TextDirection.ltr,
                        child: Stack(children: [
                        InteractiveViewer(
                          transformationController: _tc,
                          constrained: false,
                          minScale: 1,
                          maxScale: 5,
                          boundaryMargin: EdgeInsets.zero,
                          child: SizedBox(
                            width: child.width,
                            height: child.height,
                            child: Image.memory(widget.image, fit: BoxFit.fill, gaplessPlayback: true, excludeFromSemantics: true),
                          ),
                        ),
                        IgnorePointer(child: CustomPaint(size: Size.square(vp), painter: _CircleMask(c.background, c.surface))),
                        ]),
                      ),
                    ),
                  ),
                );
              }),
            ),
            Padding(
              padding: const EdgeInsets.all(Space.screenHorizontal),
              child: Row(children: [
                Expanded(
                  child: AppButton(
                    label: s.t('common.cancel'),
                    kind: ButtonKind.secondary,
                    onPressed: _busy ? null : () => Navigator.of(context).pop(),
                  ),
                ),
                const SizedBox(width: Space.sm),
                Expanded(child: AppButton(label: s.t('profile.photo_use'), loading: _busy, onPressed: size == null ? null : _use)),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

class _CircleMask extends CustomPainter {
  _CircleMask(this.shade, this.ring);
  final Color shade;
  final Color ring;

  @override
  void paint(Canvas canvas, Size size) {
    final r = size.width / 2;
    final outer = Path()..addRect(Offset.zero & size);
    final hole = Path()..addOval(Rect.fromCircle(center: Offset(r, r), radius: r - 1));
    canvas.drawPath(Path.combine(PathOperation.difference, outer, hole), Paint()..color = shade.withValues(alpha: 0.72));
    canvas.drawCircle(Offset(r, r), r - 1, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = ring);
  }

  @override
  bool shouldRepaint(_CircleMask old) => old.shade != shade || old.ring != ring;
}
