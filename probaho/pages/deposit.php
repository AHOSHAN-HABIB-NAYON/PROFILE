<?php
/** Deposit: choose a method. Binance Pay goes to its own flow; others are manual (admin-verified). */
View::$meta['title'] = 'টাকা জমা';
View::$meta['back'] = true;
$methods = db()->all("SELECT * FROM payment_methods WHERE is_active = 1 AND direction IN ('deposit','both') AND code <> 'qr' ORDER BY sort_order, id");
$manual = array_values(array_filter($methods, static fn ($m) => $m['code'] !== 'binance_pay'));
$hasBinance = BinancePay::enabled() && (bool) array_filter($methods, static fn ($m) => $m['code'] === 'binance_pay');
?>
<div class="page-head"><h1>টাকা জমা করুন</h1><p>আপনার পছন্দের পেমেন্ট মেথড নির্বাচন করুন।</p></div>
<?php if (Auth::needsVerification($user)): ?><div class="alert alert-warn" style="margin-bottom:14px"><?= icon('mail') ?><div>লেনদেনের আগে ইমেইল ভেরিফাই করুন।</div></div><?php endif; ?>
<?php if ($hasBinance): ?>
<a href="<?= e(url('/payment/binance-pay')) ?>" class="bp-hero" data-link style="margin-bottom:14px">
  <span class="bp-logo"><?= icon('binance') ?></span>
  <span class="grow"><b>Binance Pay</b><small>USDT দিয়ে তাৎক্ষণিক জমা · QR / Checkout</small></span><?= icon('chevron-right') ?>
</a>
<?php endif; ?>
<?php if ($manual): ?>
<form class="card" action="<?= e(url('/api/wallet/deposit')) ?>" method="post" data-ajax novalidate>
  <?= csrf_field() ?>
  <div class="form-error" hidden></div>
  <span class="label">পেমেন্ট মেথড</span>
  <div class="method-grid" style="margin-bottom:14px">
    <?php foreach ($manual as $i => $m): ?>
      <label class="method">
        <input type="radio" name="method" value="<?= e($m['code']) ?>" <?= $i === 0 ? 'checked' : '' ?> data-instructions="<?= e($m['instructions']) ?>" data-fee-percent="0" data-fee-fixed="0">
        <span class="pm-ic" style="<?= method_style($m) ?>"><?= media_icon($m['icon']) ?></span>
        <span class="grow"><b><?= e($m['name']) ?></b><small><?= e(money($m['min_amount'])) ?> – <?= e(money($m['max_amount'])) ?></small></span>
      </label>
    <?php endforeach; ?>
  </div>
  <div class="alert alert-info" style="margin-bottom:14px"><?= icon('info') ?><div data-instructions style="white-space:pre-line"></div></div>
  <div class="field">
    <label for="d-amount">পরিমাণ (<?= e(currency()) ?>)</label>
    <div class="input-prefix"><span><?= e(setting('currency_symbol', '$')) ?></span><input class="input amount-input" id="d-amount" name="amount" inputmode="decimal" required placeholder="0.00"></div>
    <div class="amount-chips"><?php foreach ([10, 25, 50, 100] as $a): ?><button type="button" class="chip" data-amount="<?= $a ?>"><?= e(money($a)) ?></button><?php endforeach; ?></div>
  </div>
  <div class="field"><label for="d-ref">ট্রানজেকশন আইডি / রেফারেন্স</label><input class="input" id="d-ref" name="reference" required maxlength="100" placeholder="পেমেন্টের ট্রানজেকশন আইডি"></div>
  <button type="submit" class="btn btn-primary btn-block btn-lg">জমার অনুরোধ পাঠান</button>
  <p class="hint muted small center" style="margin:10px 0 0">অ্যাডমিন যাচাইয়ের পর ব্যালেন্স যোগ হবে এবং আপনি নোটিফিকেশন পাবেন।</p>
</form>
<?php elseif (!$hasBinance): ?>
  <div class="card"><?= empty_state('card', 'এই মুহূর্তে কোনো জমা মেথড চালু নেই', 'অনুগ্রহ করে পরে চেষ্টা করুন বা সাপোর্টে যোগাযোগ করুন।') ?></div>
<?php endif; ?>
