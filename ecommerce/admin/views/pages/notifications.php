<?php
/**
 * @var array $items
 */
?>
<div class="a-page narrow">
  <div class="page-head">
    <div><h1 class="a-title">Notifications</h1></div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="post" data-url="<?= e(url('/admin/notifications/read-all')) ?>"><i class="fa-solid fa-check-double" aria-hidden="true"></i> Mark all read</button>
  </div>
  <?php if (!$items): ?>
    <?= View::render('admin:partials/empty', ['icon' => 'fa-regular fa-bell', 'title' => 'You are all caught up']) ?>
  <?php else: ?>
  <div class="a-card notif-list">
    <?php foreach ($items as $n): $tag = $n['link'] ? 'a' : 'div'; ?>
      <<?= $tag ?> class="notif<?= (int)$n['is_read'] === 0 ? ' is-unread' : '' ?> notif-<?= e($n['type']) ?>"<?= $n['link'] ? ' href="' . e($n['link']) . '"' : '' ?>>
        <span class="notif-icon"><i class="<?= e(Notification::ICONS[$n['type']] ?? Notification::ICONS['system']) ?>" aria-hidden="true"></i></span>
        <span class="list-main"><strong><?= e($n['title']) ?></strong><span class="muted small d-block"><?= e($n['message']) ?></span></span>
        <span class="muted small"><?= e(time_ago($n['created_at'])) ?></span>
      </<?= $tag ?>>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>
