<?php
/**
 * Product details.
 * @var array $p @var array $crumbs
 */
$url = absolute_url('/product/' . $p['slug']);
$images = $p['images'];
$hasVariants = $p['sizes'] !== [] || $p['colors'] !== [];
$lowStock = (int)$p['track_stock'] === 1 && $p['stock'] > 0 && $p['stock'] <= (int)setting('low_stock_threshold', 10);
$freeDelivery = (int)$p['is_free_delivery'] === 1 || (int)($p['category_free_delivery'] ?? 0) === 1;
$jsonData = [
    'id' => (int)$p['id'], 'name' => $p['name'], 'price' => (float)$p['price'], 'old_price' => $p['old_price'] !== null ? (float)$p['old_price'] : null,
    'sizes' => $p['sizes'], 'colors' => array_column($p['colors'], 'name'),
    'variants' => array_map(static fn($v) => ['size' => (string)$v['size'], 'color' => (string)$v['color'], 'price' => $v['price'] !== null ? (float)$v['price'] : null, 'stock' => (int)$v['stock']], $p['variants']),
    'track' => (int)$p['track_stock'] === 1 && !Product::canBackorder($p), 'stock' => (int)$p['stock'],
];
$videoId = null;
if ($p['video_url'] && preg_match('~(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))([A-Za-z0-9_-]{11})~', $p['video_url'], $m)) {
    $videoId = $m[1];
}
$share = rawurlencode($url);
?>
<div class="product-page">
  <?= View::component('breadcrumb', ['crumbs' => $crumbs]) ?>

  <div class="pd">
    <section class="gallery" aria-label="পণ্যের ছবি" data-gallery>
      <div class="gallery-main" data-gallery-track>
        <?php if ($images): foreach ($images as $i => $img): ?>
          <figure class="gallery-slide">
            <img src="<?= e(image_url($img['path'], 'md', $img['ext'])) ?>" srcset="<?= e(image_srcset($img['path'], 'product', $img['ext'])) ?>"
                 sizes="(max-width: 900px) 100vw, 560px" width="<?= (int)($img['width'] ?: 1200) ?>" height="<?= (int)($img['height'] ?: 1200) ?>"
                 alt="<?= e($img['alt'] ?: $p['name']) ?>" decoding="async" <?= $i === 0 ? 'fetchpriority="high"' : 'loading="lazy"' ?>>
          </figure>
        <?php endforeach; else: ?>
          <figure class="gallery-slide"><img src="<?= e(asset('images/placeholder.svg')) ?>" alt="<?= e($p['name']) ?>" width="600" height="600"></figure>
        <?php endif; ?>
        <?php if ($videoId): ?>
          <figure class="gallery-slide gallery-video">
            <button type="button" class="video-poster" data-action="play-video" data-video="<?= e($videoId) ?>" aria-label="ভিডিও দেখুন">
              <img src="https://i.ytimg.com/vi/<?= e($videoId) ?>/hqdefault.jpg" alt="" loading="lazy" width="480" height="360">
              <span class="play-icon"><i class="fa-solid fa-play" aria-hidden="true"></i></span>
            </button>
          </figure>
        <?php endif; ?>
      </div>
      <?php if (count($images) + ($videoId ? 1 : 0) > 1): ?>
      <div class="gallery-thumbs">
        <?php foreach ($images as $i => $img): ?>
          <button type="button" class="thumb<?= $i === 0 ? ' is-active' : '' ?>" data-action="gallery-go" data-index="<?= $i ?>" aria-label="ছবি <?= num($i + 1) ?>">
            <img src="<?= e(image_url($img['path'], 'sm', $img['ext'])) ?>" alt="" width="72" height="72" loading="lazy">
          </button>
        <?php endforeach; ?>
        <?php if ($videoId): ?>
          <button type="button" class="thumb thumb-video" data-action="gallery-go" data-index="<?= count($images) ?>" aria-label="ভিডিও"><i class="fa-solid fa-circle-play" aria-hidden="true"></i></button>
        <?php endif; ?>
      </div>
      <?php endif; ?>
      <?php if ($p['discount_percent'] > 0): ?><span class="gallery-badge">-<?= num($p['discount_percent']) ?>%</span><?php endif; ?>
    </section>

    <section class="pd-info" data-product-form>
      <script type="application/json" data-product-json><?= json_attr($jsonData) ?></script>
      <?php if ($p['category_name']): ?><a class="pd-cat" href="<?= e(url('/category/' . $p['category_slug'])) ?>"><?= e($p['category_name']) ?></a><?php endif; ?>
      <h1 class="pd-title"><?= e($p['name']) ?></h1>
      <?php if ($p['sku']): ?><p class="muted small">SKU: <?= e($p['sku']) ?></p><?php endif; ?>

      <div class="pd-price">
        <span class="price price-lg" data-price><?= money($p['price']) ?></span>
        <?php if ($p['discount_percent'] > 0): ?>
          <del class="old-price"><?= money($p['old_price']) ?></del>
          <span class="save-chip"><?= money((float)$p['old_price'] - (float)$p['price']) ?> সাশ্রয়</span>
        <?php endif; ?>
      </div>

      <p class="stock-line" data-stock-line>
        <?php if (!$p['in_stock']): ?><span class="stock stock-out"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i> স্টক শেষ</span>
        <?php elseif ($lowStock): ?><span class="stock stock-low"><i class="fa-solid fa-fire" aria-hidden="true"></i> মাত্র <?= num($p['stock']) ?>টি বাকি</span>
        <?php else: ?><span class="stock stock-in"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> স্টকে আছে</span><?php endif; ?>
      </p>

      <?php if ($p['short_description']): ?><p class="pd-short"><?= nl2br(e($p['short_description'])) ?></p><?php endif; ?>

      <?php if ($p['sizes']): ?>
      <fieldset class="opt-group" data-opt="size">
        <legend class="opt-label">সাইজ নির্বাচন করুন <span class="req">*</span></legend>
        <div class="opt-list">
          <?php foreach ($p['sizes'] as $s): ?>
            <label class="opt-chip"><input type="radio" name="size" value="<?= e($s) ?>"><span><?= e($s) ?></span></label>
          <?php endforeach; ?>
        </div>
        <p class="field-error" data-error-for="size" hidden>সাইজ নির্বাচন করুন</p>
      </fieldset>
      <?php endif; ?>

      <?php if ($p['colors']): ?>
      <fieldset class="opt-group" data-opt="color">
        <legend class="opt-label">রং নির্বাচন করুন <span class="req">*</span></legend>
        <div class="opt-list">
          <?php foreach ($p['colors'] as $c): ?>
            <label class="opt-chip opt-color"><input type="radio" name="color" value="<?= e($c['name']) ?>">
              <span><i class="swatch" style="--swatch: <?= e(preg_match('/^#[0-9a-f]{6}$/i', $c['hex'] ?? '') ? $c['hex'] : '#cccccc') ?>"></i><?= e($c['name']) ?></span>
            </label>
          <?php endforeach; ?>
        </div>
        <p class="field-error" data-error-for="color" hidden>রং নির্বাচন করুন</p>
      </fieldset>
      <?php endif; ?>

      <div class="qty-row">
        <span class="opt-label" id="qty-label">পরিমাণ</span>
        <div class="qty" role="group" aria-labelledby="qty-label">
          <button type="button" class="qty-btn" data-action="qty-dec" aria-label="কমান"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
          <input type="number" class="qty-input" value="1" min="1" max="20" inputmode="numeric" aria-label="পরিমাণ" data-qty>
          <button type="button" class="qty-btn" data-action="qty-inc" aria-label="বাড়ান"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
        </div>
      </div>

      <div class="pd-actions" data-buy-bar>
        <?php if ($p['in_stock']): ?>
          <button type="button" class="btn btn-outline btn-lg" data-action="pd-add"><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> কার্টে যোগ করুন</button>
          <button type="button" class="btn btn-primary btn-lg" data-action="pd-buy"><i class="fa-solid fa-bolt" aria-hidden="true"></i> এখনই অর্ডার করুন</button>
        <?php else: ?>
          <button type="button" class="btn btn-muted btn-lg btn-block" disabled>স্টক শেষ</button>
        <?php endif; ?>
      </div>

      <ul class="delivery-box">
        <li><i class="fa-solid fa-truck-fast" aria-hidden="true"></i>
          <?php if ($freeDelivery): ?><span><strong>ফ্রি ডেলিভারি</strong> — এই পণ্যে কোনো ডেলিভারি চার্জ নেই</span>
          <?php else: ?><span>ঢাকার ভিতরে ডেলিভারি চার্জ: <strong><?= e(bn_digits((string)(float)setting('delivery_inside'))) ?> টাকা</strong> (<?= e(setting('delivery_time_inside')) ?>)<br>ঢাকার বাইরে ডেলিভারি চার্জ: <strong><?= e(bn_digits((string)(float)setting('delivery_outside'))) ?> টাকা</strong> (<?= e(setting('delivery_time_outside')) ?>)</span><?php endif; ?>
        </li>
        <li><i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i><span><strong>ক্যাশ অন ডেলিভারি</strong> — পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন</span></li>
        <li><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>ডেলিভারির সময় পণ্য চেক করে নিন</span></li>
      </ul>

      <div class="share" aria-label="শেয়ার করুন">
        <span class="opt-label">শেয়ার:</span>
        <a class="share-btn fb" href="https://www.facebook.com/sharer/sharer.php?u=<?= $share ?>" target="_blank" rel="noopener" aria-label="Facebook-এ শেয়ার"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></a>
        <a class="share-btn ms" href="fb-messenger://share/?link=<?= $share ?>" aria-label="Messenger-এ শেয়ার"><i class="fa-brands fa-facebook-messenger" aria-hidden="true"></i></a>
        <a class="share-btn wa" href="https://wa.me/?text=<?= rawurlencode($p['name'] . ' — ' . $url) ?>" target="_blank" rel="noopener" aria-label="WhatsApp-এ শেয়ার"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>
        <button type="button" class="share-btn cp" data-action="copy" data-copy="<?= e($url) ?>" aria-label="লিংক কপি করুন"><i class="fa-solid fa-link" aria-hidden="true"></i></button>
        <?php if (setting('whatsapp_number')): ?>
        <a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="<?= e(whatsapp_link((string)setting('whatsapp_number'), "আসসালামু আলাইকুম। আমি এই পণ্যটি সম্পর্কে জানতে চাই:\n" . $p['name'] . "\n" . $url)) ?>"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> জিজ্ঞাসা করুন</a>
        <?php endif; ?>
      </div>
    </section>
  </div>

  <div class="pd-details">
    <?php if ($p['description']): ?>
    <section class="pd-block">
      <h2 class="pd-block-title"><i class="fa-solid fa-align-left" aria-hidden="true"></i> পণ্যের বিবরণ</h2>
      <div class="rich"><?= HtmlSanitizer::clean($p['description']) ?></div>
    </section>
    <?php endif; ?>
    <?php if ($p['features']): ?>
    <section class="pd-block">
      <h2 class="pd-block-title"><i class="fa-solid fa-list-check" aria-hidden="true"></i> বৈশিষ্ট্য</h2>
      <ul class="feature-list">
        <?php foreach ($p['features'] as $f): ?><li><i class="fa-solid fa-check" aria-hidden="true"></i> <?= e($f) ?></li><?php endforeach; ?>
      </ul>
    </section>
    <?php endif; ?>
    <?php if ($p['specifications']): ?>
    <section class="pd-block">
      <h2 class="pd-block-title"><i class="fa-solid fa-table-list" aria-hidden="true"></i> স্পেসিফিকেশন</h2>
      <table class="spec-table">
        <?php foreach ($p['specifications'] as $s): ?>
          <tr><th scope="row"><?= e($s['label'] ?? '') ?></th><td><?= e($s['value'] ?? '') ?></td></tr>
        <?php endforeach; ?>
      </table>
    </section>
    <?php endif; ?>
  </div>

  <section class="home-section related" data-related data-src="<?= e(url('/api/products/' . (int)$p['id'] . '/related')) ?>">
    <?= View::component('section-head', ['title' => 'সম্পর্কিত পণ্য', 'icon' => 'fa-solid fa-shapes', 'link' => $p['category_slug'] ? '/category/' . $p['category_slug'] : '/products']) ?>
    <div class="grid" data-related-grid>
      <?php for ($i = 0; $i < 4; $i++): ?><div class="pcard skeleton-card" aria-hidden="true"><span class="sk sk-media"></span><span class="sk sk-line"></span><span class="sk sk-line sk-short"></span></div><?php endfor; ?>
    </div>
  </section>
</div>
