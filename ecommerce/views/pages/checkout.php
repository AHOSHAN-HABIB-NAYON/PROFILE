<?php
/**
 * Checkout — no login, Cash on Delivery only.
 * @var ?array $saved previously used details for THIS device @var array $districts @var string $event_id
 */
$insideCharge = bn_digits((string)(float)setting('delivery_inside'));
$outsideCharge = bn_digits((string)(float)setting('delivery_outside'));
?>
<div class="checkout-page" data-checkout data-event-id="<?= e($event_id) ?>">
  <h1 class="page-title"><i class="fa-solid fa-lock" aria-hidden="true"></i> চেকআউট</h1>

  <form class="checkout-layout" method="post" data-checkout-form data-no-spa novalidate>
    <div class="checkout-main">
      <section class="card form-card">
        <h2 class="card-title"><span class="step">১</span> আপনার তথ্য</h2>
        <?php if ($saved): ?>
          <p class="saved-note small"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> আগের অর্ডারের তথ্য দিয়ে পূরণ করা হয়েছে। প্রয়োজনে পরিবর্তন করুন।</p>
        <?php endif; ?>
        <div class="field">
          <label for="co-name" class="label">পূর্ণ নাম <span class="req">*</span></label>
          <input id="co-name" name="name" class="input" autocomplete="name" maxlength="100" required value="<?= e($saved['name'] ?? '') ?>" data-lookup="name">
          <p class="field-error" data-error-for="name" hidden></p>
        </div>
        <div class="field">
          <label for="co-phone" class="label">ফোন নাম্বার <span class="req">*</span></label>
          <input id="co-phone" name="phone" class="input" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="01XXXXXXXXX" required value="<?= e($saved['phone'] ?? '') ?>" data-lookup="phone">
          <p class="field-hint small muted">১১ ডিজিটের মোবাইল নাম্বার দিন</p>
          <p class="field-error" data-error-for="phone" hidden></p>
        </div>
      </section>

      <section class="card form-card">
        <h2 class="card-title"><span class="step">২</span> ডেলিভারি ঠিকানা</h2>
        <div class="field">
          <label for="co-district" class="label">জেলা <span class="req">*</span></label>
          <select id="co-district" name="district" class="input" required data-district>
            <option value="">জেলা নির্বাচন করুন</option>
            <?php foreach ($districts as $d): ?>
              <option value="<?= e($d) ?>"<?= ($saved['district'] ?? '') === $d ? ' selected' : '' ?>><?= e($d) ?></option>
            <?php endforeach; ?>
          </select>
          <p class="field-error" data-error-for="district" hidden></p>
        </div>
        <div class="field">
          <label for="co-address" class="label">পূর্ণ ঠিকানা <span class="req">*</span></label>
          <textarea id="co-address" name="address" class="input" rows="3" maxlength="400" autocomplete="street-address" required placeholder="বাসা/রোড নম্বর, এলাকা, থানা"><?= e($saved['address'] ?? '') ?></textarea>
          <p class="field-error" data-error-for="address" hidden></p>
        </div>
        <div class="field">
          <label for="co-note" class="label">নোট (ঐচ্ছিক)</label>
          <textarea id="co-note" name="note" class="input" rows="2" maxlength="500" placeholder="ডেলিভারি সংক্রান্ত কোনো নির্দেশনা থাকলে লিখুন"></textarea>
        </div>
        <div class="zone-info" data-zone-info>
          <div class="zone" data-zone="inside"><i class="fa-solid fa-city" aria-hidden="true"></i><span>ঢাকার ভিতরে ডেলিভারি চার্জ: <strong><?= e($insideCharge) ?> টাকা</strong></span></div>
          <div class="zone" data-zone="outside"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><span>ঢাকার বাইরে ডেলিভারি চার্জ: <strong><?= e($outsideCharge) ?> টাকা</strong></span></div>
        </div>
      </section>

      <section class="card form-card">
        <h2 class="card-title"><span class="step">৩</span> পেমেন্ট পদ্ধতি</h2>
        <label class="pay-option is-selected">
          <input type="radio" name="payment" value="cod" checked>
          <span class="pay-icon"><i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i></span>
          <span><strong>ক্যাশ অন ডেলিভারি</strong><span class="muted small d-block">পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন</span></span>
          <i class="fa-solid fa-circle-check pay-check" aria-hidden="true"></i>
        </label>
      </section>
    </div>

    <aside class="checkout-side">
      <section class="card summary">
        <h2 class="summary-title">অর্ডার তথ্য</h2>
        <div class="co-items" data-co-items>
          <div class="cart-line skeleton-line" aria-hidden="true"><span class="sk sk-thumb"></span><span class="sk-col"><span class="sk sk-line"></span><span class="sk sk-line sk-short"></span></span></div>
        </div>
        <?php if (setting('coupon_enabled') === '1'): ?>
        <div class="coupon-form">
          <label for="co-coupon" class="sr-only">কুপন কোড</label>
          <input id="co-coupon" class="input" name="coupon" placeholder="কুপন কোড (যদি থাকে)" autocomplete="off" maxlength="40" data-coupon-input>
          <button type="button" class="btn btn-outline" data-action="apply-coupon">প্রয়োগ</button>
        </div>
        <p class="coupon-msg small" data-coupon-msg hidden></p>
        <?php endif; ?>
        <dl class="totals">
          <div><dt>সাবটোটাল</dt><dd data-t="subtotal">—</dd></div>
          <div><dt>ডেলিভারি চার্জ</dt><dd data-t="delivery">জেলা নির্বাচন করুন</dd></div>
          <div data-discount-row hidden><dt>ডিসকাউন্ট</dt><dd class="text-success" data-t="discount">—</dd></div>
          <div class="totals-grand"><dt>সর্বমোট</dt><dd data-t="total">—</dd></div>
        </dl>
        <p class="form-alert" data-form-alert role="alert" hidden></p>
        <button type="submit" class="btn btn-primary btn-lg btn-block" data-submit>
          <i class="fa-solid fa-circle-check" aria-hidden="true"></i> <span data-submit-label>অর্ডার কনফার্ম করুন</span>
        </button>
        <p class="muted small center"><?= e(setting('text_checkout_note')) ?></p>
      </section>
    </aside>
  </form>

  <div data-cart-empty hidden>
    <?= View::component('empty-state', ['icon' => 'fa-solid fa-cart-arrow-down', 'title' => 'আপনার কার্ট খালি', 'text' => 'অর্ডার করতে প্রথমে পণ্য কার্টে যোগ করুন।', 'cta' => 'কেনাকাটা শুরু করুন', 'href' => '/products']) ?>
  </div>
</div>
