<?php
/**
 * "My orders" (this browser's orders) + track by order number & phone.
 * @var array $orders @var ?array $tracked @var ?string $trackError @var string $number @var string $phoneInput
 */
$steps = ['pending' => 'অর্ডার গ্রহণ', 'confirmed' => 'নিশ্চিত', 'sent_to_courier' => 'কুরিয়ারে', 'shipped' => 'পথে', 'delivered' => 'ডেলিভারি'];
?>
<div class="orders-page">
  <h1 class="page-title"><i class="fa-solid fa-receipt" aria-hidden="true"></i> আমার অর্ডার</h1>

  <section class="card track-card">
    <h2 class="card-title"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> অর্ডার ট্র্যাক করুন</h2>
    <form class="track-form" action="<?= e(url('/orders')) ?>" method="get">
      <div class="field">
        <label for="t-order" class="label">অর্ডার নম্বর</label>
        <input id="t-order" class="input" name="order" value="<?= e($number) ?>" placeholder="যেমন: AB12CD34" maxlength="16" autocapitalize="characters" required>
      </div>
      <div class="field">
        <label for="t-phone" class="label">ফোন নাম্বার</label>
        <input id="t-phone" class="input" name="phone" type="tel" inputmode="tel" value="<?= e($phoneInput) ?>" placeholder="01XXXXXXXXX" maxlength="20" required>
      </div>
      <button class="btn btn-primary" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> ট্র্যাক করুন</button>
    </form>
    <?php if ($trackError): ?><p class="form-alert" role="alert"><?= e($trackError) ?></p><?php endif; ?>

    <?php if ($tracked): ?>
      <?php
        $status = $tracked['status'];
        $keys = array_keys($steps);
        $current = array_search($status === 'processing' ? 'confirmed' : $status, $keys, true);
      ?>
      <div class="track-result">
        <p><strong>#<?= e($tracked['order_number']) ?></strong> — <?= status_badge($status, true) ?></p>
        <?php if ($current !== false): ?>
        <ol class="timeline">
          <?php foreach ($keys as $i => $k): ?>
            <li class="<?= $i <= $current ? 'is-done' : '' ?><?= $i === $current ? ' is-current' : '' ?>"><span class="tl-dot"></span><span><?= e($steps[$k]) ?></span></li>
          <?php endforeach; ?>
        </ol>
        <?php endif; ?>
        <p class="muted small">মোট: <?= money($tracked['total']) ?> • <?= e(bn_date($tracked['created_at'], true)) ?></p>
      </div>
    <?php endif; ?>
  </section>

  <section>
    <h2 class="section-title section-title-sm">এই ডিভাইস থেকে করা অর্ডার</h2>
    <?php if (!$orders): ?>
      <?= View::component('empty-state', ['icon' => 'fa-solid fa-box-open', 'title' => 'এখনো কোনো অর্ডার নেই', 'text' => 'অর্ডার করার পর এখানে দেখতে পাবেন।', 'cta' => 'কেনাকাটা শুরু করুন', 'href' => '/products']) ?>
    <?php else: ?>
      <div class="order-list">
        <?php foreach ($orders as $o): ?>
          <a class="order-row card" href="<?= e(url('/order/success/' . $o['order_number'])) ?>">
            <span class="order-row-icon"><i class="fa-solid fa-box" aria-hidden="true"></i></span>
            <span class="order-row-main">
              <strong>#<?= e($o['order_number']) ?></strong>
              <span class="muted small d-block"><?= e(str_limit((string)$o['first_item'], 40)) ?><?= $o['item_count'] > 1 ? ' + আরও ' . num($o['item_count'] - 1) . 'টি' : '' ?></span>
              <span class="muted small"><?= e(bn_date($o['created_at'])) ?></span>
            </span>
            <span class="order-row-side"><?= status_badge($o['status'], true) ?><span class="price"><?= money($o['total']) ?></span></span>
          </a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </section>
</div>
