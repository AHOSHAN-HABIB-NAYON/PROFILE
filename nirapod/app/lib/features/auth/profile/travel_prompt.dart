import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../app.dart' show routerProvider;
import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/state/buttons.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import 'countries.dart';

/// Non-blocking travel prompt (overlay tz_travel_prompt): "It looks like you're in `Country` now. Update?"
/// Swiping it away means Keep. Returns true for Update.
Future<bool> showTravelPrompt(Ref ref, String countryIso2) async {
  final context = ref.read(routerProvider).routerDelegate.navigatorKey.currentContext;
  if (context == null || !context.mounted) return false;
  final s = ref.read(screenStringsProvider('profile_setup'));
  CountryNames? names;
  try {
    names = await ref.read(countryNamesProvider.future);
  } catch (_) {}
  if (!context.mounted) return false;
  final name = names?.name(countryIso2, s.language) ?? countryIso2;
  final r = await showModalBottomSheet<bool>(
    context: context,
    builder: (_) => TravelPromptSheet(strings: s, countryIso2: countryIso2, countryName: name),
  );
  return r ?? false;
}

class TravelPromptSheet extends StatelessWidget {
  const TravelPromptSheet({super.key, required this.strings, required this.countryIso2, required this.countryName});
  final Strings strings;
  final String countryIso2;
  final String countryName;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, Space.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: SvgPicture.asset(flagAsset4x3(countryIso2), width: 28, height: 21, excludeFromSemantics: true),
              ),
              const SizedBox(width: Space.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    s.t('profile.travel_prompt', {'country': countryName}),
                    style: Theme.of(context).textTheme.titleMedium!.copyWith(color: context.colors.text),
                  ),
                ),
              ),
            ]),
            const SizedBox(height: Space.lg),
            AppButton(label: s.t('profile.update'), onPressed: () => Navigator.of(context).pop(true)),
            const SizedBox(height: Space.xs),
            AppButton(label: s.t('profile.keep'), kind: ButtonKind.secondary, onPressed: () => Navigator.of(context).pop(false)),
          ],
        ),
      ),
    );
  }
}
