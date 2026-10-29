import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/state/buttons.dart';
import '../../../core/state/state_views.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/widgets/auth_scaffold.dart';
import '../../../core/icons/app_icons.g.dart';
import '../data/legal_links.dart';

enum LegalDoc { terms, privacy }

typedef UrlOpener = Future<bool> Function(Uri uri);

Future<bool> openInAppBrowser(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
  } catch (_) {
    return false;
  }
}

final urlOpenerProvider = Provider<UrlOpener>((ref) => openInAppBrowser);

/// Terms / Privacy Policy: opens the page in the in-app browser (Custom Tabs) and returns to the
/// previous screen; if it cannot open, explains and offers to try again.
class LegalScreen extends ConsumerStatefulWidget {
  const LegalScreen({super.key, required this.doc});
  final LegalDoc doc;

  @override
  ConsumerState<LegalScreen> createState() => _LegalScreenState();
}

class _LegalScreenState extends ConsumerState<LegalScreen> {
  bool _failed = false;

  Uri get _uri => Uri.parse(widget.doc == LegalDoc.terms ? LegalLinks.terms : LegalLinks.privacy);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_open()));
  }

  Future<void> _open() async {
    setState(() => _failed = false);
    final ok = await ref.read(urlOpenerProvider)(_uri);
    if (!mounted) return;
    if (ok && context.canPop()) {
      context.pop();
    } else {
      setState(() => _failed = !ok);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('legal'));
    final title = s.t(widget.doc == LegalDoc.terms ? 'legal.terms_title' : 'legal.privacy_title');
    return AuthScaffold(
      showLanguage: false,
      backLabel: s.t('common.back'),
      title: title,
      body: Padding(
        padding: const EdgeInsets.only(top: Space.xxl),
        child: _failed
            ? MessageView(
                icon: AppIcons.alertCircle,
                title: title,
                body: s.t('legal.err_open'),
                action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: _open),
              )
            : Semantics(
                liveRegion: true,
                child: Column(children: [
                  const SizedBox.square(dimension: 28, child: CircularProgressIndicator(strokeWidth: 2.5)),
                  const SizedBox(height: Space.md),
                  Text(s.t('legal.loading'), style: Theme.of(context).textTheme.bodyMedium),
                ]),
              ),
      ),
    );
  }
}
