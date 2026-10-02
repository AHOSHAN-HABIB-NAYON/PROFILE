<div class="page-a" data-page="stock">
  <div class="stat-grid four">
    <div class="stat c-blue"><i class="fa fa-cubes"></i><span class="stat-v"><?= bn_num($summary['total_stock']) ?></span><span class="stat-l">মোট স্টক</span></div>
    <div class="stat c-green"><i class="fa fa-check"></i><span class="stat-v"><?= bn_num($summary['total_sold']) ?></span><span class="stat-l">মোট বিক্রি</span></div>
    <a class="stat c-amber" href="/admin/stock?filter=low"><i class="fa fa-exclamation-triangle"></i><span class="stat-v"><?= bn_num((int) $summary['low_count']) ?></span><span class="stat-l">লো স্টক</span></a>
    <a class="stat c-red" href="/admin/stock?filter=out"><i class="fa fa-times-circle"></i><span class="stat-v"><?= bn_num((int) $summary['out_count']) ?></span><span class="stat-l">স্টক আউট</span></a>
  </div>
  <form method="get" class="toolbar mt-16" data-auto-submit>
    <div class="search-box"><i class="fa fa-search"></i><input type="search" name="q" value="<?= e($q) ?>" placeholder="পণ্য খুঁজুন"></div>
    <select name="filter" class="select-sm"><?php foreach (['all' => 'সব', 'low' => 'লো স্টক', 'out' => 'স্টক আউট'] as $k => $l): ?><option value="<?= $k ?>"<?= $filter === $k ? ' selected' : '' ?>><?= $l ?></option><?php endforeach; ?></select>
  </form>
  <div class="stock-list">
    <?php foreach ($items as $p): $th = $p['low_stock_threshold'] ?? $threshold; $state = $p['stock'] <= 0 ? 'red' : ($p['stock'] <= $th ? 'amber' : 'green'); ?>
    <div class="stock-row" data-stock-row data-url="/admin/api/stock/<?= (int) $p['id'] ?>">
      <img src="<?= e(img_url($p['image'], 'sm')) ?>" alt="" width="40" height="40" loading="lazy">
      <div class="grow"><b><?= e($p['name']) ?></b><br><span class="tiny muted">বিক্রি <?= bn_num($p['sold']) ?> · লো সীমা <?= bn_num($th) ?><?= $state === 'amber' ? ' · <span class="warn-text">Low Stock Alert</span>' : '' ?></span></div>
      <span class="pill pill-<?= $state ?> stock-val" data-stock-val><?= bn_num($p['stock']) ?></span>
      <div class="stock-btns">
        <button type="button" class="btn btn-soft btn-xs" data-stock-add="10">+১০</button>
        <button type="button" class="btn btn-soft btn-xs" data-stock-add="50">+৫০</button>
        <button type="button" class="btn btn-ghost btn-xs" data-stock-custom>কাস্টম</button>
      </div>
    </div>
    <?php endforeach; ?>
    <?php if (!$items): ?><?php View::partial('components/empty', ['icon' => 'cubes', 'title' => 'কোনো পণ্য পাওয়া যায়নি']); ?><?php endif; ?>
  </div>
  <?php if ($combos): ?>
  <h3 class="section-title mt-16">কম্বো স্টক</h3>
  <div class="stock-list">
    <?php foreach ($combos as $c): ?>
    <div class="stock-row" data-stock-row data-url="/admin/api/stock/<?= (int) $c['id'] ?>" data-type="combo">
      <span class="cat-icon sm"><i class="fa fa-gift"></i></span><div class="grow"><b><?= e($c['name']) ?></b></div>
      <span class="pill pill-<?= $c['stock'] > 0 ? 'green' : 'red' ?> stock-val" data-stock-val><?= bn_num($c['stock']) ?></span>
      <div class="stock-btns"><button type="button" class="btn btn-soft btn-xs" data-stock-add="10">+১০</button><button type="button" class="btn btn-soft btn-xs" data-stock-add="50">+৫০</button><button type="button" class="btn btn-ghost btn-xs" data-stock-custom>কাস্টম</button></div>
    </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
  <template id="tpl-stock">
    <form data-stock-form>
      <div class="seg"><label><input type="radio" name="mode" value="add" checked><span>যোগ/বিয়োগ করুন</span></label><label><input type="radio" name="mode" value="set"><span>নির্দিষ্ট সংখ্যা সেট</span></label></div>
      <div class="field mt-12"><label>পরিমাণ (বিয়োগের জন্য − চিহ্ন দিন)</label><input name="value" inputmode="numeric" required></div>
      <div class="field" data-threshold-field><label>লো স্টক সীমা (ঐচ্ছিক)</label><input name="threshold" inputmode="numeric" placeholder="অপরিবর্তিত"></div>
      <button class="btn btn-primary btn-block">আপডেট করুন</button>
    </form>
  </template>
</div>
