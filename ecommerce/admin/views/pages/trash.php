<?php
/**
 * @var array $items @var string $type @var array $types
 */
?>
<div class="a-page">
  <div class="page-head"><div><h1 class="a-title">Trash</h1><p class="muted small">Deleted products, orders, categories, banners and coupons can be restored or deleted permanently.</p></div></div>
  <nav class="status-tabs">
    <a href="<?= e(url('/admin/trash')) ?>" class="<?= $type === '' ? 'is-active' : '' ?>">All</a>
    <?php foreach ($types as $k => $t): ?><a href="<?= e(url('/admin/trash', ['type' => $k])) ?>" class="<?= $type === $k ? 'is-active' : '' ?>"><?= e($t['name']) ?>s</a><?php endforeach; ?>
  </nav>
  <?php if (!$items): ?>
    <?= View::render('admin:partials/empty', ['icon' => 'fa-solid fa-trash-can', 'title' => 'Trash is empty']) ?>
  <?php else: ?>
  <div class="a-card">
    <div class="list">
      <?php foreach ($items as $it): ?>
        <div class="list-row">
          <span class="badge badge-muted"><?= e($types[$it['entity_type']]['name'] ?? $it['entity_type']) ?></span>
          <span class="list-main"><strong><?= e($it['label']) ?></strong><span class="muted small d-block">Deleted <?= e(time_ago($it['deleted_at'])) ?> by <?= e($it['admin_name'] ?: 'unknown') ?></span></span>
          <span class="row-actions">
            <button type="button" class="btn btn-sm btn-outline" data-action="post" data-url="<?= e(url('/admin/trash/' . $it['entity_type'] . '/' . $it['entity_id'] . '/restore')) ?>"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restore</button>
            <button type="button" class="btn btn-sm btn-ghost danger" data-action="post" data-url="<?= e(url('/admin/trash/' . $it['entity_type'] . '/' . $it['entity_id'] . '/purge')) ?>" data-confirm="Permanently delete “<?= e($it['label']) ?>”? This cannot be undone." data-danger><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete forever</button>
          </span>
        </div>
      <?php endforeach; ?>
    </div>
  </div>
  <?php endif; ?>
</div>
