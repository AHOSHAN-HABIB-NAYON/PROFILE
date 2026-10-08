<?php
/**
 * Cart shell — lines are rendered by pages/cart.js from the server-priced cart.
 */
?>
<div class="cart-page" data-cart-page>
  <h1 class="page-title"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i> শপিং কার্ট</h1>

  <div class="cart-layout" data-cart-filled>
    <div class="cart-lines" data-cart-lines aria-live="polite">
      <?php for ($i = 0; $i < 3; $i++): ?>
        <div class="cart-line skeleton-line" aria-hidden="true"><span class="sk sk-thumb"></span><span class="sk-col"><span class="sk sk-line"></span><span class="sk sk-line sk-short"></span></span></div>
      <?php endfor; ?>
    </div>

    <aside class="summary card" aria-label="অর্ডার সারাংশ">
      <h2 class="summary-title">অর্ডার সারাংশ</h2>
      <?php if (setting('coupon_enabled') === '1'): ?>
      <form class="coupon-form" method="post" data-coupon-form data-no-spa>
        <label for="cart-coupon" class="sr-only">কুপন কোড</label>
        <input id="cart-coupon" class="input" name="coupon" placeholder="কুপন কোড" autocomplete="off" maxlength="40" data-coupon-input>
        <button type="submit" class="btn btn-outline">প্রয়োগ</button>
      </form>
      <p class="coupon-msg small" data-coupon-msg hidden></p>
      <?php endif; ?>
      <dl class="totals">
        <div><dt>সাবটোটাল</dt><dd data-t="subtotal">—</dd></div>
        <div><dt>ডেলিভারি চার্জ</dt><dd data-t="delivery">চেকআউটে হিসাব হবে</dd></div>
        <div data-discount-row hidden><dt>ডিসকাউন্ট</dt><dd class="text-success" data-t="discount">—</dd></div>
        <div class="totals-grand"><dt>মোট</dt><dd data-t="total">—</dd></div>
      </dl>
      <p class="muted small delivery-note"><i class="fa-solid fa-truck" aria-hidden="true"></i> ঢাকার ভিতরে <?= e(bn_digits((string)(float)setting('delivery_inside'))) ?> টাকা • ঢাকার বাইরে <?= e(bn_digits((string)(float)setting('delivery_outside'))) ?> টাকা</p>
      <a href="<?= e(url('/checkout')) ?>" class="btn btn-primary btn-lg btn-block" data-checkout-btn><i class="fa-solid fa-lock" aria-hidden="true"></i> চেকআউট করুন</a>
      <a href="<?= e(url('/products')) ?>" class="btn btn-ghost btn-block">কেনাকাটা চালিয়ে যান</a>
    </aside>
  </div>

  <div data-cart-empty hidden>
    <?= View::component('empty-state', ['icon' => 'fa-solid fa-cart-arrow-down', 'title' => 'আপনার কার্ট খালি', 'text' => 'পছন্দের পণ্য কার্টে যোগ করুন।', 'cta' => 'কেনাকাটা শুরু করুন', 'href' => '/products']) ?>
  </div>
</div>
