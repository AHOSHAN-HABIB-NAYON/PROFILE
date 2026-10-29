import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/i18n/languages.dart';
import '../../../core/i18n/locale_controller.dart';
import '../../../core/i18n/numerals.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/net/api_error.dart';
import '../../../core/state/buttons.dart';
import '../../../core/state/state_views.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../data/auth_api.dart';

/// Devices and sessions: this device is marked; any other can be signed out remotely.
class SessionsScreen extends ConsumerStatefulWidget {
  const SessionsScreen({super.key});

  @override
  ConsumerState<SessionsScreen> createState() => _SessionsScreenState();
}

class _SessionsScreenState extends ConsumerState<SessionsScreen> {
  ViewState<List<SessionInfo>> _state = const Loading();
  final _busy = <String>{};

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() => _state = const Loading());
    try {
      final list = await ref.read(authApiProvider).sessions();
      list.sort((a, b) => a.current ? -1 : (b.current ? 1 : (b.lastUsedAt ?? DateTime(0)).compareTo(a.lastUsedAt ?? DateTime(0))));
      if (mounted) setState(() => _state = list.isEmpty ? const Empty() : Data(list));
    } on ApiError catch (e) {
      if (mounted) setState(() => _state = Failure(e.messageKey));
    }
  }

  Future<void> _revoke(Strings s, SessionInfo info) async {
    setState(() => _busy.add(info.id));
    try {
      await ref.read(authApiProvider).revokeSession(info.id);
      if (!mounted) return;
      final cur = _state;
      setState(() {
        _busy.remove(info.id);
        if (cur is Data<List<SessionInfo>>) _state = Data(cur.value.where((x) => x.id != info.id).toList());
      });
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s.t('sessions.signed_out'))));
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() => _busy.remove(info.id));
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s.t(e.messageKey))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('sessions'));
    final c = context.colors;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(title: Text(s.t('sessions.title')), backgroundColor: c.background),
      body: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(Space.md, Space.xs, Space.md, Space.xl), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        switch (_state) {
        Data(:final value) => Column(children: [for (final x in value) _tile(context, s, x)]),
        final other => SizedBox(
            height: 420,
            child: StateView<List<SessionInfo>>(state: other, strings: s, data: (_, _) => const SizedBox(), onRetry: _load),
          ),
      },
      ])),
    );
  }

  Widget _tile(BuildContext context, Strings s, SessionInfo x) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final language = languageFor(s.language);
    final when = x.lastUsedAt == null ? null : _format(x.lastUsedAt!, language);
    final device = (x.deviceModel == null || x.deviceModel!.isEmpty) ? s.t('sessions.unknown_device') : x.deviceModel!;
    return Container(
      margin: const EdgeInsets.only(bottom: Space.sm),
      padding: const EdgeInsets.all(Space.md),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Radii.card), border: Border.all(color: c.border)),
      child: Row(children: [
        AppIcon(AppIcons.phone, color: c.primaryText),
        const SizedBox(width: Space.sm),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(device, style: t.bodyLarge!.copyWith(fontWeight: FontWeight.w600)),
            if (x.current) Text(s.t('sessions.this_device'), style: t.bodySmall!.copyWith(color: c.successText, fontWeight: FontWeight.w600)),
            if (when != null) Text(s.t('sessions.last_used', {'time': when}), style: t.bodySmall!.copyWith(color: c.muted)),
            if (x.appVersion != null) Text(s.t('sessions.app_version', {'version': x.appVersion!}), style: t.bodySmall!.copyWith(color: c.muted)),
            if (!x.current) ...[
              const SizedBox(height: Space.xs),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: IntrinsicWidth(
                  child: AppButton(
                    label: s.t('sessions.sign_out'),
                    kind: ButtonKind.secondary,
                    loading: _busy.contains(x.id),
                    onPressed: _busy.contains(x.id) ? null : () => _revoke(s, x),
                  ),
                ),
              ),
            ],
          ]),
        ),
      ]),
    );
  }

  String _format(DateTime d, Language language) {
    final local = d.toLocal();
    try {
      return localizeDigits(DateFormat.yMMMd(language.code).add_jm().format(local), language.numerals);
    } catch (_) {
      return DateFormat.yMMMd('en').add_jm().format(local);
    }
  }
}
