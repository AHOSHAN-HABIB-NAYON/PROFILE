<?php
/** Binance Pay order status page (polls while pending). */
View::$meta['back'] = true;
$o = db()->row('SELECT * FROM binance_pay_orders WHERE merchant_trade_no = ? AND user_id = ?', [$params['trade'], $user['id']]);
if (!$o) {
    View::$meta['title'] = 'অর্ডার পাওয়া যায়নি';
    echo '<div class="card">' . empty_state('binance', 'অর্ডার পাওয়া যায়নি') . '</div>';
    return;
}
$o = BinancePay::refresh($o);
View::$meta['title'] = 'Binance Pay অর্ডার';
$tx = $o['transaction_id'] ? db()->row('SELECT uid FROM transactions WHERE id = ?', [$o['transaction_id']]) : null;
$labels = ['pending' => ['অপেক্ষমাণ', 'warn', 'clock'], 'success' => ['সফল', 'ok', 'check'], 'failed' => ['ব্যর্থ', 'err', 'x'], 'expired' => ['মেয়াদোত্তীর্ণ', 'err', 'clock'], 'cancelled' => ['বাতিল', 'err', 'x']];
[$label, $tone, $ic] = $labels[$o['status']] ?? $labels['pending'];
$link = $o['universal_url'] ?: $o['checkout_url'];
?>
<div class="card" data-order="<?= e($o['merchant_trade_no']) ?>" data-status="<?= e($o['status']) ?>" data-mode="<?= e($o['mode']) ?>">
  <div class="receipt-head">
    <div class="receipt-ic <?= $tone ?>"><?= icon($ic) ?></div>
    <div class="receipt-amount"><?= e(number_format((float) $o['amount'], 2)) ?> <small style="font-size:16px"><?= e($o['currency']) ?></small></div>
    <div class="bp-status"><?php if ($o['status'] === 'pending'): ?><span class="pulse-dot"></span><?php endif; ?><?= e($label) ?></div>
  </div>
  <?php if ($o['status'] === 'pending' && $o['mode'] === 'api'): ?>
    <?php if ($o['qrcode_link'] || $o['qr_content']): ?>
      <div class="bp-qr" <?= $o['qr_content'] ? 'data-qr-content="' . e($o['qr_content']) . '"' : '' ?>><?php if (!$o['qr_content'] && $o['qrcode_link']): ?><img src="<?= e($o['qrcode_link']) ?>" alt="Binance Pay QR"><?php endif; ?></div>
      <p class="center small muted">Binance অ্যাপ দিয়ে QR স্ক্যান করুন</p>
    <?php endif; ?>
    <?php if ($o['expire_at']): ?><p class="center small">সময় বাকি: <span class="timer" data-expire="<?= (int) strtotime((string) $o['expire_at']) ?>">--:--</span></p><?php endif; ?>
    <?php if ($link): ?><a href="<?= e($link) ?>" class="btn btn-binance btn-block btn-lg" target="_blank" rel="noopener"><?= icon('binance') ?> Binance-এ পেমেন্ট করুন</a><?php endif; ?>
    <p class="center small muted" style="margin-top:10px">পেমেন্টের পর এই পেজ স্বয়ংক্রিয়ভাবে আপডেট হবে।</p>
  <?php elseif ($o['status'] === 'pending'): ?>
    <div class="alert alert-warn"><?= icon('clock') ?><div>আপনার পেমেন্ট যাচাই করা হচ্ছে। অনুমোদন হলে নোটিফিকেশন পাবেন।</div></div>
  <?php endif; ?>
  <div class="kv" style="margin-top:12px">
    <div><span class="k">Order ID</span><span class="v num"><?= e($o['merchant_trade_no']) ?><button class="copy-btn" data-copy-text="<?= e($o['merchant_trade_no']) ?>" aria-label="কপি"><?= icon('copy') ?></button></span></div>
    <?php if ($o['binance_order_id']): ?><div><span class="k">Binance Order ID</span><span class="v num"><?= e($o['binance_order_id']) ?></span></div><?php endif; ?>
    <div><span class="k">পরিমাণ</span><span class="v num"><?= e(number_format((float) $o['amount'], 2)) ?> <?= e($o['currency']) ?></span></div>
    <div><span class="k">স্ট্যাটাস</span><span class="v"><?= status_badge($o['status']) ?></span></div>
    <div><span class="k">মোড</span><span class="v"><?= $o['mode'] === 'api' ? 'স্বয়ংক্রিয়' : 'ম্যানুয়াল যাচাই' ?></span></div>
    <div><span class="k">তৈরি</span><span class="v"><?= e(bn_date($o['created_at'])) ?></span></div>
    <?php if ($o['paid_at']): ?><div><span class="k">পরিশোধ</span><span class="v"><?= e(bn_date($o['paid_at'])) ?></span></div><?php endif; ?>
    <?php if ($tx): ?><div><span class="k">লেনদেন</span><span class="v"><a href="<?= e(url('/transaction/' . $tx['uid'])) ?>" data-link><?= e($tx['uid']) ?></a></span></div><?php endif; ?>
  </div>
</div>
<div class="row" style="margin-top:12px">
  <a href="<?= e(url('/payment/binance-pay')) ?>" class="btn btn-ghost grow" data-link>নতুন পেমেন্ট</a>
  <a href="<?= e(url('/wallet')) ?>" class="btn btn-primary grow" data-link>ওয়ালেট</a>
</div>
