<?php
/** App home: greeting, balance, quick actions, recent tx, services, releases, announcements. */
View::$meta['title'] = 'হোম';
View::$meta['heading'] = setting('site_name', 'Probaho');
$uid = (int) $user['id'];
$wallet = Wallet::forUser($uid);
$recent = db()->all('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 5', [$uid]);
$services = db()->all('SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order, id LIMIT 8');
$products = db()->all("SELECT * FROM products WHERE status = 'published' ORDER BY is_featured DESC, published_at DESC LIMIT 4");
$posts = db()->all("SELECT * FROM product_posts WHERE status = 'published' ORDER BY is_pinned DESC, created_at DESC LIMIT 3");
$monthIn = (float) db()->val("SELECT COALESCE(SUM(net_amount),0) FROM transactions WHERE user_id = ? AND direction = 'credit' AND status = 'success' AND created_at >= ?", [$uid, date('Y-m-01')]);
$monthOut = (float) db()->val("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id = ? AND direction = 'debit' AND status IN ('success','pending') AND created_at >= ?", [$uid, date('Y-m-01')]);
$firstName = explode(' ', trim((string) $user['name']))[0];
$quick = [
    ['/wallet/deposit', 'arrow-down', 'জমা', ''],
    ['/wallet/withdraw', 'arrow-up', 'উত্তোলন', ''],
    ['/wallet/transfer', 'send', 'ট্রান্সফার', ''],
    ['/payment/binance-pay', 'binance', 'Binance Pay', 'binance'],
    ['/qr', 'qr', 'QR Pay', ''],
];
?>
<div class="greet">
  <div class="grow"><small><?= e(greeting()) ?> 👋</small><b><?= e($firstName) ?></b></div>
  <a href="<?= e(url('/notifications')) ?>" class="icon-btn bell" data-link aria-label="নোটিফিকেশন"><?= icon('bell') ?></a>
</div>

<?php if (Auth::needsVerification($user)): ?>
  <div class="alert alert-warn" style="margin-bottom:14px"><?= icon('mail') ?><div>আপনার ইমেইল এখনো ভেরিফাই করা হয়নি। <button class="btn btn-sm btn-soft" data-post="<?= e(url('/api/profile/resend-verification')) ?>" data-then="none">লিংক আবার পাঠান</button></div></div>
<?php endif; ?>

<section class="balance-card">
  <p class="label"><?= icon('wallet') ?> মোট ব্যালেন্স <button type="button" class="balance-toggle" data-action="toggle-balance" aria-label="ব্যালেন্স লুকান/দেখান"><?= icon('eye') ?></button></p>
  <div class="balance-amount"><span><?= e(money($wallet['balance'])) ?></span><small><?= e(currency()) ?></small></div>
  <div class="balance-meta"><span>এই মাসে আয়: <b><?= e(money($monthIn)) ?></b></span><span>খরচ: <b><?= e(money($monthOut)) ?></b></span></div>
  <div class="balance-actions">
    <a href="<?= e(url('/wallet/deposit')) ?>" data-link><?= icon('plus') ?>টাকা যোগ</a>
    <a href="<?= e(url('/wallet/transfer')) ?>" data-link><?= icon('send') ?>পাঠান</a>
    <a href="<?= e(url('/transactions')) ?>" data-link><?= icon('history') ?>হিস্ট্রি</a>
  </div>
</section>

<section class="dash-section">
  <div class="quick-grid">
    <?php foreach ($quick as [$href, $ic, $label, $cls]): ?>
      <a href="<?= e(url($href)) ?>" class="quick" data-link><span class="q-ic <?= e($cls) ?>"><?= icon($ic) ?></span><?= e($label) ?></a>
    <?php endforeach; ?>
  </div>
</section>

<?php foreach ($posts as $p): ?>
<section class="dash-section">
  <a href="<?= e(url($p['url'] ?: '/notifications')) ?>" class="announce" data-link>
    <span class="ic-box"><?= icon('megaphone') ?></span>
    <span class="grow"><b><?= e($p['title']) ?></b><p><?= e(mb_strimwidth((string) $p['body'], 0, 150, '…')) ?></p></span>
  </a>
</section>
<?php endforeach; ?>

<section class="dash-section">
  <div class="card-head"><h2 class="card-title">সার্ভিস</h2><a href="<?= e(url('/services')) ?>" data-link>সব দেখুন</a></div>
  <div class="service-grid"><?php foreach (array_slice($services, 0, 6) as $s) echo service_tile($s); ?></div>
</section>

<section class="dash-section">
  <div class="card-head"><h2 class="card-title">সাম্প্রতিক লেনদেন</h2><a href="<?= e(url('/transactions')) ?>" data-link>সব দেখুন</a></div>
  <?php if ($recent): ?>
    <div class="list"><?php foreach ($recent as $t) echo tx_item($t); ?></div>
  <?php else: ?>
    <div class="card"><?= empty_state('history', 'এখনো কোনো লেনদেন নেই', 'প্রথম জমা দিয়ে শুরু করুন।', '<a href="' . e(url('/wallet/deposit')) . '" class="btn btn-primary btn-sm" data-link>টাকা যোগ করুন</a>') ?></div>
  <?php endif; ?>
</section>

<?php if ($products): ?>
<section class="dash-section">
  <div class="card-head"><h2 class="card-title">নতুন রিলিজ</h2><a href="<?= e(url('/products')) ?>" data-link>সব দেখুন</a></div>
  <div class="h-scroll"><?php foreach ($products as $p) echo product_card($p); ?></div>
</section>
<?php endif; ?>
