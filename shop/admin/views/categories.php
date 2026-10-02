<?php
$icons = ['tag', 'shopping-bag', 'shopping-basket', 'gift', 'female', 'male', 'child', 'diamond', 'heart', 'star', 'mobile', 'laptop', 'desktop', 'tablet', 'headphones', 'camera', 'gamepad', 'tv', 'clock-o', 'home', 'bed', 'bath', 'cutlery', 'coffee', 'glass', 'birthday-cake', 'leaf', 'apple', 'tree', 'paw', 'car', 'motorcycle', 'bicycle', 'plane', 'book', 'graduation-cap', 'pencil', 'paint-brush', 'music', 'film', 'futbol-o', 'trophy', 'medkit', 'heartbeat', 'user-md', 'wrench', 'cogs', 'plug', 'lightbulb-o', 'umbrella', 'sun-o', 'snowflake-o', 'shield', 'bolt', 'fire', 'magic', 'tags', 'shopping-cart', 'archive', 'cube', 'cubes', 'puzzle-piece', 'paint-brush', 'scissors', 'eye', 'smile-o', 'flask', 'globe', 'money', 'credit-card', 'briefcase', 'suitcase', 'black-tie', 'tint', 'recycle', 'pagelines'];
$icons = array_values(array_unique($icons));
?>
<div class="page-a" data-page="categories">
  <div class="toolbar-top"><p class="small muted">টেনে এনে ক্রম পরিবর্তন করুন</p>
    <button type="button" class="btn btn-primary btn-sm" data-modal="tpl-category" data-title="নতুন ক্যাটাগরি"><i class="fa fa-plus"></i> নতুন ক্যাটাগরি</button></div>
  <?php if ($items): ?>
  <div class="sort-list" data-sortable="/admin/api/categories/sort">
    <?php foreach ($items as $c): ?>
    <div class="sort-item" data-id="<?= (int) $c['id'] ?>">
      <span class="drag" aria-label="টেনে সরান"><i class="fa fa-bars"></i></span>
      <span class="cat-icon sm"><?php if ($c['icon_type'] === 'image' && $c['image']): ?><img src="/<?= e($c['image']) ?>" alt="" width="22" height="22"><?php else: ?><i class="fa fa-<?= e($c['icon'] ?: 'tag') ?>"></i><?php endif; ?></span>
      <div class="grow"><b><?= e($c['name']) ?></b><br><span class="tiny muted">/category/<?= e($c['slug']) ?> · <?= bn_num($c['products']) ?>টি পণ্য</span></div>
      <label class="switch"><input type="checkbox" data-toggle-url="/admin/api/categories/<?= (int) $c['id'] ?>/toggle"<?= $c['is_active'] ? ' checked' : '' ?>><span></span></label>
      <button type="button" class="icon-btn" data-modal="tpl-category" data-title="ক্যাটাগরি সম্পাদনা" data-fill='<?= e(json_encode(['id' => $c['id'], 'name' => $c['name'], 'slug' => $c['slug'], 'icon' => $c['icon'], 'icon_type' => $c['icon_type'], 'is_active' => $c['is_active'], 'image_url' => $c['image'] ? '/' . $c['image'] : ''], JSON_UNESCAPED_UNICODE)) ?>' aria-label="সম্পাদনা"><i class="fa fa-pencil"></i></button>
      <button type="button" class="icon-btn danger" data-post="/admin/api/categories/<?= (int) $c['id'] ?>/trash" data-confirm="ক্যাটাগরিটি ট্র্যাশে পাঠাবেন?" data-reload aria-label="মুছুন"><i class="fa fa-trash-o"></i></button>
    </div>
    <?php endforeach; ?>
  </div>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'th-large', 'title' => 'কোনো ক্যাটাগরি নেই', 'text' => 'উপরের বাটন থেকে ক্যাটাগরি যোগ করুন।']); ?>
  <?php endif; ?>

  <template id="tpl-category">
    <form data-api="/admin/api/categories/save" data-reload data-close>
      <input type="hidden" name="id" value="">
      <div class="field"><label>নাম <span class="req">*</span></label><input name="name" required maxlength="120"></div>
      <div class="field"><label>স্লাগ</label><input name="slug" placeholder="খালি রাখলে নাম থেকে তৈরি হবে" maxlength="140"></div>
      <div class="field"><label>আইকনের ধরন</label>
        <div class="seg"><label><input type="radio" name="icon_type" value="fa" checked><span><i class="fa fa-font-awesome"></i> আইকন লাইব্রেরি</span></label><label><input type="radio" name="icon_type" value="image"><span><i class="fa fa-upload"></i> কাস্টম আপলোড</span></label></div></div>
      <div class="field" data-show-when="icon_type=fa"><label>আইকন নির্বাচন করুন</label>
        <input type="hidden" name="icon" value="tag">
        <input type="search" class="input" placeholder="আইকন খুঁজুন…" data-icon-search>
        <div class="icon-grid" data-icon-grid><?php foreach ($icons as $i): ?><button type="button" data-icon="<?= $i ?>" title="<?= $i ?>"><i class="fa fa-<?= $i ?>"></i></button><?php endforeach; ?></div></div>
      <div class="field" data-show-when="icon_type=image"><label>কাস্টম আইকন (PNG/WebP, স্বচ্ছ ব্যাকগ্রাউন্ড)</label><img data-preview="image_url" alt="" width="40" height="40" hidden><input type="file" name="image" accept="image/png,image/webp,image/jpeg"></div>
      <?php View::partial('admin/views/partials/switch', ['name' => 'is_active', 'label' => 'সক্রিয়', 'checked' => 1]); ?>
      <button class="btn btn-primary btn-block">সংরক্ষণ করুন</button>
    </form>
  </template>
</div>
