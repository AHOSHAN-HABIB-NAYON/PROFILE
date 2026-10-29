import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/motion/motion.dart';
import '../../../core/theme/app_theme.dart';

/// Circular avatar with a camera badge. Shows the local photo, else the server photo, else initials on
/// a gradient (no photo fallback).
class AvatarPicker extends StatelessWidget {
  const AvatarPicker({
    super.key,
    required this.size,
    required this.semanticLabel,
    this.local,
    this.url,
    this.name,
    this.onTap,
    this.progress,
  });

  final double size;
  final String semanticLabel;
  final Uint8List? local;
  final String? url;
  final String? name;
  final VoidCallback? onTap;

  /// 0..1 while uploading; null otherwise.
  final double? progress;

  static String initialsOf(String? name) {
    final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '';
    final first = parts.first.characters.first;
    final last = parts.length > 1 ? parts.last.characters.first : '';
    return (first + last).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget image;
    if (local != null) {
      image = Image.memory(local!, fit: BoxFit.cover, gaplessPlayback: true, excludeFromSemantics: true);
    } else if (url != null && url!.startsWith('https://')) {
      image = Image.network(url!, fit: BoxFit.cover, excludeFromSemantics: true, errorBuilder: (_, _, _) => _initials(context));
    } else {
      image = _initials(context);
    }
    return Semantics(
      button: onTap != null,
      label: semanticLabel,
      excludeSemantics: true,
      child: PressScale(
        onTap: onTap,
        child: SizedBox.square(
          dimension: size,
          child: Stack(clipBehavior: Clip.none, children: [
            Positioned.fill(child: ClipOval(child: image)),
            if (progress != null)
              Positioned.fill(
                child: CircularProgressIndicator(value: progress!.clamp(0.02, 1.0), strokeWidth: 3, color: c.primary, backgroundColor: c.border),
              ),
            PositionedDirectional(
              end: 0,
              bottom: 0,
              child: Container(
                width: size * 0.32,
                height: size * 0.32,
                decoration: BoxDecoration(color: c.primaryFill, shape: BoxShape.circle, border: Border.all(color: c.surface, width: 3)),
                alignment: Alignment.center,
                child: AppIcon(AppIcons.camera, size: size * 0.15, color: c.onPrimaryFill),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _initials(BuildContext context) {
    final c = context.colors;
    final text = initialsOf(name);
    return Container(
      decoration: BoxDecoration(gradient: LinearGradient(colors: [c.primary, c.accent], begin: Alignment.topLeft, end: Alignment.bottomRight)),
      alignment: Alignment.center,
      child: text.isEmpty
          ? AppIcon(AppIcons.user, size: size * 0.42, color: Colors.white)
          : Text(text, style: TextStyle(color: Colors.white, fontSize: size * 0.34, fontWeight: FontWeight.w600)),
    );
  }
}
