<?php
/**
 * @var array $rows @var int $total @var int $page @var int $pages @var string $q @var string $filter @var int $category
 * @var array $categories @var array $filters @var int $threshold
 */
?>
<div class="a-page">
  <div class="page-head">
    <div><h1 class="a-title">Products</h1><p class="muted small"><?= number_format($total) ?> product(s)</p></div>
    <a href="<?= e(url('/admin/products/create')) ?>" class="btn btn-primary"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add product</a>
  </div>

  <form class="toolbar" method="get" action="<?= e(url('/admin/products')) ?>">
    <label class="sr-only" for="p-q">Search products</label>
    <input id="p-q" class="input input-sm" type="search" name="q" value="<?= e($q) ?>" placeholder="Search name, SKU or slug">
    <label class="sr-only" for="p-cat">Category</label>
    <select id="p-cat" class="input input-sm" name="category" data-autosubmit>
      <option value="">All categories</option>
      <?php foreach ($categories as $c): ?><option value="<?= (int)$c['id'] ?>"<?= $category === (int)$c['id'] ? ' selected' : '' ?>><?= $c['parent_id'] ? '— ' : '' ?><?= e($c['name']) ?></option><?php endforeach; ?>
    </select>
    <label class="sr-only" for="p-filter">Filter</label>
    <select id="p-filter" class="input input-sm" name="filter" data-autosubmit>
      <option value="">All</option>
      <?php foreach ($filters as $k => $label): ?><option value="<?= e($k) ?>"<?= $filter === $k ? ' selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?>
    </select>
    <button class="btn btn-sm btn-outline" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Search</button>
  </form>

  <?php if (!$rows): ?>
    <?= View::render('admin:partials/empty', ['icon' => 'fa-solid fa-box-open', 'title' => 'No products found', 'text' => 'Try a different search or add your first product.', 'cta' => 'Add product', 'href' => '/admin/products/create']) ?>
  <?php else: ?>
  <div class="a-card a-table-card">
    <table class="a-table">
      <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th class="hide-sm">Flags</th><th class="hide-sm">Sold</th><th class="t-right">Actions</th></tr></thead>
      <tbody>
      <?php foreach ($rows as $p): $low = (int)$p['track_stock'] === 1 && $p['stock'] <= $threshold; ?>
        <tr>
          <td data-label="Product">
            <div class="cell-product">
              <img src="<?= e(packed_image_url($p['image'])) ?>" alt="" width="44" height="44" class="thumb-sm" loading="lazy">
              <div>
                <a href="<?= e(url('/admin/products/' . $p['id'] . '/edit')) ?>" class="strong"><?= e(str_limit($p['name'], 60)) ?></a>
                <span class="muted small d-block"><?= e($p['sku'] ?: '—') ?> · <?= e($p['category'] ?: 'No category') ?><?= $p['status'] === 'draft' ? ' · <span class="badge badge-muted">Draft</span>' : '' ?></span>
              </div>
            </div>
          </td>
          <td data-label="Price"><strong><?= money_en($p['price']) ?></strong><?php if ($p['old_price']): ?><del class="muted small d-block"><?= money_en($p['old_price']) ?></del><?php endif; ?></td>
          <td data-label="Stock">
            <?php if ((int)$p['track_stock'] !== 1): ?><span class="badge badge-muted">Not tracked</span>
            <?php elseif ((int)$p['variant_count'] > 0): ?><span class="badge <?= $low ? 'badge-warning' : 'badge-success' ?>"><?= (int)$p['stock'] ?> (<?= (int)$p['variant_count'] ?> variants)</span>
            <?php else: ?>
              <form class="inline-stock" method="post" action="<?= e(url('/admin/products/' . $p['id'] . '/stock')) ?>" data-ajax data-no-spa>
                <label class="sr-only" for="st-<?= (int)$p['id'] ?>">Stock</label>
                <input id="st-<?= (int)$p['id'] ?>" class="input input-sm <?= $p['stock'] <= 0 ? 'is-danger' : ($low ? 'is-warning' : '') ?>" type="number" min="0" name="stock" value="<?= max(0, (int)$p['stock']) ?>">
                <button class="icon-btn icon-btn-sm" type="submit" aria-label="Save stock" title="Save stock"><i class="fa-solid fa-check" aria-hidden="true"></i></button>
              </form>
            <?php endif; ?>
          </td>
          <td data-label="Flags" class="hide-sm">
            <?php foreach (['is_featured' => 'Featured', 'is_flash_sale' => 'Flash', 'is_combo' => 'Combo', 'is_free_delivery' => 'Free'] as $k => $l): ?>
              <?php if ((int)$p[$k] === 1): ?><span class="badge badge-primary"><?= e($l) ?></span><?php endif; ?>
            <?php endforeach; ?>
          </td>
          <td data-label="Sold" class="hide-sm"><?= (int)$p['sold_count'] ?></td>
          <td class="t-right">
            <div class="row-actions">
              <a class="icon-btn icon-btn-sm" href="<?= e(url('/product/' . $p['slug'])) ?>" target="_blank" rel="noopener" aria-label="View in store" title="View"><i class="fa-solid fa-eye" aria-hidden="true"></i></a>
              <a class="icon-btn icon-btn-sm" href="<?= e(url('/admin/products/' . $p['id'] . '/edit')) ?>" aria-label="Edit" title="Edit"><i class="fa-solid fa-pen" aria-hidden="true"></i></a>
              <button class="icon-btn icon-btn-sm danger" type="button" data-action="post" data-url="<?= e(url('/admin/products/' . $p['id'] . '/delete')) ?>"
                      data-confirm="Move “<?= e(str_limit($p['name'], 40)) ?>” to trash? You can restore it later." aria-label="Delete" title="Move to trash"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </div>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?= View::render('admin:partials/pager', ['page' => $page, 'pages' => $pages, 'base' => '/admin/products', 'query' => array_filter(['q' => $q, 'filter' => $filter, 'category' => $category ?: null])]) ?>
  <?php endif; ?>
</div>
