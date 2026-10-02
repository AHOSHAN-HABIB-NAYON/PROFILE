<?php $zone = $s['delivery']['zone']; $free = $s['free_delivery'] || !Settings::on('delivery_enabled'); ?>
<div class="page container" data-page="checkout" data-event-id="<?= e($event_id) ?>" data-value="<?= e($s['total']) ?>" data-items="<?= (int) $s['count'] ?>">
  <h1 class="page-title">চেকআউট</h1>
  <?php if (!$s['lines']): ?>
    <?php View::partial('components/empty', ['icon' => 'shopping-cart', 'title' => 'আপনার কার্ট খালি', 'text' => 'অর্ডার করতে আগে পণ্য কার্টে যোগ করুন।', 'link' => '/products']); ?>
  <?php else: ?>
  <form class="checkout-layout" data-checkout-form novalidate>
    <input type="hidden" name="checkout_token" value="<?= e($token) ?>">
    <input type="hidden" name="payment_method" value="COD">
    <div class="stack-16">
      <section class="card form-card">
        <h2 class="card-title"><span class="title-ic"><i class="fa fa-cube"></i></span> অর্ডারের তথ্য</h2>
        <p class="form-intro">লগইন ছাড়াই অর্ডার করুন — আমাদের প্রতিনিধি কল করে অর্ডার নিশ্চিত করবেন।</p>

        <div class="suggest-box" data-suggest hidden>
          <div class="suggest-head"><i class="fa fa-user-circle"></i><div><b>আগের অর্ডারের তথ্য পাওয়া গেছে</b><span data-suggest-text></span></div></div>
          <div class="suggest-actions"><button type="button" class="btn btn-primary btn-sm" data-suggest-use>এই তথ্য ব্যবহার করুন</button><button type="button" class="btn btn-ghost btn-sm" data-suggest-dismiss>না, ধন্যবাদ</button></div>
        </div>

        <div class="field">
          <label for="co-name">পুরো নাম <span class="req">*</span></label>
          <div class="input-ic"><i class="fa fa-user"></i><input id="co-name" name="name" type="text" autocomplete="name" placeholder="আপনার পুরো নাম লিখুন" maxlength="100" required list="co-name-list"></div>
          <datalist id="co-name-list"></datalist>
          <p class="field-error" data-error="name" hidden></p>
        </div>
        <div class="field">
          <label for="co-phone">ফোন নাম্বার <span class="req">*</span></label>
          <div class="input-ic"><i class="fa fa-phone"></i><input id="co-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" maxlength="16" required></div>
          <p class="field-hint" data-lookup-hint hidden></p>
          <p class="field-error" data-error="phone" hidden></p>
        </div>
        <div class="field">
          <label for="co-district">জেলা <span class="req">*</span></label>
          <div class="input-ic"><i class="fa fa-map-marker"></i><input id="co-district" name="district" type="text" autocomplete="address-level2" placeholder="যেমন: ঢাকা, চট্টগ্রাম, সিলেট" maxlength="60" required></div>
          <p class="field-error" data-error="district" hidden></p>
        </div>
        <div class="field">
          <label for="co-address">পূর্ণ ঠিকানা <span class="req">*</span></label>
          <textarea id="co-address" name="address" rows="2" autocomplete="street-address" placeholder="বাসা/রোড নম্বর, এলাকা, থানা" maxlength="400" required></textarea>
          <p class="field-error" data-error="address" hidden></p>
        </div>
        <div class="field mb-0">
          <label for="co-note">নোট <span class="optional">(ইচ্ছিক)</span></label>
          <textarea id="co-note" name="note" rows="2" placeholder="বিশেষ কোনো নির্দেশনা থাকলে লিখুন" maxlength="400"></textarea>
          <p class="field-error" data-error="note" hidden></p>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title"><span class="title-ic"><i class="fa fa-truck"></i></span> ডেলিভারি চার্জ</h2>
        <?php if ($free): ?>
          <div class="zone-row active"><span><i class="fa fa-check-circle"></i> আপনার অর্ডারে</span><b class="ok">ফ্রি</b></div>
        <?php else: ?>
          <div class="zone-row<?= $zone === 'inside' ? ' active' : '' ?>" data-zone="inside"><span><i class="fa fa-check-circle"></i> ঢাকার ভিতরে</span><b><?= money(setting('delivery_inside_dhaka')) ?></b></div>
          <div class="zone-row<?= $zone === 'outside' ? ' active' : '' ?>" data-zone="outside"><span><i class="fa fa-check-circle"></i> ঢাকার বাইরে</span><b><?= money(setting('delivery_outside_dhaka')) ?></b></div>
          <p class="field-hint mt-8">জেলা লিখলে স্বয়ংক্রিয়ভাবে নির্ধারিত হবে।</p>
        <?php endif; ?>
      </section>

      <section class="card">
        <h2 class="card-title"><span class="title-ic"><i class="fa fa-credit-card"></i></span> পেমেন্ট পদ্ধতি</h2>
        <div class="pay-card">
          <span class="pay-ic"><i class="fa fa-money"></i></span>
          <div class="grow"><b>ক্যাশ অন ডেলিভারি</b><span>পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন।</span></div>
          <span class="pay-check"><i class="fa fa-check"></i></span>
        </div>
      </section>
    </div>

    <aside class="card summary-card">
      <h2 class="card-title"><span class="title-ic"><i class="fa fa-file-text-o"></i></span> বিল সামারি</h2>
      <div data-checkout-summary><?php View::partial('components/checkout-summary', ['s' => $s]); ?></div>
      <?php if (Settings::on('coupon_enabled')): ?>
      <details class="coupon-toggle"<?= $s['coupon_code'] ? ' open' : '' ?>>
        <summary><i class="fa fa-ticket"></i> কুপন কোড আছে?</summary>
        <div class="coupon-form" data-checkout-coupon>
          <input type="text" name="coupon" placeholder="কুপন কোড" value="<?= e($s['coupon_code'] ?? '') ?>" aria-label="কুপন কোড" autocomplete="off" maxlength="40">
          <button type="button" class="btn btn-dark" data-apply-coupon>প্রয়োগ</button>
        </div>
      </details>
      <?php endif; ?>
      <button type="submit" class="btn btn-primary btn-block btn-xl" data-submit><i class="fa fa-check-circle"></i> অর্ডার কনফার্ম করুন</button>
      <p class="secure-note"><i class="fa fa-lock"></i> আপনার তথ্য নিরাপদ — শুধুমাত্র ডেলিভারির জন্য ব্যবহৃত হবে।</p>
    </aside>
  </form>
  <?php endif; ?>
</div>
