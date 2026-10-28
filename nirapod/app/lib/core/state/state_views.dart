import 'package:flutter/material.dart';

import '../i18n/strings.dart';
import '../icons/app_icon.dart';
import '../icons/app_icons.g.dart';
import '../theme/app_theme.dart';
import '../theme/tokens.g.dart';
import 'buttons.dart';
import 'skeleton.dart';

/// The states every screen must handle (spec: NAVIGATION, "Required states on every screen").
sealed class ViewState<T> {
  const ViewState();
}

class Loading<T> extends ViewState<T> {
  const Loading();
}

class Empty<T> extends ViewState<T> {
  const Empty();
}

class Data<T> extends ViewState<T> {
  const Data(this.value, {this.offline = false, this.staleSince});
  final T value;

  /// Showing cached data while offline (banner on top).
  final bool offline;

  /// Data is older than expected: show the stale banner with the exact time.
  final String? staleSince;
}

class PermissionDenied<T> extends ViewState<T> {
  const PermissionDenied(this.permissionName);
  final String permissionName;
}

class Failure<T> extends ViewState<T> {
  const Failure(this.messageKey);
  final String messageKey;
}

class Succeeded<T> extends ViewState<T> {
  const Succeeded();
}

class PlanLimit<T> extends ViewState<T> {
  const PlanLimit();
}

/// Renders a [ViewState]. [data] builds the normal content.
class StateView<T> extends StatelessWidget {
  const StateView({
    super.key,
    required this.state,
    required this.strings,
    required this.data,
    this.onRetry,
    this.onOpenSettings,
    this.onSeePlans,
    this.emptyTitle,
    this.emptyBody,
    this.emptyAction,
  });

  final ViewState<T> state;
  final Strings strings;
  final Widget Function(BuildContext, T) data;
  final VoidCallback? onRetry;
  final VoidCallback? onOpenSettings;
  final VoidCallback? onSeePlans;
  final String? emptyTitle;
  final String? emptyBody;
  final Widget? emptyAction;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    return switch (state) {
      Loading() => Semantics(label: s.t('state.loading'), liveRegion: true, child: const SkeletonList()),
      Empty() => MessageView(
          icon: AppIcons.info,
          title: emptyTitle ?? s.t('state.empty_title'),
          body: emptyBody ?? s.t('state.empty_body'),
          action: emptyAction,
        ),
      Data(:final value, :final offline, :final staleSince) => Column(
          children: [
            if (offline) StatusBanner(icon: AppIcons.wifiOff, text: s.t('state.offline_banner')),
            if (staleSince != null) StatusBanner(icon: AppIcons.clock, text: s.t('state.stale_banner', {'time': staleSince})),
            Expanded(child: data(context, value)),
          ],
        ),
      PermissionDenied(:final permissionName) => MessageView(
          icon: AppIcons.lock,
          title: s.t('state.permission_title'),
          body: s.t('state.permission_body', {'permission': permissionName}),
          action: AppButton(label: s.t('common.open_settings'), onPressed: onOpenSettings),
        ),
      Failure(:final messageKey) => MessageView(
          icon: AppIcons.alertCircle,
          title: s.t('state.error_title'),
          body: s.t(messageKey),
          action: AppButton(label: s.t('common.retry'), onPressed: onRetry, kind: ButtonKind.secondary),
        ),
      Succeeded() => MessageView(icon: AppIcons.checkCircle, title: s.t('state.success_title')),
      // Upsell only. Safety features (live location, SOS) never reach this state.
      PlanLimit() => MessageView(
          icon: AppIcons.crown,
          title: s.t('state.limit_title'),
          body: s.t('state.limit_body'),
          action: AppButton(label: s.t('state.limit_cta'), onPressed: onSeePlans),
        ),
    };
  }
}

class MessageView extends StatelessWidget {
  const MessageView({super.key, required this.icon, required this.title, this.body, this.action});
  final String icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal, vertical: Space.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.12), shape: BoxShape.circle),
              alignment: Alignment.center,
              child: AppIcon(icon, size: 32, color: c.primaryText),
            ),
            const SizedBox(height: Space.md),
            Semantics(header: true, child: Text(title, style: t.titleMedium, textAlign: TextAlign.center)),
            if (body != null) ...[
              const SizedBox(height: Space.xs),
              Text(body!, style: t.bodyMedium!.copyWith(color: c.muted), textAlign: TextAlign.center),
            ],
            if (action != null) ...[const SizedBox(height: Space.lg), action!],
          ],
        ),
      ),
    );
  }
}

/// Non-blocking banner (offline, stale data). Icon + text, never color alone.
class StatusBanner extends StatelessWidget {
  const StatusBanner({super.key, required this.icon, required this.text});
  final String icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.xs, Space.screenHorizontal, 0),
        padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: Space.xs),
        decoration: BoxDecoration(
          color: c.warning.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(Radii.input),
          border: Border.all(color: c.warning.withValues(alpha: 0.4)),
        ),
        child: Row(children: [
          AppIcon(icon, size: 20, color: c.warningText),
          const SizedBox(width: Space.xs),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodySmall!.copyWith(color: c.text))),
        ]),
      ),
    );
  }
}
