<?php
/**
 * @var array $sections [['key' => ..., 'data' => ...]]
 */
$firstGrid = true;
$productSections = [
    'flash'         => ['title' => setting('flash_sale_title', 'ফ্ল্যাশ সেল'), 'icon' => 'fa-solid fa-bolt', 'link' => '/products?type=flash'],
    'featured'      => ['title' => 'বাছাই করা পণ্য', 'icon' => 'fa-solid fa-star', 'link' => '/products?type=featured'],
    'combo'         => ['title' => 'কম্বো অফার', 'icon' => 'fa-solid fa-layer-group', 'link' => '/products?type=combo'],
    'free_delivery' => ['title' => 'ফ্রি ডেলিভারি', 'icon' => 'fa-solid fa-truck', 'link' => '/products?type=free'],
    'popular'       => ['title' => 'জনপ্রিয় পণ্য', 'icon' => 'fa-solid fa-fire', 'link' => '/products?sort=popular'],
    'latest'        => ['title' => 'নতুন পণ্য', 'icon' => 'fa-solid fa-wand-magic-sparkles', 'link' => '/products?sort=latest'],
];
?>
<div class="home">
<?php foreach ($sections as $section): $key = $section['key']; $data = $section['data']; ?>

  <?php if ($key === 'hero'): ?>
    <?php if ($data): ?>
    <section class="hero-slider" data-slider aria-roledescription="carousel" aria-label="অফার ব্যানার">
      <div class="slides" data-slides>
        <?php foreach ($data as $i => $b): ?>
        <div class="slide" role="group" aria-roledescription="slide" aria-label="<?= num($i + 1) ?> / <?= num(count($data)) ?>">
          <?php $tag = $b['link'] ? 'a' : 'div'; ?>
          <<?= $tag ?> class="slide-link"<?= $b['link'] ? ' href="' . e($b['link']) . '"' : '' ?>>
            <img src="<?= e(image_url($b['image'], 'md', $b['ext'])) ?>" srcset="<?= e(image_srcset($b['image'], 'banner', $b['ext'])) ?>"
                 sizes="(max-width: 1100px) 100vw, 900px" width="1600" height="800" alt="<?= e($b['title'] ?: setting('store_name')) ?>"
                 decoding="async" <?= $i === 0 ? 'fetchpriority="high"' : 'loading="lazy"' ?>>
            <?php if ($b['title'] || $b['subtitle'] || $b['cta_text']): ?>
            <span class="slide-copy">
              <?php if ($b['title']): ?><strong class="slide-title"><?= e($b['title']) ?></strong><?php endif; ?>
              <?php if ($b['subtitle']): ?><span class="slide-sub"><?= e($b['subtitle']) ?></span><?php endif; ?>
              <?php if ($b['cta_text']): ?><span class="btn btn-light btn-sm"><?= e($b['cta_text']) ?> <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span><?php endif; ?>
            </span>
            <?php endif; ?>
          </<?= $tag ?>>
        </div>
        <?php endforeach; ?>
      </div>
      <?php if (count($data) > 1): ?>
      <div class="slider-dots" role="tablist">
        <?php foreach ($data as $i => $b): ?><button type="button" class="dot<?= $i === 0 ? ' is-active' : '' ?>" data-slide-to="<?= $i ?>" aria-label="ব্যানার <?= num($i + 1) ?>"></button><?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>
    <?php else: ?>
    <section class="hero">
      <div class="hero-copy">
        <span class="hero-kicker"><i class="fa-solid fa-shield-heart" aria-hidden="true"></i> ক্যাশ অন ডেলিভারি</span>
        <h1 class="hero-title"><?= e(setting('hero_title')) ?></h1>
        <p class="hero-sub"><?= e(setting('hero_subtitle')) ?></p>
        <div class="hero-actions">
          <a href="<?= e(url('/products')) ?>" class="btn btn-light"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> কেনাকাটা শুরু করুন</a>
          <a href="<?= e(url('/categories')) ?>" class="btn btn-ghost-light">ক্যাটাগরি দেখুন</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <span class="hero-orb"><i class="fa-solid fa-bag-shopping"></i></span>
        <span class="hero-chip hero-chip-1"><i class="fa-solid fa-truck-fast"></i> দ্রুত ডেলিভারি</span>
        <span class="hero-chip hero-chip-2"><i class="fa-solid fa-hand-holding-dollar"></i> পণ্য হাতে পেয়ে মূল্য</span>
      </div>
    </section>
    <?php endif; ?>
    <ul class="trust">
      <li><i class="fa-solid fa-truck-fast" aria-hidden="true"></i><span>সারা দেশে ডেলিভারি</span></li>
      <li><i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i><span>ক্যাশ অন ডেলিভারি</span></li>
      <li><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>সহজ রিটার্ন</span></li>
      <li><i class="fa-solid fa-headset" aria-hidden="true"></i><span>সাপোর্ট সবসময়</span></li>
    </ul>

  <?php elseif ($key === 'categories'): ?>
    <section class="home-section">
      <?= View::component('section-head', ['title' => 'ক্যাটাগরি', 'icon' => 'fa-solid fa-table-cells-large', 'link' => '/categories']) ?>
      <div class="cat-scroller">
        <?php foreach ($data as $c): ?>
          <a href="<?= e(url('/category/' . $c['slug'])) ?>" class="cat-pill" data-prefetch>
            <span class="cat-pill-icon"><?= Category::iconHtml($c) ?></span>
            <span class="cat-pill-name"><?= e($c['name']) ?></span>
          </a>
        <?php endforeach; ?>
      </div>
    </section>

  <?php elseif ($key === 'coupon'): ?>
    <section class="coupon-card">
      <div class="coupon-left">
        <span class="coupon-tag"><i class="fa-solid fa-ticket" aria-hidden="true"></i> কুপন অফার</span>
        <strong class="coupon-value"><?= e(Coupon::label($data)) ?></strong>
        <span class="coupon-desc"><?= e($data['description'] ?: ($data['min_order'] > 0 ? 'সর্বনিম্ন অর্ডার ' . money($data['min_order']) : 'চেকআউটে কোডটি ব্যবহার করুন')) ?></span>
      </div>
      <button type="button" class="coupon-code" data-action="copy" data-copy="<?= e($data['code']) ?>" aria-label="কুপন কোড কপি করুন">
        <span><?= e($data['code']) ?></span><i class="fa-regular fa-copy" aria-hidden="true"></i>
      </button>
    </section>

  <?php elseif ($key === 'cta'): ?>
    <section class="cta-card">
      <span class="cta-icon"><i class="fa-solid fa-headset" aria-hidden="true"></i></span>
      <div class="cta-copy">
        <h2><?= e(setting('cta_title')) ?></h2>
        <p><?= e(setting('cta_text')) ?></p>
      </div>
      <?php $ctaLink = setting('cta_link') ?: (setting('whatsapp_number') ? whatsapp_link((string)setting('whatsapp_number'), (string)setting('whatsapp_message')) : url('/page/about')); ?>
      <a href="<?= e($ctaLink) ?>" class="btn btn-light"<?= str_starts_with($ctaLink, 'http') ? ' target="_blank" rel="noopener"' : '' ?>>
        <i class="fa-brands fa-whatsapp" aria-hidden="true"></i> <?= e(setting('cta_button')) ?>
      </a>
    </section>

  <?php elseif (isset($productSections[$key])): $cfg = $productSections[$key]; ?>
    <section class="home-section<?= $key === 'flash' ? ' flash' : '' ?>">
      <?php
        $extra = null;
        if ($key === 'flash' && setting('flash_sale_ends_at')) {
            $extra = '<span class="countdown" data-countdown="' . e(date('c', strtotime((string)setting('flash_sale_ends_at')))) . '" aria-label="অফার শেষ হতে বাকি"></span>';
        }
      ?>
      <?= View::component('section-head', ['title' => $cfg['title'], 'icon' => $cfg['icon'], 'link' => $cfg['link'], 'extra' => $extra]) ?>
      <div class="grid<?= in_array($key, ['flash', 'combo'], true) ? ' grid-scroll' : '' ?>">
        <?php foreach ($data as $i => $p): ?>
          <?= View::component('product-card', ['p' => $p, 'eager' => $firstGrid && $i < 2 && empty($sections[0]['data'])]) ?>
        <?php endforeach; $firstGrid = false; ?>
      </div>
    </section>
  <?php endif; ?>

<?php endforeach; ?>
</div>
