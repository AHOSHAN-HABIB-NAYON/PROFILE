import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../icons/app_icons.g.dart';

/// Brand block shown on the Flutter splash (continues seamlessly from the native Android splash).
/// PLACEHOLDER (Lead): static logo. The Design agent replaces the implementation; the API stays.
class SplashBrand extends StatelessWidget {
  const SplashBrand({super.key, this.tagline});
  final String? tagline;

  @override
  Widget build(BuildContext context) =>
      Semantics(label: 'Nirapod', image: true, child: SvgPicture.asset(BrandAssets.logoApp, width: 96, height: 96));
}
