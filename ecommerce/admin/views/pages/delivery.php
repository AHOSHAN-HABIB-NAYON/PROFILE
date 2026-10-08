<?php
/**
 * @var array $districts @var array $inside @var array $freeCategories @var int $freeProducts
 */
?>
<div class="a-page">
  <div class="page-head"><div><h1 class="a-title">Delivery</h1><p class="muted small">Charges shown on product, cart and checkout pages are taken from here.</p></div></div>
  <form method="post" action="<?= e(url('/admin/delivery')) ?>" data-ajax data-no-spa class="settings-form">
    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-truck" aria-hidden="true"></i> Delivery charges</h2>
      <div class="grid-2">
        <div class="field"><label class="label" for="d-in">ঢাকার ভিতরে ডেলিভারি চার্জ (৳)</label><input id="d-in" class="input" type="number" min="0" step="1" name="delivery_inside" value="<?= e(setting('delivery_inside')) ?>" required></div>
        <div class="field"><label class="label" for="d-out">ঢাকার বাইরে ডেলিভারি চার্জ (৳)</label><input id="d-out" class="input" type="number" min="0" step="1" name="delivery_outside" value="<?= e(setting('delivery_outside')) ?>" required></div>
      </div>
      <div class="grid-2">
        <div class="field"><label class="label" for="d-tin">Delivery time inside</label><input id="d-tin" class="input" name="delivery_time_inside" value="<?= e(setting('delivery_time_inside')) ?>"></div>
        <div class="field"><label class="label" for="d-tout">Delivery time outside</label><input id="d-tout" class="input" name="delivery_time_outside" value="<?= e(setting('delivery_time_outside')) ?>"></div>
      </div>
      <div class="field"><label class="label" for="d-min">Minimum order amount (৳, 0 = none)</label><input id="d-min" class="input" type="number" min="0" name="order_min_amount" value="<?= e(setting('order_min_amount')) ?>"></div>
    </section>
    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> Districts charged as “inside Dhaka”</h2>
      <div class="check-grid">
        <?php foreach ($districts as $d): ?><label class="check"><input type="checkbox" name="inside_districts[]" value="<?= e($d) ?>"<?= in_array($d, $inside, true) ? ' checked' : '' ?>> <?= e($d) ?></label><?php endforeach; ?>
      </div>
    </section>
    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-gift" aria-hidden="true"></i> Free delivery</h2>
      <label class="switch-row"><input type="checkbox" name="free_delivery_enabled" value="1"<?= setting('free_delivery_enabled') === '1' ? ' checked' : '' ?>><span class="toggle"></span><span>Store-wide free delivery offer</span></label>
      <div class="field"><label class="label" for="d-thr">Free delivery when subtotal reaches (৳, 0 = always free while enabled)</label><input id="d-thr" class="input" type="number" min="0" name="free_delivery_threshold" value="<?= e(setting('free_delivery_threshold')) ?>"></div>
      <p class="muted small">Product-level: <?= $freeProducts ?> product(s) marked free delivery. Category-level: <?= $freeCategories ? e(implode(', ', array_column($freeCategories, 'name'))) : 'none' ?>. An order ships free when every item is free-delivery.</p>
    </section>
    <div class="save-bar"><button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save delivery settings</button></div>
  </form>
</div>
