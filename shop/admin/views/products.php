<div class="page-a" data-page="products">
  <div class="toolbar-top">
    <form method="get" class="toolbar grow" data-auto-submit>
      <div class="search-box"><i class="fa fa-search"></i><input type="search" name="q" value="<?= e($q) ?>" placeholder="নাম বা SKU"></div>
      <select name="category" class="select-sm" aria-label="ক্যাটাগরি"><option value="">সব ক্যাটাগরি</option>
        <?php foreach ($categories as $c): ?><option value="<?= (int) $c['id'] ?>"<?= $cat === (int) $c['id'] ? ' selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?></select>
      <select name="filter" class="select-sm" aria-label="ফিল্টার">
        <?php foreach (['' => 'সব', 'inactive' => 'নিষ্ক্রিয়', 'featured' => 'ফিচার্ড', 'flash' => 'ফ্ল্যাশ', 'low' => 'লো স্টক', 'out' => 'স্টক আউট'] as $k => $v): ?>
          <option value="<?= $k ?>"<?= $filter === $k ? ' selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select>
    </form>
    <a href="/admin/products/create" class="btn btn-primary btn-sm"><i class="fa fa-plus"></i> নতুন পণ্য</a>
  </div>
  <p class="small muted mb-12">মোট <?= bn_num($total) ?>টি পণ্য</p>
  <?php if ($items): ?>
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th>পণ্য</th><th>মূল্য</th><th>স্টক</th><th>বিক্রি</th><th>সক্রিয়</th><th>ফিচার্ড</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($items as $p): $th = $p['low_stock_threshold'] ?? $threshold; ?>
        <tr>
          <td data-label="পণ্য"><div class="prod-cell"><img src="<?= e(img_url($p['image'], 'sm')) ?>" alt="" width="40" height="40" loading="lazy"><div><a href="/admin/products/<?= (int) $p['id'] ?>/edit" class="strong"><?= e($p['name']) ?></a><br><span class="tiny muted"><?= e($p['category_name'] ?: 'ক্যাটাগরি নেই') ?><?= $p['sku'] ? ' · ' . e($p['sku']) : '' ?></span>
            <?= $p['is_flash'] ? '<span class="tag tag-flash">ফ্ল্যাশ</span>' : '' ?><?= $p['free_delivery'] ? ' <span class="tag tag-free-inline">ফ্রি ডেলিভারি</span>' : '' ?></div></div></td>
          <td data-label="মূল্য"><b><?= money($p['price']) ?></b><?= $p['old_price'] ? '<br><del class="tiny">' . money($p['old_price']) . '</del>' : '' ?></td>
          <td data-label="স্টক"><span class="pill <?= $p['stock'] <= 0 ? 'pill-red' : ($p['stock'] <= $th ? 'pill-amber' : 'pill-green') ?>"><?= bn_num($p['stock']) ?></span></td>
          <td data-label="বিক্রি"><?= bn_num($p['sold']) ?></td>
          <td data-label="সক্রিয়"><label class="switch"><input type="checkbox" data-toggle-url="/admin/api/products/<?= (int) $p['id'] ?>/toggle" data-field="is_active"<?= $p['is_active'] ? ' checked' : '' ?>><span></span></label></td>
          <td data-label="ফিচার্ড"><label class="switch"><input type="checkbox" data-toggle-url="/admin/api/products/<?= (int) $p['id'] ?>/toggle" data-field="is_featured"<?= $p['is_featured'] ? ' checked' : '' ?>><span></span></label></td>
          <td class="actions">
            <a href="/product/<?= e(rawurlencode($p['slug'])) ?>" target="_blank" rel="noopener" class="icon-btn" aria-label="দেখুন"><i class="fa fa-eye"></i></a>
            <a href="/admin/products/<?= (int) $p['id'] ?>/edit" class="icon-btn" aria-label="সম্পাদনা"><i class="fa fa-pencil"></i></a>
            <button type="button" class="icon-btn danger" data-post="/admin/api/products/<?= (int) $p['id'] ?>/trash" data-confirm="পণ্যটি ট্র্যাশে পাঠাবেন?" data-reload aria-label="মুছুন"><i class="fa fa-trash-o"></i></button>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php View::partial('admin/views/partials/pagination', ['page' => $page, 'pages' => $pages]); ?>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'cube', 'title' => 'কোনো পণ্য নেই', 'link' => '/admin/products/create', 'linkText' => 'প্রথম পণ্য যোগ করুন']); ?>
  <?php endif; ?>
</div>
