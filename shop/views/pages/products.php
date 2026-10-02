<div class="page container" data-page="products">
  <div class="page-head">
    <div>
      <h1 class="page-title"><?= e($heading) ?></h1>
      <p class="muted small"><?= bn_num($total) ?>টি পণ্য</p>
    </div>
    <form method="get" class="sort-form" data-auto-submit>
      <?php if ($q !== ''): ?><input type="hidden" name="q" value="<?= e($q) ?>"><?php endif; ?>
      <?php if ($filter): ?><input type="hidden" name="filter" value="<?= e($filter) ?>"><?php endif; ?>
      <label class="sr-only" for="sort">সাজান</label>
      <select name="sort" id="sort" class="select-sm">
        <?php foreach (['new' => 'নতুন আগে', 'popular' => 'জনপ্রিয়', 'price_asc' => 'দাম: কম থেকে বেশি', 'price_desc' => 'দাম: বেশি থেকে কম'] as $k => $v): ?>
          <option value="<?= $k ?>"<?= $sort === $k ? ' selected' : '' ?>><?= $v ?></option>
        <?php endforeach; ?>
      </select>
    </form>
  </div>
  <?php if ($categories): ?>
  <div class="chip-row">
    <a href="/products" class="chip<?= !$category ? ' active' : '' ?>">সব</a>
    <?php foreach ($categories as $c): ?>
      <a href="/category/<?= e(rawurlencode($c['slug'])) ?>" class="chip<?= $category && (int) $category['id'] === (int) $c['id'] ? ' active' : '' ?>"><?= e($c['name']) ?></a>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
  <?php if ($items): ?>
    <?php View::partial('components/product-grid', ['items' => $items]); ?>
    <?php View::partial('components/pagination', ['page' => $page, 'pages' => $pages]); ?>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'search', 'title' => 'কোনো পণ্য পাওয়া যায়নি', 'text' => 'অন্য কিছু লিখে খুঁজে দেখুন।', 'link' => '/products', 'linkText' => 'সকল পণ্য দেখুন']); ?>
  <?php endif; ?>
</div>
