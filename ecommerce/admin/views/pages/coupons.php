<?php
/**
 * @var array $rows @var ?array $edit @var bool $enabled
 */
$c = $edit ?? [];
$dt = static fn($v) => $v ? date('Y-m-d\TH:i', strtotime($v)) : '';
?>
<div class="a-page">
  <div class="page-head">
    <div><h1 class="a-title">Coupons</h1><p class="muted small">Active coupons marked “Show on home” are highlighted on the home page.</p></div>
    <form method="post" action="<?= e(url('/admin/coupons/save')) ?>" data-ajax data-no-spa class="inline-toggle">
      <input type="hidden" name="toggle_system" value="1">
      <label class="switch-row"><input type="checkbox" name="coupon_enabled" value="1"<?= $enabled ? ' checked' : '' ?> data-autosubmit><span class="toggle"></span><span>Coupon system <?= $enabled ? 'on' : 'off' ?></span></label>
    </form>
  </div>
  <div class="a-split">
    <section class="a-card a-table-card">
      <?php if (!$rows): ?>
        <?= View::render('admin:partials/empty', ['icon' => 'fa-solid fa-ticket', 'title' => 'No coupons yet']) ?>
      <?php else: ?>
      <table class="a-table">
        <thead><tr><th>Code</th><th>Discount</th><th>Usage</th><th>Status</th><th class="t-right">Actions</th></tr></thead>
        <tbody>
        <?php foreach ($rows as $row):
            $expired = $row['expires_at'] && strtotime($row['expires_at']) < time();
            $used = $row['usage_limit'] !== null && (int)$row['used_count'] >= (int)$row['usage_limit']; ?>
          <tr>
            <td data-label="Code"><strong class="mono"><?= e($row['code']) ?></strong><?php if ((int)$row['show_on_home'] === 1): ?> <span class="badge badge-primary">Home</span><?php endif; ?><span class="muted small d-block"><?= e($row['description'] ?? '') ?></span></td>
            <td data-label="Discount"><?= $row['type'] === 'percent' ? (float)$row['value'] . '%' : money_en($row['value']) ?><span class="muted small d-block">Min <?= money_en($row['min_order']) ?><?= $row['max_discount'] ? ' · max ' . money_en($row['max_discount']) : '' ?></span></td>
            <td data-label="Usage"><?= (int)$row['used_count'] ?><?= $row['usage_limit'] ? ' / ' . (int)$row['usage_limit'] : '' ?><span class="muted small d-block"><?= $row['per_user_limit'] ? (int)$row['per_user_limit'] . ' per customer' : 'Unlimited per customer' ?></span></td>
            <td data-label="Status"><?= (int)$row['is_active'] !== 1 ? '<span class="badge badge-muted">Inactive</span>' : ($expired ? '<span class="badge badge-danger">Expired</span>' : ($used ? '<span class="badge badge-warning">Used up</span>' : '<span class="badge badge-success">Active</span>')) ?><?php if ($row['expires_at']): ?><span class="muted small d-block">until <?= e(date('d M Y', strtotime($row['expires_at']))) ?></span><?php endif; ?></td>
            <td class="t-right"><div class="row-actions">
              <a class="icon-btn icon-btn-sm" href="<?= e(url('/admin/coupons', ['edit' => $row['id']])) ?>" aria-label="Edit"><i class="fa-solid fa-pen" aria-hidden="true"></i></a>
              <button type="button" class="icon-btn icon-btn-sm danger" data-action="post" data-url="<?= e(url('/admin/coupons/' . $row['id'] . '/delete')) ?>" data-confirm="Move coupon <?= e($row['code']) ?> to trash?" aria-label="Delete"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </div></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </section>
    <section class="a-card a-sticky">
      <h2 class="a-card-title"><i class="fa-solid <?= $edit ? 'fa-pen' : 'fa-plus' ?>" aria-hidden="true"></i> <?= $edit ? 'Edit coupon' : 'New coupon' ?></h2>
      <form method="post" action="<?= e(url('/admin/coupons/save')) ?>" data-ajax data-no-spa>
        <input type="hidden" name="id" value="<?= (int)($c['id'] ?? 0) ?>">
        <div class="field"><label class="label" for="cp-code">Code <span class="req">*</span></label><input id="cp-code" class="input mono" name="code" value="<?= e($c['code'] ?? '') ?>" required maxlength="40" style="text-transform:uppercase"></div>
        <div class="field"><label class="label" for="cp-desc">Description (shown to customers)</label><input id="cp-desc" class="input" name="description" value="<?= e($c['description'] ?? '') ?>" maxlength="255"></div>
        <div class="grid-2">
          <div class="field"><label class="label" for="cp-type">Type</label><select id="cp-type" class="input" name="type"><option value="percent">Percentage (%)</option><option value="fixed"<?= ($c['type'] ?? '') === 'fixed' ? ' selected' : '' ?>>Fixed (৳)</option></select></div>
          <div class="field"><label class="label" for="cp-val">Value <span class="req">*</span></label><input id="cp-val" class="input" type="number" step="0.01" min="0" name="value" value="<?= e($c['value'] ?? '') ?>" required></div>
        </div>
        <div class="grid-2">
          <div class="field"><label class="label" for="cp-min">Minimum order (৳)</label><input id="cp-min" class="input" type="number" min="0" name="min_order" value="<?= e($c['min_order'] ?? '0') ?>"></div>
          <div class="field"><label class="label" for="cp-max">Max discount (৳)</label><input id="cp-max" class="input" type="number" min="0" name="max_discount" value="<?= e($c['max_discount'] ?? '') ?>" placeholder="No cap"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label class="label" for="cp-start">Starts</label><input id="cp-start" class="input" type="datetime-local" name="starts_at" value="<?= e($dt($c['starts_at'] ?? null)) ?>"></div>
          <div class="field"><label class="label" for="cp-exp">Expires</label><input id="cp-exp" class="input" type="datetime-local" name="expires_at" value="<?= e($dt($c['expires_at'] ?? null)) ?>"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label class="label" for="cp-limit">Total usage limit</label><input id="cp-limit" class="input" type="number" min="0" name="usage_limit" value="<?= e($c['usage_limit'] ?? '') ?>" placeholder="Unlimited"></div>
          <div class="field"><label class="label" for="cp-user">Per customer (phone)</label><input id="cp-user" class="input" type="number" min="0" name="per_user_limit" value="<?= e($c['per_user_limit'] ?? '') ?>" placeholder="Unlimited"></div>
        </div>
        <label class="switch-row"><input type="checkbox" name="is_active" value="1"<?= (int)($c['is_active'] ?? 1) === 1 ? ' checked' : '' ?>><span class="toggle"></span><span>Active</span></label>
        <label class="switch-row"><input type="checkbox" name="show_on_home" value="1"<?= (int)($c['show_on_home'] ?? 0) === 1 ? ' checked' : '' ?>><span class="toggle"></span><span>Highlight on home page</span></label>
        <div class="form-actions">
          <?php if ($edit): ?><a href="<?= e(url('/admin/coupons')) ?>" class="btn btn-ghost">Cancel</a><?php endif; ?>
          <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save coupon</button>
        </div>
      </form>
    </section>
  </div>
</div>
