<?php
/**
 * Product listing for /products, /category/{slug}, /search.
 * @var string $title @var array $result @var array $filters @var string $base @var array $extra_query @var array $crumbs
 * @var ?array $category @var ?array $children @var ?string $q
 */
$query = Listing::query($filters, $extra_query);
?>
<div class="listing">
  <?= View::component('breadcrumb', ['crumbs' => $crumbs]) ?>

  <header class="listing-head">
    <?php if (!empty($category)): ?>
      <span class="listing-icon"><?= Category::iconHtml($category) ?></span>
    <?php endif; ?>
    <div>
      <h1 class="page-title"><?= e($title) ?></h1>
      <p class="muted small"><?= num($result['total']) ?>টি পণ্য<?php if (!empty($category['description'])): ?> • <?= e(str_limit($category['description'], 120)) ?><?php endif; ?></p>
    </div>
  </header>

  <?php if (isset($q)): ?>
  <form class="search-page-form" action="<?= e(url('/search')) ?>" method="get" role="search">
    <label for="search-page-q" class="sr-only">পণ্য খুঁজুন</label>
    <input id="search-page-q" class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="পণ্যের নাম, SKU বা ক্যাটাগরি লিখুন" maxlength="80">
    <button class="btn btn-primary" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> খুঁজুন</button>
  </form>
  <?php endif; ?>

  <?php if (!empty($children)): ?>
  <div class="chip-row">
    <?php foreach ($children as $c): ?>
      <a class="chip" href="<?= e(url('/category/' . $c['slug'])) ?>"><?= Category::iconHtml($c) ?> <?= e($c['name']) ?> <span class="chip-count"><?= num($c['product_count']) ?></span></a>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>

  <form class="filters" action="<?= e(url($base)) ?>" method="get" data-filter-form>
    <?php foreach ($extra_query as $k => $v): ?><input type="hidden" name="<?= e($k) ?>" value="<?= e($v) ?>"><?php endforeach; ?>
    <div class="filter-field">
      <label for="f-sort" class="filter-label">সাজান</label>
      <select id="f-sort" name="sort" class="input input-sm" data-autosubmit>
        <?php foreach (Product::SORT_LABELS as $k => $label): ?>
          <option value="<?= e($k) ?>"<?= $filters['sort'] === $k ? ' selected' : '' ?>><?= e($label) ?></option>
        <?php endforeach; ?>
      </select>
    </div>
    <div class="filter-field filter-price">
      <span class="filter-label">দাম</span>
      <label class="sr-only" for="f-min">সর্বনিম্ন দাম</label>
      <input id="f-min" class="input input-sm" type="number" name="min" min="0" inputmode="numeric" placeholder="সর্বনিম্ন" value="<?= e($filters['min']) ?>">
      <label class="sr-only" for="f-max">সর্বোচ্চ দাম</label>
      <input id="f-max" class="input input-sm" type="number" name="max" min="0" inputmode="numeric" placeholder="সর্বোচ্চ" value="<?= e($filters['max']) ?>">
    </div>
    <label class="check filter-check"><input type="checkbox" name="in_stock" value="1" data-autosubmit<?= $filters['in_stock'] ? ' checked' : '' ?>> <span>শুধু স্টকে আছে</span></label>
    <div class="filter-field">
      <label for="f-pp" class="filter-label">প্রতি পৃষ্ঠায়</label>
      <select id="f-pp" name="per_page" class="input input-sm" data-autosubmit>
        <?php foreach ([12, 24, 36, 48] as $n): ?><option value="<?= $n ?>"<?= (int)$filters['per_page'] === $n ? ' selected' : '' ?>><?= num($n) ?></option><?php endforeach; ?>
      </select>
    </div>
    <button type="submit" class="btn btn-outline btn-sm"><i class="fa-solid fa-filter" aria-hidden="true"></i> প্রয়োগ</button>
  </form>

  <?php if ($result['items']): ?>
    <div class="grid">
      <?php foreach ($result['items'] as $i => $p): ?>
        <?= View::component('product-card', ['p' => $p, 'eager' => $i < 2]) ?>
      <?php endforeach; ?>
    </div>
    <?= View::component('pagination', ['page' => $result['page'], 'pages' => $result['pages'], 'base' => $base, 'query' => $query]) ?>
  <?php else: ?>
    <?= View::component('empty-state', [
        'icon' => 'fa-solid fa-box-open',
        'title' => isset($q) && $q === '' ? 'কী খুঁজছেন লিখুন' : 'কোনো পণ্য পাওয়া যায়নি',
        'text' => isset($q) ? 'অন্য শব্দ দিয়ে চেষ্টা করুন বা ক্যাটাগরি দেখুন।' : 'ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।',
        'cta' => 'সকল পণ্য দেখুন', 'href' => '/products',
    ]) ?>
  <?php endif; ?>
</div>
