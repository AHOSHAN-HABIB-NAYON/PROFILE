<?php
$base = $category ? '/category/' . rawurlencode($category['slug']) : '/products';
$sorts = ['new' => 'নতুন', 'popular' => 'জনপ্রিয়', 'price_asc' => 'কম দাম', 'price_desc' => 'বেশি দাম'];
$keep = static fn (array $extra) => $base . '?' . http_build_query(array_filter(array_merge(['q' => $q, 'filter' => $filter, 'sort' => $sort === 'new' ? '' : $sort, 'min' => $min ?: '', 'max' => $max ?: '', 'stock' => $inStock ? '1' : ''], $extra), static fn ($v) => $v !== '' && $v !== null));
?>
<div class="page container" data-page="products">
  <div class="page-head">
    <div>
      <h1 class="page-title"><?= e($heading) ?></h1>
      <p class="result-count"><?= bn_num($total) ?>টি পণ্য পাওয়া গেছে</p>
    </div>
  </div>

  <form class="list-search" action="<?= e($base) ?>" method="get" role="search">
    <i class="fa fa-search" aria-hidden="true"></i>
    <input type="search" name="q" value="<?= e($q) ?>" placeholder="এই তালিকায় খুঁজুন…" aria-label="পণ্য খুঁজুন">
    <?php foreach (['filter' => $filter, 'sort' => $sort === 'new' ? '' : $sort] as $k => $v): if ($v): ?><input type="hidden" name="<?= $k ?>" value="<?= e($v) ?>"><?php endif; endforeach; ?>
  </form>

  <div class="toolbar-row">
    <button type="button" class="filter-btn" data-open-sheet="filters"><i class="fa fa-sliders"></i> ফিল্টার<?php if ($activeFilters): ?><b><?= bn_num($activeFilters) ?></b><?php endif; ?></button>
    <div class="sort-chips" role="tablist" aria-label="সাজান">
      <?php foreach ($sorts as $k => $l): ?><a href="<?= e($keep(['sort' => $k === 'new' ? '' : $k, 'page' => ''])) ?>" class="chip<?= $sort === $k ? ' active' : '' ?>"><?= $l ?></a><?php endforeach; ?>
    </div>
  </div>

  <?php if ($categories && !$q): ?>
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
    <div class="empty-search">
      <span class="empty-art"><i class="fa fa-search"></i></span>
      <p class="empty-title"><?= $q !== '' ? '"' . e($q) . '" এর জন্য কিছু পাওয়া যায়নি' : 'কোনো পণ্য পাওয়া যায়নি' ?></p>
      <p class="muted">বানান পরীক্ষা করুন অথবা অন্য শব্দ দিয়ে খুঁজুন।</p>
      <a href="/products" class="btn btn-primary">সকল পণ্য দেখুন</a>
    </div>
  <?php endif; ?>

  <div class="sheet" data-sheet="filters" hidden>
    <div class="sheet-backdrop" data-close-sheet></div>
    <form class="sheet-panel filter-panel" action="<?= e($base) ?>" method="get" role="dialog" aria-modal="true" aria-label="ফিল্টার">
      <div class="sheet-handle"></div>
      <div class="sheet-title"><strong>ফিল্টার</strong><a href="<?= e($base) ?>" class="small">সব মুছুন</a></div>
      <?php if ($q !== ''): ?><input type="hidden" name="q" value="<?= e($q) ?>"><?php endif; ?>
      <?php if ($sort !== 'new'): ?><input type="hidden" name="sort" value="<?= e($sort) ?>"><?php endif; ?>
      <p class="filter-label">দামের সীমা (৳)</p>
      <div class="price-range"><input type="number" name="min" value="<?= $min ?: '' ?>" placeholder="সর্বনিম্ন" inputmode="numeric" min="0"><span>—</span><input type="number" name="max" value="<?= $max ?: '' ?>" placeholder="সর্বোচ্চ" inputmode="numeric" min="0"></div>
      <p class="filter-label">অফার</p>
      <div class="choice-row">
        <?php foreach (['' => 'সব', 'flash' => 'ফ্ল্যাশ সেল', 'free' => 'ফ্রি ডেলিভারি', 'featured' => 'ফিচার্ড'] as $k => $l): ?>
          <label class="choice"><input type="radio" name="filter" value="<?= $k ?>"<?= (string) $filter === $k ? ' checked' : '' ?>><span><?= $l ?></span></label>
        <?php endforeach; ?>
      </div>
      <label class="check-row"><input type="checkbox" name="stock" value="1"<?= $inStock ? ' checked' : '' ?>><span>শুধু স্টকে থাকা পণ্য</span></label>
      <button class="btn btn-primary btn-block btn-lg">ফলাফল দেখুন</button>
    </form>
  </div>
</div>
