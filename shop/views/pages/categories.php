<div class="page container" data-page="categories">
  <h1 class="page-title">ক্যাটাগরি</h1>
  <?php if ($categories): ?>
  <div class="cat-grid">
    <?php foreach ($categories as $c) { View::partial('components/category-tile', ['c' => $c, 'class' => 'cat-tile']); } ?>
  </div>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'th-large', 'title' => 'কোনো ক্যাটাগরি নেই', 'link' => '/products', 'linkText' => 'সকল পণ্য দেখুন']); ?>
  <?php endif; ?>
</div>
