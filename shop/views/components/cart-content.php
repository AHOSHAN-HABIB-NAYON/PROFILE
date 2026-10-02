<?php /** @var array $s */ ?>
<?php if (!$s['lines']): ?>
  <?php View::partial('components/empty', ['icon' => 'shopping-cart', 'title' => 'আপনার কার্ট খালি', 'text' => 'পছন্দের পণ্য কার্টে যোগ করুন।', 'link' => '/products']); ?>
<?php else: ?>
<div class="cart-layout">
  <div class="cart-lines">
    <?php foreach ($s['notices'] as $n): ?><p class="alert alert-warn small"><?= e($n) ?></p><?php endforeach; ?>
    <?php foreach ($s['lines'] as $l): ?>
    <div class="cart-line<?= isset($l['error']) ? ' has-error' : '' ?>" data-key="<?= e($l['key']) ?>">
      <a href="<?= e($l['url']) ?>" class="cart-thumb"><img src="<?= e($l['image_url']) ?>" alt="<?= e($l['name']) ?>" width="72" height="72" loading="lazy"></a>
      <div class="cart-info">
        <a href="<?= e($l['url']) ?>" class="cart-name"><?= e($l['name']) ?></a>
        <div class="cart-sub small muted">
          <?php if ($l['size']): ?><span>সাইজ: <b><?= e($l['size']) ?></b></span><?php endif; ?>
          <?php if ($l['type'] === 'combo'): ?><span class="tag tag-soft">কম্বো</span><?php endif; ?>
          <?php if ($l['free_delivery']): ?><span class="tag tag-free-inline"><i class="fa fa-truck"></i> ফ্রি</span><?php endif; ?>
        </div>
        <div class="price-row"><span class="price"><?= money($l['unit_price']) ?></span><?php if ($l['old_price']): ?><del class="old-price"><?= money($l['old_price']) ?></del><?php endif; ?></div>
        <?php if (isset($l['error'])): ?><p class="field-error"><?= e($l['error']) ?></p><?php endif; ?>
        <div class="cart-controls">
          <div class="qty" role="group" aria-label="পরিমাণ">
            <button type="button" data-qty-dec aria-label="কমান"><i class="fa fa-minus"></i></button>
            <span data-qty><?= bn_num($l['qty']) ?></span>
            <button type="button" data-qty-inc aria-label="বাড়ান"><i class="fa fa-plus"></i></button>
          </div>
          <strong class="line-total"><?= money($l['line_total']) ?></strong>
          <button type="button" class="icon-btn danger" data-remove aria-label="মুছে ফেলুন"><i class="fa fa-trash-o"></i></button>
        </div>
      </div>
    </div>
    <?php endforeach; ?>
  </div>
  <aside class="card summary-card">
    <h2 class="card-title">অর্ডার সামারি</h2>
    <?php if (Settings::on('coupon_enabled')): ?>
    <form class="coupon-form" data-coupon-form>
      <input type="text" name="code" placeholder="কুপন কোড" value="<?= e($s['coupon_code'] ?? '') ?>" aria-label="কুপন কোড" autocomplete="off" maxlength="40">
      <?php if ($s['coupon_code']): ?>
        <button type="button" class="btn btn-soft" data-coupon-remove>সরান</button>
      <?php else: ?>
        <button type="submit" class="btn btn-dark">প্রয়োগ</button>
      <?php endif; ?>
    </form>
    <?php if ($s['coupon_error']): ?><p class="field-error"><?= e($s['coupon_error']) ?></p><?php endif; ?>
    <?php endif; ?>
    <dl class="totals">
      <div><dt>পণ্যের মূল্য (<?= bn_num($s['count']) ?>টি)</dt><dd><?= money($s['subtotal']) ?></dd></div>
      <div><dt>ডেলিভারি</dt><dd>
        <?php if ($s['free_delivery'] || !Settings::on('delivery_enabled')): ?><span class="ok">ফ্রি</span>
        <?php else: ?><span class="muted">চেকআউটে জেলা অনুযায়ী</span><?php endif; ?>
      </dd></div>
      <div class="<?= $s['discount'] > 0 ? 'ok' : '' ?>"><dt>ডিসকাউন্ট<?= $s['coupon_code'] ? ' (' . e($s['coupon_code']) . ')' : '' ?></dt><dd><?= $s['discount'] > 0 ? '-' . money($s['discount']) : money(0) ?></dd></div>
      <div class="grand"><dt>সর্বমোট</dt><dd><?= money($s['subtotal'] - $s['discount']) ?></dd></div>
    </dl>
    <?php if (!$s['free_delivery'] && Settings::on('delivery_enabled')): ?><p class="delivery-note"><i class="fa fa-truck"></i> ঢাকার ভিতরে <?= money(setting('delivery_inside_dhaka')) ?> · ঢাকার বাইরে <?= money(setting('delivery_outside_dhaka')) ?></p><?php endif; ?>
    <a href="/checkout" class="btn btn-primary btn-block btn-lg<?= $s['has_errors'] ? ' disabled' : '' ?>" <?= $s['has_errors'] ? 'aria-disabled="true"' : '' ?>>চেকআউট করুন <i class="fa fa-arrow-right"></i></a>
    <a href="/products" class="btn btn-ghost btn-block btn-sm">কেনাকাটা চালিয়ে যান</a>
    <p class="cod-note small"><i class="fa fa-money"></i> <?= e(setting('cod_info')) ?></p>
  </aside>
</div>
<?php endif; ?>
