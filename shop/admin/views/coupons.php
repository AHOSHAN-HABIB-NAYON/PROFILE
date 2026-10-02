<?php $dtl = static fn ($x) => $x ? date('Y-m-d\TH:i', strtotime($x)) : ''; ?>
<div class="page-a" data-page="coupons">
  <div class="toolbar-top"><p class="small muted">কুপন সিস্টেম: <?= Settings::on('coupon_enabled') ? '<span class="ok">চালু</span>' : '<span class="danger-text">বন্ধ</span>' ?> (সেটিংস → ফিচার)</p>
    <button type="button" class="btn btn-primary btn-sm" data-modal="tpl-coupon" data-title="নতুন কুপন"><i class="fa fa-plus"></i> নতুন কুপন</button></div>
  <?php if ($items): ?>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>কোড</th><th>ডিসকাউন্ট</th><th>সর্বনিম্ন অর্ডার</th><th>ব্যবহার</th><th>মেয়াদ</th><th>হাইলাইট</th><th>সক্রিয়</th><th></th></tr></thead>
    <tbody><?php foreach ($items as $c): $expired = $c['expires_at'] && strtotime($c['expires_at']) < time(); ?>
      <tr>
        <td data-label="কোড"><b class="mono"><?= e($c['code']) ?></b><?= $expired ? ' <span class="pill pill-red">মেয়াদোত্তীর্ণ</span>' : '' ?></td>
        <td data-label="ডিসকাউন্ট"><?= $c['type'] === 'percent' ? bn_num((float) $c['value']) . '%' : money($c['value']) ?><?= $c['max_discount'] ? '<br><span class="tiny muted">সর্বোচ্চ ' . money($c['max_discount']) . '</span>' : '' ?></td>
        <td data-label="সর্বনিম্ন"><?= money($c['min_order']) ?></td>
        <td data-label="ব্যবহার"><?= bn_num($c['used_count']) ?><?= $c['usage_limit'] ? ' / ' . bn_num($c['usage_limit']) : '' ?></td>
        <td data-label="মেয়াদ" class="small"><?= $c['starts_at'] ? date('d/m/y', strtotime($c['starts_at'])) : '—' ?> → <?= $c['expires_at'] ? date('d/m/y', strtotime($c['expires_at'])) : '∞' ?></td>
        <td data-label="হাইলাইট"><label class="switch"><input type="checkbox" data-toggle-url="/admin/api/coupons/<?= (int) $c['id'] ?>/toggle" data-field="is_highlighted"<?= $c['is_highlighted'] ? ' checked' : '' ?>><span></span></label></td>
        <td data-label="সক্রিয়"><label class="switch"><input type="checkbox" data-toggle-url="/admin/api/coupons/<?= (int) $c['id'] ?>/toggle"<?= $c['is_active'] ? ' checked' : '' ?>><span></span></label></td>
        <td class="actions">
          <button type="button" class="icon-btn" data-modal="tpl-coupon" data-title="কুপন সম্পাদনা" data-fill='<?= e(json_encode(['id' => $c['id'], 'code' => $c['code'], 'type' => $c['type'], 'value' => (float) $c['value'], 'min_order' => (float) $c['min_order'], 'max_discount' => $c['max_discount'] !== null ? (float) $c['max_discount'] : '', 'starts_at' => $dtl($c['starts_at']), 'expires_at' => $dtl($c['expires_at']), 'usage_limit' => $c['usage_limit'] ?? '', 'is_highlighted' => $c['is_highlighted'], 'is_active' => $c['is_active']])) ?>' aria-label="সম্পাদনা"><i class="fa fa-pencil"></i></button>
          <button type="button" class="icon-btn danger" data-post="/admin/api/coupons/<?= (int) $c['id'] ?>/trash" data-confirm="কুপনটি ট্র্যাশে পাঠাবেন?" data-reload aria-label="মুছুন"><i class="fa fa-trash-o"></i></button>
        </td>
      </tr>
    <?php endforeach; ?></tbody></table></div>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'ticket', 'title' => 'কোনো কুপন নেই']); ?>
  <?php endif; ?>
  <template id="tpl-coupon">
    <form data-api="/admin/api/coupons/save" data-reload data-close>
      <input type="hidden" name="id" value="">
      <div class="field"><label>কুপন কোড <span class="req">*</span></label><input name="code" required maxlength="40" class="upper" placeholder="EID20"></div>
      <div class="grid-2">
        <div class="field"><label>ধরন</label><select name="type"><option value="percent">শতাংশ (%)</option><option value="fixed">নির্দিষ্ট (৳)</option></select></div>
        <div class="field"><label>পরিমাণ <span class="req">*</span></label><input name="value" inputmode="decimal" required></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>সর্বনিম্ন অর্ডার (৳)</label><input name="min_order" inputmode="decimal" value="0"></div>
        <div class="field"><label>সর্বোচ্চ ছাড় (৳)</label><input name="max_discount" inputmode="decimal" placeholder="সীমাহীন"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>শুরু</label><input type="datetime-local" name="starts_at"></div>
        <div class="field"><label>মেয়াদ শেষ</label><input type="datetime-local" name="expires_at"></div>
      </div>
      <div class="field"><label>ব্যবহারের সীমা</label><input name="usage_limit" inputmode="numeric" placeholder="সীমাহীন"></div>
      <?php View::partial('admin/views/partials/switch', ['name' => 'is_highlighted', 'label' => 'হোমপেজে হাইলাইট করুন', 'checked' => 0]); ?>
      <?php View::partial('admin/views/partials/switch', ['name' => 'is_active', 'label' => 'সক্রিয়', 'checked' => 1]); ?>
      <button class="btn btn-primary btn-block">সংরক্ষণ করুন</button>
    </form>
  </template>
</div>
