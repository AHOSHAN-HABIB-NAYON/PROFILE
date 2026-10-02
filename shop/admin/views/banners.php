<div class="page-a" data-page="banners">
  <div class="toolbar-top"><p class="small muted">প্রস্তাবিত সাইজ ১২০০×৫০০ px। টেনে ক্রম পরিবর্তন করুন।</p>
    <button type="button" class="btn btn-primary btn-sm" data-modal="tpl-banner" data-title="নতুন ব্যানার"><i class="fa fa-plus"></i> নতুন ব্যানার</button></div>
  <?php if ($items): ?>
  <div class="sort-list" data-sortable="/admin/api/banners/sort">
    <?php foreach ($items as $b): ?>
    <div class="sort-item banner-item" data-id="<?= (int) $b['id'] ?>">
      <span class="drag"><i class="fa fa-bars"></i></span>
      <img src="<?= e(img_url($b['image'], 'sm')) ?>" alt="" width="160" height="66" loading="lazy" class="banner-thumb">
      <div class="grow"><b><?= e($b['title'] ?: 'শিরোনাম নেই') ?></b><br><span class="tiny muted"><?= e($b['link'] ?: 'লিংক নেই') ?><?= $b['cta_text'] ? ' · CTA: ' . e($b['cta_text']) : '' ?></span></div>
      <label class="switch"><input type="checkbox" data-toggle-url="/admin/api/banners/<?= (int) $b['id'] ?>/toggle"<?= $b['is_active'] ? ' checked' : '' ?>><span></span></label>
      <button type="button" class="icon-btn" data-modal="tpl-banner" data-title="ব্যানার সম্পাদনা" data-fill='<?= e(json_encode(['id' => $b['id'], 'title' => $b['title'], 'subtitle' => $b['subtitle'], 'link' => $b['link'], 'cta_text' => $b['cta_text'], 'is_active' => $b['is_active'], 'image_url' => img_url($b['image'], 'sm')], JSON_UNESCAPED_UNICODE)) ?>' aria-label="সম্পাদনা"><i class="fa fa-pencil"></i></button>
      <button type="button" class="icon-btn danger" data-post="/admin/api/banners/<?= (int) $b['id'] ?>/trash" data-confirm="ব্যানারটি ট্র্যাশে পাঠাবেন?" data-reload aria-label="মুছুন"><i class="fa fa-trash-o"></i></button>
    </div>
    <?php endforeach; ?>
  </div>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'picture-o', 'title' => 'কোনো ব্যানার নেই']); ?>
  <?php endif; ?>
  <template id="tpl-banner">
    <form data-api="/admin/api/banners/save" data-reload data-close>
      <input type="hidden" name="id" value="">
      <div class="field"><label>ব্যানার ছবি</label><img data-preview="image_url" alt="" width="240" height="100" hidden><input type="file" name="image" accept="image/*"><p class="field-hint">স্বয়ংক্রিয়ভাবে কমপ্রেস ও WebP হবে।</p></div>
      <div class="field"><label>শিরোনাম</label><input name="title" maxlength="190"></div>
      <div class="field"><label>সাব-টাইটেল</label><input name="subtitle" maxlength="255"></div>
      <div class="grid-2">
        <div class="field"><label>লিংক</label><input name="link" placeholder="/products বা https://…" maxlength="255"></div>
        <div class="field"><label>CTA বাটন টেক্সট</label><input name="cta_text" placeholder="এখনই কিনুন" maxlength="60"></div>
      </div>
      <?php View::partial('admin/views/partials/switch', ['name' => 'is_active', 'label' => 'সক্রিয়', 'checked' => 1]); ?>
      <button class="btn btn-primary btn-block">সংরক্ষণ করুন</button>
    </form>
  </template>
</div>
