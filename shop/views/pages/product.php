<?php
/** @var array $p @var array $images @var array $related */
$url = abs_url('product/' . rawurlencode($p['slug']));
$shareText = $p['name'] . ' — ' . money($p['effective_price']);
?>
<div class="page container" data-page="product" data-product="<?= (int) $p['id'] ?>" data-event-id="<?= e($event_id) ?>" data-price="<?= e($p['effective_price']) ?>" data-name="<?= e($p['name']) ?>">
  <nav class="crumbs small" aria-label="ব্রেডক্রাম্ব">
    <a href="/">হোম</a><i class="fa fa-angle-right"></i>
    <?php if ($p['category_slug']): ?><a href="/category/<?= e(rawurlencode($p['category_slug'])) ?>"><?= e($p['category_name']) ?></a><i class="fa fa-angle-right"></i><?php endif; ?>
    <span aria-current="page"><?= e(str_limit($p['name'], 40)) ?></span>
  </nav>
  <div class="pd-layout">
    <div class="gallery" data-gallery>
      <div class="gallery-main">
        <div class="gallery-track" data-gallery-track>
          <?php if ($images): foreach ($images as $i => $img): ?>
            <div class="gallery-slide"><?= picture($img['path'], $p['name'] . ' - ছবি ' . ($i + 1), (int) $img['width'] ?: 800, (int) $img['height'] ?: 800, 'gallery-img', $i > 0, 'md') ?></div>
          <?php endforeach; else: ?>
            <div class="gallery-slide"><?= picture(null, $p['name'], 800, 800, 'gallery-img', false) ?></div>
          <?php endif; ?>
        </div>
        <?php if ($p['discount_pct']): ?><span class="tag tag-sale pd-tag">-<?= bn_num($p['discount_pct']) ?>%</span><?php endif; ?>
      </div>
      <?php if (count($images) > 1): ?>
      <div class="thumbs" role="tablist">
        <?php foreach ($images as $i => $img): ?>
          <button type="button" class="thumb<?= $i === 0 ? ' active' : '' ?>" data-thumb="<?= $i ?>" aria-label="ছবি <?= bn_num($i + 1) ?>"><img src="<?= e(img_url($img['path'], 'sm')) ?>" alt="" width="60" height="60" loading="lazy"></button>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </div>

    <div class="pd-info">
      <?php if ($p['category_name']): ?><a class="pd-cat small" href="/category/<?= e(rawurlencode($p['category_slug'])) ?>"><?= e($p['category_name']) ?></a><?php endif; ?>
      <h1 class="pd-title"><?= e($p['name']) ?></h1>
      <div class="price-row lg">
        <span class="price"><?= money($p['effective_price']) ?></span>
        <?php if ($p['compare_price']): ?><del class="old-price"><?= money($p['compare_price']) ?></del><span class="tag tag-sale">-<?= bn_num($p['discount_pct']) ?>%</span><?php endif; ?>
      </div>
      <?php if ($p['flash_active'] && $p['flash_end']): ?>
        <div class="flash-strip"><i class="fa fa-bolt"></i> ফ্ল্যাশ সেল শেষ হবে <span class="countdown" data-countdown="<?= strtotime($p['flash_end']) ?>"></span></div>
      <?php endif; ?>
      <div class="pd-badges">
        <?php if ($p['stock_status'] === 'out'): ?><span class="stock out"><i class="fa fa-circle"></i> স্টকে নেই</span>
        <?php elseif ($p['stock_status'] === 'low'): ?><span class="stock low"><i class="fa fa-circle"></i> মাত্র <?= bn_num($p['stock']) ?>টি বাকি</span>
        <?php else: ?><span class="stock in"><i class="fa fa-circle"></i> স্টকে আছে</span><?php endif; ?>
        <?php if ($p['free_delivery']): ?><span class="tag tag-free-inline"><i class="fa fa-truck"></i> ফ্রি ডেলিভারি</span><?php endif; ?>
        <?php if ($p['sku']): ?><span class="small muted">SKU: <?= e($p['sku']) ?></span><?php endif; ?>
      </div>
      <?php if ($p['short_description']): ?><p class="pd-short"><?= nl2br(e($p['short_description'])) ?></p><?php endif; ?>

      <form class="pd-buy" data-buy-form>
        <input type="hidden" name="id" value="<?= (int) $p['id'] ?>">
        <?php if ($p['sizes']): ?>
        <fieldset class="size-picker">
          <legend>সাইজ নির্বাচন করুন <span class="req">*</span></legend>
          <div class="sizes">
            <?php foreach ($p['sizes'] as $s): ?>
              <label class="size<?= $s['available'] ? '' : ' disabled' ?>"><input type="radio" name="size" value="<?= e($s['size']) ?>"<?= $s['available'] ? '' : ' disabled' ?>><span><?= e($s['size']) ?></span></label>
            <?php endforeach; ?>
          </div>
          <p class="field-error" data-error="size" hidden></p>
        </fieldset>
        <?php endif; ?>
        <?php if ($p['stock_status'] !== 'out'): ?>
        <div class="buy-row">
          <div class="qty" role="group" aria-label="পরিমাণ">
            <button type="button" data-qty-dec aria-label="কমান"><i class="fa fa-minus"></i></button>
            <input type="number" name="qty" value="1" min="1" max="<?= min(20, (int) $p['stock']) ?>" inputmode="numeric" aria-label="পরিমাণ" data-qty-input>
            <button type="button" data-qty-inc aria-label="বাড়ান"><i class="fa fa-plus"></i></button>
          </div>
          <button type="button" class="btn btn-soft grow" data-pd-add><i class="fa fa-cart-plus"></i> কার্টে যোগ করুন</button>
        </div>
        <button type="submit" class="btn btn-primary btn-block btn-cta"><i class="fa fa-bolt"></i> এখনই অর্ডার করুন</button>
        <?php else: ?>
        <button type="button" class="btn btn-muted btn-block" disabled>দুঃখিত, এই পণ্যটি বর্তমানে স্টকে নেই</button>
        <?php endif; ?>
      </form>

      <div class="pd-service">
        <div><i class="fa fa-money"></i><span><b>ক্যাশ অন ডেলিভারি</b><?= e(setting('cod_info')) ?></span></div>
        <div><i class="fa fa-truck"></i><span><b>ডেলিভারি</b><?= $p['free_delivery'] ? 'এই পণ্যে ফ্রি ডেলিভারি। ' : 'ঢাকার ভিতরে ' . money(setting('delivery_inside_dhaka')) . ', বাইরে ' . money(setting('delivery_outside_dhaka')) . '। ' ?><?= e(setting('delivery_info')) ?></span></div>
      </div>

      <div class="share-row">
        <span class="small muted">শেয়ার করুন:</span>
        <a class="share fb" href="https://www.facebook.com/sharer/sharer.php?u=<?= rawurlencode($url) ?>" target="_blank" rel="noopener" data-no-spa aria-label="Facebook-এ শেয়ার"><i class="fa fa-facebook"></i></a>
        <a class="share wa" href="https://wa.me/?text=<?= rawurlencode($shareText . "\n" . $url) ?>" target="_blank" rel="noopener" data-no-spa aria-label="WhatsApp-এ শেয়ার"><i class="fa fa-whatsapp"></i></a>
        <button type="button" class="share cp" data-copy="<?= e($url) ?>" aria-label="লিংক কপি"><i class="fa fa-link"></i></button>
        <button type="button" class="share native" data-share data-title="<?= e($p['name']) ?>" data-text="<?= e($shareText) ?>" data-url="<?= e($url) ?>" aria-label="শেয়ার" hidden><i class="fa fa-share-alt"></i></button>
      </div>
    </div>
  </div>

  <?php if ($p['description']): ?>
  <section class="card pd-desc">
    <h2 class="card-title">পণ্যের বিবরণ</h2>
    <div class="rich-text"><?= $p['description'] /* sanitized on save by HtmlSanitizer */ ?></div>
  </section>
  <?php endif; ?>

  <section class="card pd-details">
    <h2 class="card-title">পণ্যের তথ্য</h2>
    <dl class="spec">
      <div><dt>ক্যাটাগরি</dt><dd><?= e($p['category_name'] ?: '—') ?></dd></div>
      <div><dt>মূল্য</dt><dd><?= money($p['effective_price']) ?></dd></div>
      <div><dt>স্টক</dt><dd><?= $p['stock_status'] === 'out' ? 'স্টকে নেই' : ($p['stock_status'] === 'low' ? 'সীমিত' : 'আছে') ?></dd></div>
      <?php if ($p['sizes']): ?><div><dt>সাইজ</dt><dd><?= e(implode(', ', array_column($p['sizes'], 'size'))) ?></dd></div><?php endif; ?>
      <div><dt>ডেলিভারি</dt><dd><?= $p['free_delivery'] ? 'ফ্রি ডেলিভারি' : 'সারা বাংলাদেশে' ?></dd></div>
      <div><dt>পেমেন্ট</dt><dd>ক্যাশ অন ডেলিভারি</dd></div>
    </dl>
  </section>

  <?php if ($related): ?>
  <section class="section">
    <?php View::partial('components/section-head', ['title' => 'সম্পর্কিত পণ্য']); ?>
    <?php View::partial('components/product-grid', ['items' => $related, 'lazyFrom' => 0]); ?>
  </section>
  <?php endif; ?>

  <?php if ($p['stock_status'] !== 'out'): ?>
  <div class="sticky-buy only-mobile">
    <div><span class="price"><?= money($p['effective_price']) ?></span><?php if ($p['compare_price']): ?> <del class="old-price"><?= money($p['compare_price']) ?></del><?php endif; ?></div>
    <button type="button" class="btn btn-primary btn-sm" data-sticky-order>অর্ডার করুন</button>
  </div>
  <?php endif; ?>
</div>
