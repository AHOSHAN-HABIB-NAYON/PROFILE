import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../family/data/realtime.dart';
import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/strings.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/net/api_error.dart';
import '../../core/net/providers.dart';
import '../../core/session/session.dart';
import '../../core/state/buttons.dart';
import '../../core/state/skeleton.dart';
import '../../core/state/state_views.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/tz/tz_utils.dart';
import '../../core/widgets/fields.dart';
import '../../nav/router.dart';
import 'billing.dart';

/// Premium tab: current plan + gift banner, monthly/yearly plan cards with badges and per-month hint, trial,
/// "Buy with Google Play", comparison table, redeem code, optional WhatsApp support banner, Priority Support.
class PremiumScreen extends ConsumerStatefulWidget {
  const PremiumScreen({super.key});
  @override
  ConsumerState<PremiumScreen> createState() => _PremiumScreenState();
}

class _PremiumScreenState extends ConsumerState<PremiumScreen> {
  String _period = 'yearly';
  final _code = TextEditingController();
  String? _busy; // plan code or 'redeem'
  String? _codeError;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Strings get _s => ref.read(screenStringsProvider('premium'));

  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _trial(Plan p) async {
    setState(() => _busy = p.code);
    try {
      await ref.read(apiClientProvider).post<dynamic>('/billing/trial', data: {'plan_code': p.code});
      ref.invalidate(plansProvider);
    } catch (e) {
      if (mounted) _toast(_s.t(ApiError.from(e).messageKey));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _buy(Plan p) async {
    final price = p.price(_period) ?? p.prices.firstOrNull;
    if (price == null) return;
    final billing = ref.read(playBillingProvider);
    if (!await billing.available()) {
      if (mounted) _toast(_s.t('prem.store_unavailable'));
      return;
    }
    setState(() => _busy = p.code);
    final r = await billing.buy(price);
    if (!mounted) return;
    setState(() => _busy = null);
    if (r == 'ok') _toast(_s.t('prem.buy_ok', {'plan': p.name}));
    if (r == 'failed') _toast(_s.t('prem.buy_failed'));
  }

  Future<void> _redeem() async {
    final code = _code.text.trim();
    if (code.length < 6) {
      setState(() => _codeError = _s.t('prem.redeem_bad'));
      return;
    }
    setState(() {
      _busy = 'redeem';
      _codeError = null;
    });
    try {
      final j = await ref.read(apiClientProvider).post<Map<String, dynamic>>('/redeem', data: {'code': code});
      _code.clear();
      ref.invalidate(plansProvider);
      final plan = (ref.read(plansProvider).value?.plans ?? const <Plan>[]).where((p) => p.code == j['plan']).firstOrNull?.name ?? '${j['plan']}';
      if (mounted) _toast(_s.t('prem.redeem_ok', {'plan': plan}));
    } catch (e) {
      final err = ApiError.from(e);
      setState(() => _codeError = err.code == 'CODE_INVALID' || err.code == 'CODE_EXPIRED' ? _s.t('prem.redeem_bad') : _s.t(err.messageKey));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _whatsapp(String number, String planName) async {
    final session = ref.read(sessionControllerProvider);
    final email = session is SignedIn ? (session.user.email ?? '') : '';
    final digits = number.replaceAll(RegExp(r'[^0-9]'), '');
    final text = Uri.encodeComponent('Nirapod $planName — $email');
    final ok = await launchUrl(Uri.parse('whatsapp://send?phone=$digits&text=$text'), mode: LaunchMode.externalNonBrowserApplication).catchError((_) => false);
    if (!ok) await launchUrl(Uri.parse('https://wa.me/$digits?text=$text'), mode: LaunchMode.externalApplication).catchError((_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('premium'));
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final async = ref.watch(plansProvider);
    final cfg = ref.watch(appConfigProvider).value;
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionControllerProvider);
    final zone = session is SignedIn ? (session.user.timezone ?? 'UTC') : 'UTC';
    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: switch (async) {
          AsyncData(:final value) => RefreshIndicator(
              onRefresh: () async => ref.invalidate(plansProvider),
              child: ListView(padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.md, Space.screenHorizontal, Space.xl), children: [
                // Hero
                Container(
                  padding: const EdgeInsets.all(Space.lg),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF065F46), Color(0xFF0D9488)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                    borderRadius: BorderRadius.circular(Radii.cardLarge),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      const AppIcon(AppIcons.crownFilled, size: 30, color: Color(0xFFFCD34D)),
                      const SizedBox(width: Space.xs),
                      Expanded(child: Semantics(header: true, child: Text(s.t('prem.title'), style: t.headlineSmall!.copyWith(color: Colors.white, fontWeight: FontWeight.w800)))),
                    ]),
                    const SizedBox(height: Space.xs),
                    Text(s.t('prem.subtitle'), style: t.bodyMedium!.copyWith(color: const Color(0xE6FFFFFF))),
                    if (value.current != null) ...[
                      const SizedBox(height: Space.md),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: Space.xs),
                        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(Radii.pill)),
                        child: Text(
                          [
                            s.t('prem.current', {'plan': value.plans.where((p) => p.code == value.current!.plan).firstOrNull?.name ?? value.current!.plan}),
                            if (value.current!.expiresAt != null)
                              s.t(value.current!.status == 'trial' ? 'prem.trial_until' : 'prem.until', {'date': formatLocalDate(value.current!.expiresAt!, zone)}),
                          ].join(' · '),
                          style: t.labelMedium!.copyWith(color: Colors.white),
                        ),
                      ),
                    ],
                  ]),
                ),
                if (value.gift != null) ...[
                  const SizedBox(height: Space.sm),
                  _GiftBanner(text: s.t('prem.gift', {'from': value.gift!.from, 'plan': value.gift!.plan}), message: value.gift!.message),
                ],
                if (value.current?.canBuy == false)
                  Padding(padding: const EdgeInsets.only(top: Space.md), child: MessageView(icon: AppIcons.info, title: s.t('prem.child_note'))),
                if (value.current?.canBuy != false) ...[
                  const SizedBox(height: Space.md),
                  Center(
                    child: SegmentedButton<String>(
                      segments: [
                        ButtonSegment(value: 'monthly', label: Text(s.t('prem.monthly'))),
                        ButtonSegment(value: 'yearly', label: Text(s.t('prem.yearly'))),
                      ],
                      selected: {_period},
                      onSelectionChanged: (v) => setState(() => _period = v.first),
                    ),
                  ),
                  const SizedBox(height: Space.md),
                  for (final p in value.plans)
                    _PlanCard(
                      plan: p,
                      period: _period,
                      strings: s,
                      current: value.current?.plan == p.code,
                      trialAvailable: !(value.current?.trialUsed ?? false) && p.trialDays > 0,
                      busy: _busy == p.code,
                      onTrial: () => _trial(p),
                      onBuy: () => _buy(p),
                    ),
                ],
                const SizedBox(height: Space.sm),
                _Comparison(plans: value.plans, strings: s),
                if (value.current?.canBuy != false) ...[
                  const SizedBox(height: Space.lg),
                  Text(s.t('prem.redeem'), style: t.titleMedium),
                  const SizedBox(height: Space.xs),
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(
                      child: AppTextField(
                        key: const Key('redeem_code'),
                        label: s.t('prem.redeem_hint'),
                        controller: _code,
                        icon: AppIcons.star,
                        textCapitalization: TextCapitalization.characters,
                        error: _codeError,
                      ),
                    ),
                  ]),
                  const SizedBox(height: Space.xs),
                  AppButton(key: const Key('redeem_go'), label: s.t('prem.redeem_cta'), kind: ButtonKind.secondary, loading: _busy == 'redeem', onPressed: _busy != null ? null : _redeem),
                ],
                if (cfg != null && cfg.paymentBannerEnabled && cfg.whatsappNumber.isNotEmpty &&
                    (cfg.paymentBannerCountries.isEmpty ? false : cfg.paymentBannerCountries.contains(value.country))) ...[
                  const SizedBox(height: Space.lg),
                  _SupportBanner(
                    logos: cfg.paymentBannerShowLogos ? cfg.paymentBannerLogos : const [],
                    text: cfg.paymentBannerText(lang.code),
                    title: s.t('prem.support_title'),
                    onTap: () => _whatsapp(cfg.whatsappNumber, value.plans.where((p) => !p.isFree).firstOrNull?.name ?? 'Premium'),
                  ),
                ],
                if (value.current?.prioritySupport == true) ...[
                  const SizedBox(height: Space.md),
                  AppButton(
                    key: const Key('priority_support'),
                    label: s.t('prem.priority_cta'),
                    kind: ButtonKind.secondary,
                    leading: AppIcon(AppIcons.message, color: c.primaryText),
                    onPressed: () => context.push('${locationFor('chat')}?priority=1'),
                  ),
                ],
                const SizedBox(height: Space.lg),
                _GiftFamilyCard(strings: s),
              ]),
            ),
          AsyncError(:final error) => MessageView(
              icon: AppIcons.alertCircle,
              title: s.t('state.error_title'),
              body: s.t(ApiError.from(error).messageKey),
              action: AppButton(label: s.t('common.retry'), kind: ButtonKind.secondary, onPressed: () => ref.invalidate(plansProvider)),
            ),
          _ => const Padding(padding: EdgeInsets.all(Space.screenHorizontal), child: SkeletonList()),
        },
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.period, required this.strings, required this.current, required this.trialAvailable, required this.busy, required this.onTrial, required this.onBuy});
  final Plan plan;
  final String period;
  final Strings strings;
  final bool current;
  final bool trialAvailable;
  final bool busy;
  final VoidCallback onTrial;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final price = plan.price(period) ?? plan.prices.firstOrNull;
    final monthly = plan.price('monthly');
    final yearly = plan.price('yearly');
    final save = (monthly != null && yearly != null && monthly.amountMinor > 0) ? (100 - (yearly.amountMinor * 100 / (monthly.amountMinor * 12))).round() : 0;
    final l = plan.limits;
    final feats = [
      s.t('prem.sos_free'),
      s.t('prem.children', {'count': l['max_children'] ?? 0}),
      s.t('prem.members', {'count': l['max_members'] ?? 0}),
      if (l['max_places'] == null) s.t('prem.places_unlimited') else s.t('prem.places', {'count': l['max_places']!}),
      s.t('prem.history', {'days': l['history_days'] ?? 0}),
      if (plan.prioritySupport) s.t('prem.priority'),
      if (plan.emailReports) s.t('prem.reports'),
    ];
    return Container(
      margin: const EdgeInsets.only(bottom: Space.sm),
      padding: const EdgeInsets.all(Space.md),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(Radii.cardLarge),
        border: Border.all(color: plan.popular ? c.primary : c.border, width: plan.popular ? 2 : 1),
        boxShadow: [BoxShadow(color: c.primary.withValues(alpha: plan.popular ? 0.14 : 0.05), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(plan.name, style: t.titleMedium!.copyWith(fontSize: 20, fontWeight: FontWeight.w800))),
          if (current) _Badge(text: s.t('prem.current_badge'), color: c.success),
          if (!current && plan.popular) _Badge(text: s.t('prem.popular'), color: c.primary),
        ]),
        const SizedBox(height: Space.xs),
        if (plan.isFree)
          Text(s.t('prem.free_price'), style: t.headlineSmall!.copyWith(color: c.primaryText, fontWeight: FontWeight.w800))
        else if (price != null)
          Wrap(crossAxisAlignment: WrapCrossAlignment.end, spacing: Space.xs, children: [
            Text(
              s.t(price.period == 'yearly' ? 'prem.per_year' : 'prem.per_month', {'price': formatMoney(price.currency, price.amountMinor)}),
              style: t.headlineSmall!.copyWith(color: c.primaryText, fontWeight: FontWeight.w800),
            ),
            if (price.period == 'yearly')
              Text(s.t('prem.per_month', {'price': formatMoney(price.currency, price.perMonthMinor)}), style: t.bodySmall),
            if (price.period == 'yearly' && save > 0) _Badge(text: s.t('prem.save', {'pct': save}), color: c.accent),
          ]),
        const SizedBox(height: Space.sm),
        for (final f in feats)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(children: [
              AppIcon(AppIcons.checkCircle, size: 18, color: c.successText),
              const SizedBox(width: Space.xs),
              Expanded(child: Text(f, style: t.bodyMedium)),
            ]),
          ),
        if (!plan.isFree && !current) ...[
          const SizedBox(height: Space.sm),
          SizedBox(
            width: double.infinity,
            child: trialAvailable
                ? AppButton(key: Key('trial_${plan.code}'), label: s.t('prem.trial_cta', {'days': plan.trialDays}), loading: busy, onPressed: busy ? null : onTrial)
                : AppButton(key: Key('buy_${plan.code}'), label: s.t('prem.buy'), loading: busy, onPressed: busy ? null : onBuy),
          ),
          if (trialAvailable)
            Center(child: TextButton(onPressed: busy ? null : onBuy, child: Text(s.t('prem.buy')))),
        ],
      ]),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.color});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: Space.xs, vertical: 3),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(Radii.pill)),
        child: Text(text, style: Theme.of(context).textTheme.labelMedium!.copyWith(color: color, fontWeight: FontWeight.w700)),
      );
}

class _Comparison extends StatelessWidget {
  const _Comparison({required this.plans, required this.strings});
  final List<Plan> plans;
  final Strings strings;
  @override
  Widget build(BuildContext context) {
    final s = strings;
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    String v(Plan p, String k) {
      final x = p.limits[k];
      if (k == 'max_places' && x == null) return '∞';
      return '${x ?? '—'}';
    }

    final rows = [
      (s.t('prem.sos_free'), (Plan p) => 'yes'),
      (s.t('prem.children', {'count': ''}).replaceAll(':', '').trim(), (Plan p) => v(p, 'max_children')),
      (s.t('prem.members', {'count': ''}).replaceAll(':', '').trim(), (Plan p) => v(p, 'max_members')),
      (s.t('prem.places', {'count': ''}).replaceAll(':', '').trim(), (Plan p) => v(p, 'max_places')),
      (s.t('prem.history', {'days': ''}).replaceAll(':', '').trim(), (Plan p) => v(p, 'history_days')),
      (s.t('prem.priority'), (Plan p) => p.prioritySupport ? 'yes' : '—'),
    ];
    return Container(
      padding: const EdgeInsets.all(Space.sm),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Radii.card), border: Border.all(color: c.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(s.t('prem.compare'), style: t.titleMedium),
        const SizedBox(height: Space.xs),
        Table(
          columnWidths: const {0: FlexColumnWidth(2)},
          defaultVerticalAlignment: TableCellVerticalAlignment.middle,
          children: [
            TableRow(children: [
              Text(s.t('prem.feature'), style: t.labelMedium),
              for (final p in plans) Text(p.name, style: t.labelMedium, textAlign: TextAlign.center),
            ]),
            for (final (label, f) in rows)
              TableRow(
                decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
                children: [
                  Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(label, style: t.bodySmall)),
                  for (final p in plans)
                    f(p) == 'yes'
                        ? Center(child: AppIcon(AppIcons.check, size: 18, color: c.successText))
                        : Text(f(p), textAlign: TextAlign.center, style: t.bodyMedium!.copyWith(fontWeight: FontWeight.w600)),
                ],
              ),
          ],
        ),
      ]),
    );
  }
}

class _GiftBanner extends StatelessWidget {
  const _GiftBanner({required this.text, this.message});
  final String text;
  final String? message;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(Space.md),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFFDE68A), Color(0xFFFCA5A5)]),
        borderRadius: BorderRadius.circular(Radii.cardLarge),
      ),
      child: Row(children: [
        const AppIcon(AppIcons.heart, size: 28, color: Color(0xFF9F1239)),
        const SizedBox(width: Space.sm),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(text, style: t.titleMedium!.copyWith(color: const Color(0xFF4C0519))),
            if (message != null && message!.isNotEmpty) Text('“$message”', style: t.bodyMedium!.copyWith(color: const Color(0xFF4C0519))),
          ]),
        ),
      ]),
    );
  }
}

class _SupportBanner extends StatelessWidget {
  const _SupportBanner({required this.text, required this.title, required this.onTap, this.logos = const []});
  final List<String> logos;
  final String text;
  final String title;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      label: '$title. $text',
      excludeSemantics: true,
      child: Material(
        color: const Color(0xFF0F2A24),
        borderRadius: BorderRadius.circular(Radii.cardLarge),
        child: InkWell(
          key: const Key('support_banner'),
          borderRadius: BorderRadius.circular(Radii.cardLarge),
          onTap: onTap,
          child: Column(mainAxisSize: MainAxisSize.min, children: [Padding(
            padding: const EdgeInsets.all(Space.md),
            child: Row(children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: const BoxDecoration(color: Color(0xFF25D366), shape: BoxShape.circle),
                child: const AppIcon(AppIcons.message, color: Colors.white),
              ),
              const SizedBox(width: Space.sm),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: t.titleMedium!.copyWith(color: Colors.white)),
                  Text(text, style: t.bodySmall!.copyWith(color: const Color(0xCCFFFFFF))),
                ]),
              ),
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.14), shape: BoxShape.circle),
                child: const AppIcon(AppIcons.arrowRight, size: 18, color: Colors.white),
              ),
            ]),
          ),
          if (logos.isNotEmpty)
            Padding(padding: const EdgeInsets.fromLTRB(Space.md, 0, Space.md, Space.sm), child: _LogoStrip(logos: logos)),
          ]),
        ),
      ),
    );
  }
}

/// Slowly scrolling row of payment logos (loops; stands still with reduce-motion).
class _LogoStrip extends StatefulWidget {
  const _LogoStrip({required this.logos});
  final List<String> logos;
  @override
  State<_LogoStrip> createState() => _LogoStripState();
}

class _LogoStripState extends State<_LogoStrip> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Duration(seconds: 4 * widget.logos.length.clamp(2, 8)));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final row = Row(mainAxisSize: MainAxisSize.min, children: [
      for (final u in widget.logos)
        Container(
          margin: const EdgeInsetsDirectional.only(end: Space.sm),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
          child: Image.network('${RealtimeClient.serverOrigin}$u', height: 22, fit: BoxFit.contain, errorBuilder: (_, _, _) => const SizedBox(width: 40, height: 22)),
        ),
    ]);
    return SizedBox(
      height: 34,
      child: ClipRect(
        child: LayoutBuilder(builder: (context, box) => AnimatedBuilder(
              animation: _c,
              builder: (context, child) => OverflowBox(
                alignment: AlignmentDirectional.centerStart,
                maxWidth: double.infinity,
                child: FractionalTranslation(translation: Offset(-_c.value * 0.5, 0), child: child),
              ),
              child: RepaintBoundary(child: Row(mainAxisSize: MainAxisSize.min, children: [row, row])),
            )),
      ),
    );
  }
}

class _GiftFamilyCard extends StatelessWidget {
  const _GiftFamilyCard({required this.strings});
  final Strings strings;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(Space.md),
      decoration: BoxDecoration(color: c.accent.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(Radii.card)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AppIcon(AppIcons.heart, color: c.primaryText),
        const SizedBox(width: Space.sm),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(strings.t('prem.gift_family'), style: t.titleMedium),
            Text(strings.t('prem.gift_family_body'), style: t.bodySmall),
          ]),
        ),
      ]),
    );
  }
}
