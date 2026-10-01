<?php
/** Wallet overview. */
View::$meta['title'] = 'ওয়ালেট';
$uid = (int) $user['id'];
$w = Wallet::forUser($uid);
$recent = db()->all('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 6', [$uid]);
$saved = db()->all('SELECT upm.*, pm.name AS method_name, pm.icon, pm.color FROM user_payment_methods upm LEFT JOIN payment_methods pm ON pm.code = upm.method_code WHERE upm.user_id = ? ORDER BY upm.id DESC', [$uid]);
$totIn = (float) db()->val("SELECT COALESCE(SUM(net_amount),0) FROM transactions WHERE user_id = ? AND direction = 'credit' AND status = 'success'", [$uid]);
$totOut = (float) db()->val("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id = ? AND direction = 'debit' AND status = 'success'", [$uid]);
$total = (float) $w['balance'] + (float) $w['locked_balance'];
?>
<section class="balance-card">
  <p class="label"><?= icon('wallet') ?> মোট ব্যালেন্স <button type="button" class="balance-toggle" data-action="toggle-balance" aria-label="ব্যালেন্স লুকান/দেখান"><?= icon('eye') ?></button></p>
  <div class="balance-amount"><span><?= e(money($total)) ?></span><small><?= e(currency()) ?></small></div>
  <div class="balance-meta"><span>ব্যবহারযোগ্য: <b><?= e(money($w['balance'])) ?></b></span><span>প্রক্রিয়াধীন: <b><?= e(money($w['locked_balance'])) ?></b></span></div>
  <div class="balance-actions">
    <a href="<?= e(url('/wallet/deposit')) ?>" data-link><?= icon('arrow-down') ?>জমা</a>
    <a href="<?= e(url('/wallet/withdraw')) ?>" data-link><?= icon('arrow-up') ?>উত্তোলন</a>
    <a href="<?= e(url('/wallet/transfer')) ?>" data-link><?= icon('send') ?>ট্রান্সফার</a>
  </div>
</section>
<?php if ($w['status'] !== 'active'): ?><div class="alert alert-err" style="margin-top:12px"><?= icon('lock') ?><div>আপনার ওয়ালেট সাময়িকভাবে বন্ধ আছে। সাপোর্টে যোগাযোগ করুন।</div></div><?php endif; ?>

<div class="wallet-stats" style="margin-top:14px">
  <div class="card stat"><small>মোট জমা/গ্রহণ</small><b class="num" style="color:var(--ok)">+<?= e(money($totIn)) ?></b></div>
  <div class="card stat"><small>মোট খরচ/প্রেরণ</small><b class="num">−<?= e(money($totOut)) ?></b></div>
</div>

<section class="dash-section">
  <div class="quick-grid">
    <a href="<?= e(url('/wallet/deposit')) ?>" class="quick" data-link><span class="q-ic"><?= icon('arrow-down') ?></span>জমা</a>
    <a href="<?= e(url('/wallet/withdraw')) ?>" class="quick" data-link><span class="q-ic"><?= icon('arrow-up') ?></span>উত্তোলন</a>
    <a href="<?= e(url('/wallet/transfer')) ?>" class="quick" data-link><span class="q-ic"><?= icon('send') ?></span>ট্রান্সফার</a>
    <a href="<?= e(url('/services')) ?>" class="quick" data-link><span class="q-ic"><?= icon('card') ?></span>পেমেন্ট</a>
    <a href="<?= e(url('/payment/binance-pay')) ?>" class="quick" data-link><span class="q-ic binance"><?= icon('binance') ?></span>Binance</a>
  </div>
</section>

<section class="dash-section">
  <div class="card-head"><h2 class="card-title">সংরক্ষিত পেমেন্ট মেথড</h2></div>
  <?php if ($saved): ?>
    <div class="list">
      <?php foreach ($saved as $s): ?>
        <div class="list-item" data-item>
          <span class="tx-ic" style="background:<?= e($s['color'] ?: '#5b4bff') ?>;color:#fff"><?= media_icon($s['icon'] ?: 'card') ?></span>
          <span class="li-main"><span class="li-title"><?= e($s['label']) ?></span><span class="li-sub"><?= e($s['method_name'] ?: $s['method_code']) ?> · <?= e($s['account_ref']) ?></span></span>
          <button class="icon-btn" data-post="<?= e(url('/api/wallet/delete-saved')) ?>" data-id="<?= (int) $s['id'] ?>" data-confirm="এই সংরক্ষিত মেথডটি মুছে ফেলবেন?" data-danger data-then="remove" aria-label="মুছুন"><?= icon('trash') ?></button>
        </div>
      <?php endforeach; ?>
    </div>
  <?php else: ?>
    <div class="card small muted">উত্তোলনের সময় "অ্যাকাউন্ট সংরক্ষণ করুন" বেছে নিলে এখানে দেখা যাবে।</div>
  <?php endif; ?>
</section>

<section class="dash-section">
  <div class="card-head"><h2 class="card-title">লেনদেন হিস্ট্রি</h2><a href="<?= e(url('/transactions')) ?>" data-link>সব দেখুন</a></div>
  <?php if ($recent): ?><div class="list"><?php foreach ($recent as $t) echo tx_item($t); ?></div>
  <?php else: ?><div class="card"><?= empty_state('history', 'এখনো কোনো লেনদেন নেই') ?></div><?php endif; ?>
</section>
