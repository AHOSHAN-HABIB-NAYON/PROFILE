<?php /** @var array $orders @var string $filter */ ?>
<div class="page container narrow" data-page="my-orders">
  <h1 class="page-title only-desktop-block">আমার অর্ডার</h1>
  <div class="seg-tabs">
    <?php foreach (['all' => 'সব', 'active' => 'চলমান', 'delivered' => 'ডেলিভারড', 'cancelled' => 'বাতিল'] as $k => $l): ?>
      <a href="/my-orders<?= $k === 'all' ? '' : '?status=' . $k ?>" class="<?= $filter === $k ? 'active' : '' ?>"><?= $l ?></a>
    <?php endforeach; ?>
  </div>
  <?php if ($orders): ?>
    <div class="order-cards">
    <?php foreach ($orders as $o): ?>
      <a class="order-card" href="/order-success/<?= e(rawurlencode($o['order_code'])) ?>">
        <img src="<?= e(img_url($o['image'], 'sm')) ?>" alt="" width="52" height="52" loading="lazy">
        <div class="grow">
          <b><?= e($o['order_code']) ?></b>
          <span class="tiny muted"><?= date('d M Y, h:i A', strtotime($o['created_at'])) ?></span>
          <span class="small"><?= e(str_limit((string) $o['first_item'], 28)) ?><?= $o['qty'] > 1 ? ' · ' . bn_num($o['qty']) . 'টি পণ্য' : '' ?></span>
        </div>
        <div class="order-card-right"><strong><?= money($o['total']) ?></strong><span class="ostatus os-<?= e($o['status']) ?>"><?= e(order_status_label($o['status'])) ?></span></div>
      </a>
    <?php endforeach; ?>
    </div>
    <p class="tiny muted center mt-12"><i class="fa fa-lock"></i> শুধুমাত্র এই ডিভাইস থেকে করা অর্ডার দেখানো হচ্ছে।</p>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'list-alt', 'title' => 'কোনো অর্ডার পাওয়া যায়নি', 'text' => 'এই ডিভাইস থেকে করা অর্ডার এখানে দেখাবে।', 'link' => '/products']); ?>
  <?php endif; ?>
</div>
