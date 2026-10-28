import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../icons/app_icons.g.dart';

/// Welcome logo: shield + location pin drawn on as a stroke over 900 ms (reduce motion: static).
/// PLACEHOLDER (Lead): static logo. The Design agent replaces the implementation; the API stays.
class AnimatedLogo extends StatelessWidget {
  const AnimatedLogo({super.key, this.size = 120, this.animate = true, this.semanticLabel});
  final double size;
  final bool animate;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) => Semantics(
        label: semanticLabel,
        image: semanticLabel != null,
        child: SvgPicture.asset(BrandAssets.logoApp, width: size, height: size),
      );
}
