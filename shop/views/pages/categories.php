<div class="page container" data-page="categories">
  <h1 class="page-title">ক্যাটাগরি</h1>
  <?php if ($categories): ?>
  <div class="cat-grid">
    <?php foreach ($categories as $c): ?>
    <a href="/category/<?= e(rawurlencode($c['slug'])) ?>" class="cat-tile">
      <span class="cat-icon lg"><?php if ($c['icon_type'] === 'image' && $c['image']): ?><img src="/<?= e($c['image']) ?>" alt="" width="36" height="36" loading="lazy"><?php else: ?><i class="fa fa-<?= e($c['icon'] ?: 'tag') ?>"></i><?php endif; ?></span>
      <span class="cat-name"><?= e($c['name']) ?></span>
      <span class="small muted"><?= bn_num($c['product_count']) ?>টি পণ্য</span>
    </a>
    <?php endforeach; ?>
  </div>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'th-large', 'title' => 'কোনো ক্যাটাগরি নেই', 'link' => '/products', 'linkText' => 'সকল পণ্য দেখুন']); ?>
  <?php endif; ?>
</div>
