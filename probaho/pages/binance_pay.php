<?php
/** /payment/binance-pay — Binance Pay is a PAYMENT METHOD only (never a login method). */
View::$meta['title'] = 'Binance Pay';
View::$meta['back'] = true;
$enabled = BinancePay::enabled();
$mode = BinancePay::mode();
$cur = (string) setting('binance_currency', 'USDT');
$orders = db()->all('SELECT * FROM binance_pay_orders WHERE user_id = ? ORDER BY id DESC LIMIT 10', [$user['id']]);
?>
<div class="bp-hero">
  <span class="bp-logo"><?= icon('binance') ?></span>
  <span class="grow"><b>Binance Pay</b><small><?= $mode === 'api' ? 'QR স্ক্যান অথবা Checkout — স্বয়ংক্রিয় যাচাই' : 'Binance Pay ID-তে পাঠান — অ্যাডমিন যাচাই' ?></small></span>
</div>
<?php if (!$enabled): ?>
  <div class="card" style="margin-top:14px"><?= empty_state('binance', 'Binance Pay এই মুহূর্তে বন্ধ আছে', 'অনুগ্রহ করে অন্য মেথড ব্যবহার করুন।') ?></div>
<?php else: ?>
<div class="alert alert-info" style="margin:14px 0"><?= icon('info') ?><div style="white-space:pre-line"><?= e(setting('binance_instructions')) ?></div></div>
<form class="card" action="<?= e(url('/api/binance/create')) ?>" method="post" data-ajax novalidate>
  <?= csrf_field() ?>
  <div class="form-error" hidden></div>
  <?php if ($mode === 'manual'): ?>
    <div class="summary kv" style="margin-bottom:14px">
      <div><span class="k">আমাদের Binance Pay ID</span><span class="v num"><?= e(setting('binance_pay_id') ?: '—') ?><?php if (setting('binance_pay_id') !== ''): ?><button type="button" class="copy-btn" data-copy-text="<?= e(setting('binance_pay_id')) ?>" aria-label="কপি"><?= icon('copy') ?></button><?php endif; ?></span></div>
      <?php if (setting('binance_pay_name') !== ''): ?><div><span class="k">নাম</span><span class="v"><?= e(setting('binance_pay_name')) ?></span></div><?php endif; ?>
      <div><span class="k">কারেন্সি</span><span class="v"><?= e($cur) ?></span></div>
    </div>
  <?php endif; ?>
  <div class="field">
    <label for="bp-amount">পরিমাণ (<?= e($cur) ?>)</label>
    <div class="input-prefix"><span><?= e(setting('currency_symbol', '$')) ?></span><input class="input amount-input" id="bp-amount" name="amount" inputmode="decimal" required placeholder="0.00" value="<?= e(preg_replace('/[^0-9.]/', '', (string) ($_GET['amount'] ?? ''))) ?>"></div>
    <div class="amount-chips"><?php foreach ([10, 25, 50, 100] as $a): ?><button type="button" class="chip" data-amount="<?= $a ?>"><?= $a ?></button><?php endforeach; ?></div>
    <p class="hint">সর্বনিম্ন <?= e(setting('binance_min')) ?> · সর্বোচ্চ <?= e(setting('binance_max')) ?> <?= e($cur) ?></p>
  </div>
  <?php if ($mode === 'manual'): ?>
    <div class="field"><label for="bp-order">Binance Order ID / Transaction ID</label><input class="input" id="bp-order" name="binance_order_id" required maxlength="64" inputmode="numeric" placeholder="Binance অ্যাপের পেমেন্ট হিস্ট্রি থেকে"></div>
  <?php endif; ?>
  <button type="submit" class="btn btn-binance btn-block btn-lg" data-loading="অর্ডার তৈরি হচ্ছে..."><?= icon('binance') ?> <?= $mode === 'api' ? 'পেমেন্ট শুরু করুন' : 'যাচাইয়ের জন্য জমা দিন' ?></button>
</form>
<?php endif; ?>

<?php if ($orders): ?>
<section class="dash-section">
  <div class="card-head"><h2 class="card-title">সাম্প্রতিক Binance Pay অর্ডার</h2></div>
  <div class="list">
    <?php foreach ($orders as $o): ?>
      <a href="<?= e(url('/payment/binance-pay/' . $o['merchant_trade_no'])) ?>" class="list-item" data-link>
        <span class="tx-ic" style="background:#f0b90b;color:#1e2026"><?= icon('binance') ?></span>
        <span class="li-main"><span class="li-title num"><?= e($o['merchant_trade_no']) ?></span><span class="li-sub"><?= e(time_ago($o['created_at'])) ?></span></span>
        <span class="li-end"><span class="tx-amt"><?= e(number_format((float) $o['amount'], 2)) ?> <?= e($o['currency']) ?></span><br><?= status_badge($o['status']) ?></span>
      </a>
    <?php endforeach; ?>
  </div>
</section>
<?php endif; ?>
