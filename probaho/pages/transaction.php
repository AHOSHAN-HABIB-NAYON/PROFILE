<?php
/** Transaction receipt / details. */
$t = db()->row('SELECT t.*, cu.name AS cp_name, cu.uid AS cp_uid FROM transactions t LEFT JOIN users cu ON cu.id = t.counterparty_user_id WHERE t.uid = ? AND t.user_id = ?', [$params['uid'], $user['id']]);
View::$meta['back'] = true;
if (!$t) {
    View::$meta['title'] = 'লেনদেন পাওয়া যায়নি';
    echo '<div class="card">' . empty_state('receipt', 'লেনদেন পাওয়া যায়নি', 'লিংকটি সঠিক কি না যাচাই করুন।', '<a href="' . e(url('/transactions')) . '" class="btn btn-primary btn-sm" data-link>সব লেনদেন</a>') . '</div>';
    return;
}
View::$meta['title'] = 'লেনদেন বিস্তারিত';
$tone = ['success' => ['ok', 'check'], 'pending' => ['warn', 'clock'], 'failed' => ['err', 'x'], 'expired' => ['err', 'clock'], 'cancelled' => ['err', 'x']][$t['status']] ?? ['warn', 'info'];
$credit = $t['direction'] === 'credit';
$methodName = db()->val('SELECT name FROM payment_methods WHERE code = ?', [$t['method']]) ?: ['wallet' => 'ওয়ালেট', 'admin' => 'অ্যাডমিন', 'binance_pay' => 'Binance Pay'][$t['method']] ?? $t['method'];
$bp = $t['method'] === 'binance_pay' ? db()->row('SELECT merchant_trade_no FROM binance_pay_orders WHERE transaction_id = ?', [$t['id']]) : null;
?>
<div class="card">
  <div class="receipt-head">
    <div class="receipt-ic <?= $tone[0] ?>"><?= icon($tone[1]) ?></div>
    <div class="muted small"><?= e(tx_type_label($t['type'], $t['direction'])) ?></div>
    <div class="receipt-amount" style="<?= $credit ? 'color:var(--ok)' : '' ?>"><?= $credit ? '+' : '−' ?><?= e(money($t['net_amount'])) ?></div>
    <?= status_badge($t['status']) ?>
  </div>
  <div class="kv">
    <div><span class="k">লেনদেন আইডি</span><span class="v num"><?= e($t['uid']) ?><button class="copy-btn" data-copy-text="<?= e($t['uid']) ?>" aria-label="কপি"><?= icon('copy') ?></button></span></div>
    <div><span class="k">পরিমাণ</span><span class="v num"><?= e(money($t['net_amount'])) ?> <?= e(currency()) ?></span></div>
    <div><span class="k">ফি</span><span class="v num"><?= e(money($t['fee'])) ?></span></div>
    <?php if (!$credit): ?><div><span class="k">মোট</span><span class="v num"><?= e(money($t['amount'])) ?></span></div><?php endif; ?>
    <div><span class="k">মেথড</span><span class="v"><?= e($methodName) ?></span></div>
    <?php if ($t['cp_name']): ?><div><span class="k"><?= $credit ? 'প্রেরক' : 'প্রাপক' ?></span><span class="v"><?= e($t['cp_name']) ?> <small class="muted">(<?= e($t['cp_uid']) ?>)</small></span></div><?php endif; ?>
    <?php if ($t['account_ref']): ?><div><span class="k">অ্যাকাউন্ট</span><span class="v"><?= e($t['account_ref']) ?></span></div><?php endif; ?>
    <?php if ($t['reference']): ?><div><span class="k">রেফারেন্স</span><span class="v num"><?= e($t['reference']) ?></span></div><?php endif; ?>
    <?php if ($t['balance_after'] !== null && $t['status'] === 'success'): ?><div><span class="k">লেনদেনের পর ব্যালেন্স</span><span class="v num"><?= e(money($t['balance_after'])) ?></span></div><?php endif; ?>
    <div><span class="k">তারিখ</span><span class="v"><?= e(bn_date($t['created_at'])) ?></span></div>
    <?php if ($t['description']): ?><div><span class="k">বিবরণ</span><span class="v"><?= e($t['description']) ?></span></div><?php endif; ?>
    <?php if ($t['admin_note']): ?><div><span class="k">নোট</span><span class="v"><?= e($t['admin_note']) ?></span></div><?php endif; ?>
  </div>
</div>
<div class="row" style="margin-top:12px">
  <?php if ($bp): ?><a href="<?= e(url('/payment/binance-pay/' . $bp['merchant_trade_no'])) ?>" class="btn btn-ghost grow" data-link><?= icon('binance') ?> অর্ডার দেখুন</a><?php endif; ?>
  <a href="<?= e(url('/report?tx=' . $t['uid'])) ?>" class="btn btn-ghost grow" data-link><?= icon('flag') ?> সমস্যা রিপোর্ট করুন</a>
</div>
