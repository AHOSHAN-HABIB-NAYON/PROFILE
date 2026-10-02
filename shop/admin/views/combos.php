<div class="page-a" data-page="combos">
  <div class="toolbar-top"><p class="small muted">হোমপেজ কম্বো সেকশন: <?= Settings::on('combo_enabled') && Settings::on('home_combo') ? '<span class="ok">চালু</span>' : '<span class="danger-text">বন্ধ</span> (সেটিংস)' ?></p>
    <button type="button" class="btn btn-primary btn-sm" data-modal="tpl-combo" data-title="নতুন কম্বো"><i class="fa fa-plus"></i> নতুন কম্বো</button></div>
  <?php if ($items): ?>
  <div class="card-grid sort-list" data-sortable="/admin/api/combos/sort">
    <?php foreach ($items as $c): ?>
    <div class="mini-card sort-item" data-id="<?= (int) $c['id'] ?>">
      <img src="<?= e(img_url($c['image'], 'sm')) ?>" alt="" width="400" height="300" loading="lazy">
      <div class="mini-card-body">
        <div class="row-between"><b><?= e($c['name']) ?></b><span class="drag"><i class="fa fa-bars"></i></span></div>
        <ul class="tiny muted plain"><?php foreach ($c['items'] as $it): ?><li><?= e($it['name']) ?> × <?= bn_num($it['quantity']) ?></li><?php endforeach; ?></ul>
        <div class="price-row"><span class="price"><?= money($c['price']) ?></span><?php if ($c['original_price']): ?><del class="old-price"><?= money($c['original_price']) ?></del><?php endif; ?></div>
        <div class="row-between"><span class="pill <?= $c['stock'] > 0 ? 'pill-green' : 'pill-red' ?>">স্টক <?= bn_num($c['stock']) ?></span>
          <span class="actions">
            <label class="switch"><input type="checkbox" data-toggle-url="/admin/api/combos/<?= (int) $c['id'] ?>/toggle"<?= $c['is_active'] ? ' checked' : '' ?>><span></span></label>
            <button type="button" class="icon-btn" data-modal="tpl-combo" data-title="কম্বো সম্পাদনা" data-fill='<?= e(json_encode(['id' => $c['id'], 'name' => $c['name'], 'description' => $c['description'], 'price' => (float) $c['price'], 'original_price' => $c['original_price'] ? (float) $c['original_price'] : '', 'stock' => $c['stock'], 'free_delivery' => $c['free_delivery'], 'is_active' => $c['is_active'], 'image_url' => img_url($c['image'], 'sm'), 'items' => array_map(static fn ($i) => ['id' => $i['product_id'], 'name' => $i['name'], 'qty' => $i['quantity']], $c['items'])], JSON_UNESCAPED_UNICODE)) ?>' aria-label="সম্পাদনা"><i class="fa fa-pencil"></i></button>
            <button type="button" class="icon-btn danger" data-post="/admin/api/combos/<?= (int) $c['id'] ?>/trash" data-confirm="কম্বোটি ট্র্যাশে পাঠাবেন?" data-reload aria-label="মুছুন"><i class="fa fa-trash-o"></i></button>
          </span></div>
      </div>
    </div>
    <?php endforeach; ?>
  </div>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'gift', 'title' => 'কোনো কম্বো অফার নেই']); ?>
  <?php endif; ?>

  <template id="tpl-combo">
    <form data-api="/admin/api/combos/save" data-reload data-close>
      <input type="hidden" name="id" value="">
      <div class="field"><label>কম্বোর নাম <span class="req">*</span></label><input name="name" required maxlength="190"></div>
      <div class="field"><label>ছবি</label><img data-preview="image_url" alt="" width="120" height="90" hidden><input type="file" name="image" accept="image/*"></div>
      <div class="field"><label>পণ্যসমূহ ও পরিমাণ <span class="req">*</span></label>
        <div class="combo-rows" data-combo-rows></div>
        <div class="picker-search"><input type="search" class="input" placeholder="পণ্য খুঁজে যোগ করুন…" data-combo-search autocomplete="off"><div class="picker-results" data-picker-results hidden></div></div></div>
      <div class="grid-2">
        <div class="field"><label>কম্বো মূল্য (৳) <span class="req">*</span></label><input name="price" inputmode="decimal" required></div>
        <div class="field"><label>মূল মূল্য (৳)</label><input name="original_price" inputmode="decimal" placeholder="অটো হিসাব"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>স্টক</label><input name="stock" inputmode="numeric" value="0"></div>
        <div class="field"><label>বিবরণ</label><input name="description" maxlength="500"></div>
      </div>
      <?php View::partial('admin/views/partials/switch', ['name' => 'free_delivery', 'label' => 'ফ্রি ডেলিভারি', 'checked' => 0]); ?>
      <?php View::partial('admin/views/partials/switch', ['name' => 'is_active', 'label' => 'সক্রিয়', 'checked' => 1]); ?>
      <button class="btn btn-primary btn-block">সংরক্ষণ করুন</button>
    </form>
  </template>
</div>
