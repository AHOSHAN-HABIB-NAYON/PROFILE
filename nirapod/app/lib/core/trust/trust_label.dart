import 'package:flutter/material.dart';

import '../i18n/strings.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';
import 'trust.dart';

/// Dot + text, so trust is never shown by color alone. Always paired with the exact time by callers.
class TrustLabel extends StatelessWidget {
  const TrustLabel({super.key, required this.trust, required this.strings, required this.updatedAt, this.reason});

  final Trust trust;
  final Strings strings;

  /// Already formatted exact time, e.g. "7:52 PM".
  final String updatedAt;
  final UnavailableReason? reason;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (dot, textColor) = switch (trust) {
      Trust.live => (BrandColors.trustLive, c.successText),
      Trust.recent => (BrandColors.trustRecent, c.warningText),
      Trust.stale || Trust.unavailable => (BrandColors.trustStale, c.muted),
    };
    final label = strings.t(trustKey(trust));
    final parts = [
      label,
      strings.t('trust.updated_at', {'time': updatedAt}),
      if (trust == Trust.unavailable) strings.t(reasonKey(reason ?? UnavailableReason.unknown)),
    ];
    return Semantics(
      label: parts.join(', '),
      excludeSemantics: true,
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: Space.xxs,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: trust == Trust.unavailable ? Colors.transparent : dot,
              shape: BoxShape.circle,
              border: Border.all(color: dot, width: 1.5),
            ),
          ),
          Text(label, style: Theme.of(context).textTheme.bodySmall!.copyWith(color: textColor, fontWeight: FontWeight.w600)),
          Text('· ${parts.skip(1).join(' · ')}', style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
