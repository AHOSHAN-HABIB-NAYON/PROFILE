<?php
/**
 * @var array $categories
 */
$top = array_values(array_filter($categories, static fn($c) => $c['parent_id'] === null));
?>
<div class="categories-page">
  <?= View::component('breadcrumb', ['crumbs' => [['হোম', '/'], ['ক্যাটাগরি', '/categories']]]) ?>
  <h1 class="page-title">সকল ক্যাটাগরি</h1>
  <?php if (!$top): ?>
    <?= View::component('empty-state', ['icon' => 'fa-solid fa-table-cells-large', 'title' => 'এখনো কোনো ক্যাটাগরি নেই', 'text' => '', 'cta' => 'হোমে ফিরে যান', 'href' => '/']) ?>
  <?php else: ?>
  <div class="cat-grid">
    <?php foreach ($top as $c): ?>
      <a href="<?= e(url('/category/' . $c['slug'])) ?>" class="cat-card" data-prefetch>
        <?php if ($c['image']): ?>
          <img src="<?= e(upload_url($c['image'])) ?>" alt="" class="cat-card-img" width="300" height="300" loading="lazy" decoding="async">
        <?php else: ?>
          <span class="cat-card-icon"><?= Category::iconHtml($c) ?></span>
        <?php endif; ?>
        <span class="cat-card-name"><?= e($c['name']) ?></span>
        <span class="cat-card-count"><?= num($c['product_count']) ?>টি পণ্য</span>
      </a>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>
