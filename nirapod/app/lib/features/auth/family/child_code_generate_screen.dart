import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/net/api_error.dart';
import '../../../core/prefs/prefs.dart';
import '../../../core/session/session.dart';
import '../../../core/state/buttons.dart';
import '../../../core/state/state_views.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/widgets/auth_scaffold.dart';
import '../../../nav/router.dart';
import '../data/auth_api.dart';
import '../data/auth_service.dart' show childCodeCacheKey;
import '../profile/profile_repo.dart';

/// Hours left until [expires], rounded up (never below 0).
int hoursLeft(DateTime expires, DateTime now) {
  final m = expires.difference(now).inMinutes;
  return m <= 0 ? 0 : (m / 60).ceil();
}

/// Code split for display: "K7Q 2MX".
String spacedCode(String code) => code.length == 6 ? '${code.substring(0, 3)} ${code.substring(3)}' : code;

/// Parent generates the child code (24 h, single use, regenerate anytime).
class ChildCodeGenerateScreen extends ConsumerStatefulWidget {
  const ChildCodeGenerateScreen({super.key});

  @override
  ConsumerState<ChildCodeGenerateScreen> createState() => _ChildCodeGenerateScreenState();
}

class _ChildCodeGenerateScreenState extends ConsumerState<ChildCodeGenerateScreen> {
  ViewState<ChildCode> _state = const Loading();
  bool _regenerating = false;

  @override
  void initState() {
    super.initState();
    final cached = _cached();
    if (cached != null) {
      _state = Data(cached);
    } else {
      unawaited(_generate());
    }
  }

  ChildCode? _cached() {
    final raw = ref.read(prefsProvider).getString(childCodeCacheKey);
    if (raw == null) return null;
    try {
      final c = ChildCode.fromJson((jsonDecode(raw) as Map).cast<String, dynamic>());
      return c.expiresAt.isAfter(DateTime.now().add(const Duration(minutes: 5))) ? c : null;
    } catch (_) {
      return null;
    }
  }

  Future<String> _familyId() async {
    final s = ref.read(sessionControllerProvider);
    final u = s is SignedIn ? s.user : null;
    if (u?.familyId != null) return u!.familyId!;
    final id = await ref.read(authApiProvider).ensureFamily();
    if (u != null) await ref.read(profileRepoProvider).applyUser(AuthUser.fromJson({...u.toJson(), 'family_id': id}));
    return id;
  }

  Future<void> _generate() async {
    setState(() {
      if (_state is! Data<ChildCode>) _state = const Loading();
      _regenerating = true;
    });
    try {
      final code = await ref.read(authApiProvider).childCode(await _familyId());
      await ref.read(prefsProvider).setString(childCodeCacheKey, jsonEncode(code.toJson()));
      if (mounted) setState(() => _state = Data(code));
    } on ApiError catch (e) {
      if (!mounted) return;
      final previous = _state;
      setState(() {
        if (e.kind == ApiErrorKind.planLimit) {
          _state = const PlanLimit();
        } else if (previous is Data<ChildCode>) {
          ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(_s.t(e.messageKey))));
        } else {
          _state = Failure(e.messageKey);
        }
      });
    } finally {
      if (mounted) setState(() => _regenerating = false);
    }
  }

  Strings get _s => ref.read(screenStringsProvider('child_code_generate'));

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('child_code_generate'));
    final canPop = context.canPop();
    return AuthScaffold(
      showLanguage: false,
      backLabel: s.t('common.back'),
      title: s.t('code.title'),
      body: switch (_state) {
        Data(:final value) => _content(context, s, value, canPop),
        final other => SizedBox(
            height: 420,
            child: StateView<ChildCode>(
              state: other,
              strings: s,
              data: (_, _) => const SizedBox(),
              onRetry: _generate,
              onSeePlans: () => context.go(locationFor('premium')),
            ),
          ),
      },
    );
  }

  Widget _content(BuildContext context, Strings s, ChildCode code, bool canPop) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final hours = hoursLeft(code.expiresAt, DateTime.now());
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(s.t('code.body'), style: t.bodyMedium!.copyWith(color: c.muted)),
      const SizedBox(height: Space.xl),
      Container(
        padding: const EdgeInsets.symmetric(vertical: Space.xl, horizontal: Space.md),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(Radii.cardLarge),
          border: Border.all(color: c.border),
        ),
        child: Column(children: [
          Semantics(
            label: '${s.t('code.title')}: ${code.code.split('').join(' ')}',
            excludeSemantics: true,
            child: Directionality(
              textDirection: TextDirection.ltr,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: SelectableText(
                  spacedCode(code.code),
                  style: t.displaySmall!.copyWith(fontFamily: 'Noto Sans', fontWeight: FontWeight.w700, letterSpacing: 6, color: c.text),
                ),
              ),
            ),
          ),
          const SizedBox(height: Space.sm),
          Text(s.t('code.expires', {'hours': hours}), style: t.bodySmall!.copyWith(color: c.muted), textAlign: TextAlign.center),
        ]),
      ),
      const SizedBox(height: Space.lg),
      AppButton(
        label: s.t('code.share'),
        onPressed: () => SharePlus.instance.share(ShareParams(
          text: s.t('code.share_text', {'code': code.code, 'url': code.joinUrl}),
          subject: s.t('code.title'),
        )),
      ),
      const SizedBox(height: Space.sm),
      AppButton(
        label: s.t('code.copy'),
        kind: ButtonKind.secondary,
        onPressed: () async {
          await Clipboard.setData(ClipboardData(text: code.code));
          if (context.mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s.t('code.copied'))));
        },
      ),
      const SizedBox(height: Space.sm),
      AppButton(label: s.t('code.regenerate'), kind: ButtonKind.text, loading: _regenerating, onPressed: _regenerating ? null : _generate),
      if (!canPop) ...[
        const SizedBox(height: Space.lg),
        AppButton(label: s.t('common.continue'), large: true, onPressed: () => context.go(locationFor('home'))),
      ],
    ]);
  }
}
