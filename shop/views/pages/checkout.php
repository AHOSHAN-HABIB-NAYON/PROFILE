<div class="page container" data-page="checkout" data-event-id="<?= e($event_id) ?>" data-value="<?= e($s['total']) ?>" data-items="<?= (int) $s['count'] ?>">
  <h1 class="page-title">চেকআউট</h1>
  <?php if (!$s['lines']): ?>
    <?php View::partial('components/empty', ['icon' => 'shopping-cart', 'title' => 'আপনার কার্ট খালি', 'text' => 'অর্ডার করতে আগে পণ্য কার্টে যোগ করুন।', 'link' => '/products']); ?>
  <?php else: ?>
  <form class="checkout-layout" data-checkout-form novalidate>
    <input type="hidden" name="checkout_token" value="<?= e($token) ?>">
    <input type="hidden" name="payment_method" value="COD">
    <section class="card">
      <h2 class="card-title"><i class="fa fa-map-marker"></i> ডেলিভারি তথ্য</h2>
      <p class="muted small mb-12">লগইন ছাড়াই অর্ডার করুন। আমাদের প্রতিনিধি কল করে অর্ডার নিশ্চিত করবেন।</p>
      <div class="field">
        <label for="co-phone">ফোন নাম্বার <span class="req">*</span></label>
        <input id="co-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" maxlength="16" required>
        <p class="field-hint" data-lookup-hint hidden></p>
        <p class="field-error" data-error="phone" hidden></p>
      </div>
      <div class="field">
        <label for="co-name">পুরো নাম <span class="req">*</span></label>
        <input id="co-name" name="name" type="text" autocomplete="name" placeholder="আপনার নাম" maxlength="100" required list="co-name-list">
        <datalist id="co-name-list"></datalist>
        <p class="field-error" data-error="name" hidden></p>
      </div>
      <div class="field">
        <label for="co-district">জেলা <span class="req">*</span></label>
        <input id="co-district" name="district" type="text" autocomplete="address-level2" placeholder="যেমন: ঢাকা, চট্টগ্রাম" maxlength="60" required>
        <p class="field-hint">ঢাকার ভিতরে <?= money(setting('delivery_inside_dhaka')) ?> · ঢাকার বাইরে <?= money(setting('delivery_outside_dhaka')) ?></p>
        <p class="field-error" data-error="district" hidden></p>
      </div>
      <div class="field">
        <label for="co-address">পূর্ণ ঠিকানা <span class="req">*</span></label>
        <textarea id="co-address" name="address" rows="2" autocomplete="street-address" placeholder="বাসা/রোড, এলাকা, থানা" maxlength="400" required></textarea>
        <p class="field-error" data-error="address" hidden></p>
      </div>
      <div class="field">
        <label for="co-note">নোট <span class="muted small">(ঐচ্ছিক)</span></label>
        <textarea id="co-note" name="note" rows="2" placeholder="বিশেষ কোনো নির্দেশনা থাকলে লিখুন" maxlength="400"></textarea>
        <p class="field-error" data-error="note" hidden></p>
      </div>
    </section>
    <aside class="card summary-card">
      <h2 class="card-title"><i class="fa fa-file-text-o"></i> বিল সামারি</h2>
      <div data-checkout-summary><?php View::partial('components/checkout-summary', ['s' => $s]); ?></div>
      <?php if (Settings::on('coupon_enabled')): ?>
      <details class="coupon-toggle"<?= $s['coupon_code'] ? ' open' : '' ?>>
        <summary>কুপন কোড আছে?</summary>
        <div class="coupon-form" data-checkout-coupon>
          <input type="text" name="coupon" placeholder="কুপন কোড" value="<?= e($s['coupon_code'] ?? '') ?>" aria-label="কুপন কোড" autocomplete="off" maxlength="40">
          <button type="button" class="btn btn-dark btn-sm" data-apply-coupon>প্রয়োগ</button>
        </div>
      </details>
      <?php endif; ?>
      <div class="pay-method">
        <label class="radio-card checked"><input type="radio" checked disabled> <i class="fa fa-money"></i>
          <span><b>ক্যাশ অন ডেলিভারি</b><small><?= e(setting('cod_info')) ?></small></span></label>
      </div>
      <button type="submit" class="btn btn-primary btn-block btn-cta" data-submit><i class="fa fa-check-circle"></i> অর্ডার নিশ্চিত করুন</button>
      <p class="small muted center mt-8"><i class="fa fa-lock"></i> আপনার তথ্য নিরাপদ। শুধুমাত্র ডেলিভারির জন্য ব্যবহৃত হবে।</p>
    </aside>
  </form>
  <?php endif; ?>
</div>
