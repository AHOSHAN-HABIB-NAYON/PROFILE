import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'app_icons.g.dart';

/// Icons that point somewhere and must flip in RTL (Arabic, Urdu).
const directionalIcons = {
  AppIcons.chevronRight, AppIcons.chevronLeft, AppIcons.arrowLeft, AppIcons.arrowRight, AppIcons.logout,
};

/// Renders one of our SVG icons. flutter_svg caches parsed pictures, so repeated icons are cheap.
class AppIcon extends StatelessWidget {
  const AppIcon(this.asset, {super.key, this.size = 24, this.color, this.semanticLabel});

  final String asset;
  final double size;
  final Color? color;

  /// Null means decorative (excluded from TalkBack).
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = color ?? DefaultTextStyle.of(context).style.color ?? const Color(0xFF000000);
    final icon = SvgPicture.asset(
      asset,
      width: size,
      height: size,
      matchTextDirection: directionalIcons.contains(asset),
      colorFilter: ColorFilter.mode(c, BlendMode.srcIn),
      excludeFromSemantics: semanticLabel == null,
      semanticsLabel: semanticLabel,
    );
    return RepaintBoundary(child: icon);
  }
}
