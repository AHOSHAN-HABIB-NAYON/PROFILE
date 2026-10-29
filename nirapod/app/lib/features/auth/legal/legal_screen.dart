import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/motion/motion.dart';
import '../../../core/state/buttons.dart';
import '../../../core/state/state_views.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../data/legal_links.dart';

enum LegalDoc { terms, privacy }

/// Builds the page view for a legal document URL. Tests replace it (there is no platform WebView there).
typedef LegalViewBuilder = Widget Function(Uri uri);

final legalViewProvider = Provider<LegalViewBuilder>((ref) => (uri) => LegalWebView(uri: uri));

/// Terms / Privacy Policy, shown inside the app (no external browser): header with back + title,
/// the page below.
class LegalScreen extends ConsumerWidget {
  const LegalScreen({super.key, required this.doc});
  final LegalDoc doc;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(screenStringsProvider('legal'));
    final c = context.colors;
    final title = s.t(doc == LegalDoc.terms ? 'legal.terms_title' : 'legal.privacy_title');
    final uri = Uri.parse(doc == LegalDoc.terms ? LegalLinks.terms : LegalLinks.privacy);
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: Column(children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: Sizes.headerHeight),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Space.sm),
              child: Row(children: [
                if (context.canPop())
                  Semantics(
                    button: true,
                    label: s.t('common.back'),
                    excludeSemantics: true,
                    child: PressScale(
                      key: const Key('legal_back'),
                      onTap: () => context.pop(),
                      child: SizedBox.square(dimension: 48, child: Center(child: AppIcon(AppIcons.arrowLeft, color: c.text))),
                    ),
                  ),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(title, style: Theme.of(context).textTheme.titleMedium, maxLines: 2),
                  ),
                ),
              ]),
            ),
          ),
          Divider(height: 1, color: c.border),
          Expanded(child: ref.watch(legalViewProvider)(uri)),
        ]),
      ),
    );
  }
}

/// In-app web view of one page on our own site. Links to other sites are not followed.
class LegalWebView extends ConsumerStatefulWidget {
  const LegalWebView({super.key, required this.uri});
  final Uri uri;

  @override
  ConsumerState<LegalWebView> createState() => _LegalWebViewState();
}

class _LegalWebViewState extends ConsumerState<LegalWebView> {
  late final WebViewController _web;
  int _progress = 0;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.disabled)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => mounted ? setState(() => _progress = p) : null,
        onNavigationRequest: (r) => Uri.tryParse(r.url)?.host == widget.uri.host
            ? NavigationDecision.navigate
            : NavigationDecision.prevent,
        onWebResourceError: (e) {
          if (e.isForMainFrame ?? true) setState(() => _failed = true);
        },
      ))
      ..loadRequest(widget.uri);
  }

  void _retry() {
    setState(() {
      _failed = false;
      _progress = 0;
    });
    _web.loadRequest(widget.uri);
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('legal'));
    if (_failed) {
      return Padding(
        padding: const EdgeInsets.all(Space.screenHorizontal),
        child: MessageView(
          icon: AppIcons.alertCircle,
          title: s.t('legal.err_open'),
          action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: _retry),
        ),
      );
    }
    return Stack(children: [
      WebViewWidget(controller: _web),
      if (_progress < 100)
        LinearProgressIndicator(
          value: _progress == 0 ? null : _progress / 100,
          minHeight: 2,
          semanticsLabel: s.t('legal.loading'),
        ),
    ]);
  }
}
