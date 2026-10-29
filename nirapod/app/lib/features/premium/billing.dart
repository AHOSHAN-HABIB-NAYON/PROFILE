import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_android/in_app_purchase_android.dart';

import '../../core/log/log.dart';
import '../../core/net/providers.dart';
import '../../core/net/retry.dart';

class PlanPrice {
  const PlanPrice({required this.period, required this.months, required this.currency, required this.amountMinor, required this.perMonthMinor, this.productId, this.basePlanId});
  final String period;
  final int months;
  final String currency;
  final int amountMinor;
  final int perMonthMinor;
  final String? productId;
  final String? basePlanId;
  factory PlanPrice.fromJson(Map<String, dynamic> j) => PlanPrice(
        period: j['period'] as String? ?? 'monthly',
        months: (j['duration_months'] as num?)?.toInt() ?? 1,
        currency: j['currency'] as String? ?? 'USD',
        amountMinor: (j['amount_minor'] as num?)?.toInt() ?? 0,
        perMonthMinor: (j['per_month_minor'] as num?)?.toInt() ?? 0,
        productId: j['play_product_id'] as String?,
        basePlanId: j['play_base_plan_id'] as String?,
      );
}

class Plan {
  const Plan({required this.code, required this.name, required this.isFree, required this.popular, required this.trialDays, required this.limits, required this.prices, this.prioritySupport = false, this.emailReports = false});
  final String code;
  final String name;
  final bool isFree;
  final bool popular;
  final int trialDays;
  final Map<String, int?> limits;
  final List<PlanPrice> prices;
  final bool prioritySupport;
  final bool emailReports;

  PlanPrice? price(String period) => prices.where((p) => p.period == period).firstOrNull;

  factory Plan.fromJson(Map<String, dynamic> j) => Plan(
        code: j['code'] as String,
        name: j['name'] as String? ?? '',
        isFree: j['is_free'] == true,
        popular: j['popular'] == true,
        trialDays: (j['trial_days'] as num?)?.toInt() ?? 0,
        limits: ((j['limits'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', (v as num?)?.toInt())),
        prices: ((j['prices'] as List?) ?? const []).map((e) => PlanPrice.fromJson((e as Map).cast<String, dynamic>())).toList(),
        prioritySupport: j['priority_support'] == true,
        emailReports: j['email_reports'] == true,
      );
}

class CurrentPlan {
  const CurrentPlan({required this.plan, required this.status, this.expiresAt, this.trialUsed = false, this.canBuy = true, this.prioritySupport = false});
  final String plan;
  final String status;
  final DateTime? expiresAt;
  final bool trialUsed;
  final bool canBuy;
  final bool prioritySupport;
  factory CurrentPlan.fromJson(Map<String, dynamic> j) => CurrentPlan(
        plan: j['plan'] as String? ?? 'free',
        status: j['status'] as String? ?? 'free',
        expiresAt: DateTime.tryParse(j['expires_at'] as String? ?? '')?.toUtc(),
        trialUsed: j['trial_used'] == true,
        canBuy: j['can_buy'] != false,
        prioritySupport: j['priority_support'] == true,
      );
}

class Gift {
  const Gift(this.from, this.plan, this.message);
  final String from;
  final String plan;
  final String? message;
}

class PlansData {
  const PlansData(this.plans, this.current, this.gift, this.country);
  final List<Plan> plans;
  final CurrentPlan? current;
  final Gift? gift;
  final String? country;
}

final plansProvider = FutureProvider<PlansData>(retry: retryNetworkOnly, (ref) async {
  final j = await ref.watch(apiClientProvider).get<Map<String, dynamic>>('/plans');
  final g = j['gift'] as Map?;
  return PlansData(
    ((j['plans'] as List?) ?? const []).map((e) => Plan.fromJson((e as Map).cast<String, dynamic>())).toList(),
    j['current'] is Map ? CurrentPlan.fromJson((j['current'] as Map).cast<String, dynamic>()) : null,
    g == null ? null : Gift(g['from'] as String? ?? '', g['plan'] as String? ?? '', g['message'] as String?),
    j['country'] as String?,
  );
});

/// "৳299", "$2.99", "RM 12.90", "SAR 11.99".
String formatMoney(String currency, int minor) {
  final v = minor / 100;
  final num = v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);
  return switch (currency) {
    'BDT' => '৳$num',
    'USD' => '\$$num',
    'EUR' => '€$num',
    'GBP' => '£$num',
    'INR' => '₹$num',
    'MYR' => 'RM $num',
    _ => '$currency $num',
  };
}

/// Google Play Billing in the app; the server verifies every purchase before the plan changes.
abstract class PlayBilling {
  Future<bool> available();

  /// Opens the Play purchase sheet. Completes with the server result ('ok' | 'cancelled' | 'failed').
  Future<String> buy(PlanPrice price);
}

class NoopPlayBilling implements PlayBilling {
  @override
  Future<bool> available() async => false;
  @override
  Future<String> buy(PlanPrice price) async => 'failed';
}

class InAppPurchaseBilling implements PlayBilling {
  InAppPurchaseBilling(this._ref);
  final Ref _ref;
  final _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _sub;
  Completer<String>? _pending;

  void _listen() {
    _sub ??= _iap.purchaseStream.listen(_onPurchases, onError: (_) => _pending?.complete('failed'));
  }

  Future<void> _onPurchases(List<PurchaseDetails> list) async {
    for (final p in list) {
      if (p.status == PurchaseStatus.pending) continue;
      if (p.status == PurchaseStatus.canceled) {
        _complete('cancelled');
        continue;
      }
      if (p.status == PurchaseStatus.error) {
        _complete('failed');
        continue;
      }
      if (p.status == PurchaseStatus.purchased || p.status == PurchaseStatus.restored) {
        try {
          await _ref.read(apiClientProvider).post<dynamic>('/billing/play/verify', data: {
            'product_id': p.productID,
            'purchase_token': p.verificationData.serverVerificationData,
            'kind': 'subscription',
          });
          if (p.pendingCompletePurchase) await _iap.completePurchase(p);
          _ref.invalidate(plansProvider);
          _complete('ok');
        } catch (e) {
          Log.warn('billing', 'verify failed: ${e.runtimeType}');
          _complete('failed');
        }
      }
    }
  }

  void _complete(String r) {
    final c = _pending;
    _pending = null;
    if (c != null && !c.isCompleted) c.complete(r);
  }

  @override
  Future<bool> available() async {
    try {
      return await _iap.isAvailable();
    } catch (_) {
      return false;
    }
  }

  @override
  Future<String> buy(PlanPrice price) async {
    final id = price.productId;
    if (id == null || !await available()) return 'failed';
    _listen();
    final res = await _iap.queryProductDetails({id});
    final all = res.productDetails;
    if (all.isEmpty) return 'failed';
    // One product, several base plans (monthly / yearly): pick the matching one.
    final match = all.whereType<GooglePlayProductDetails>().where((d) {
      final i = d.subscriptionIndex;
      final offers = d.productDetails.subscriptionOfferDetails;
      return i != null && offers != null && offers[i].basePlanId == price.basePlanId;
    }).firstOrNull;
    final details = match ?? all.first;
    final done = Completer<String>();
    _pending = done;
    final param = details is GooglePlayProductDetails
        ? GooglePlayPurchaseParam(productDetails: details, offerToken: details.offerToken)
        : PurchaseParam(productDetails: details);
    final started = await _iap.buyNonConsumable(purchaseParam: param);
    if (!started) _complete('failed');
    return done.future;
  }
}

final playBillingProvider = Provider<PlayBilling>((ref) => InAppPurchaseBilling(ref));
