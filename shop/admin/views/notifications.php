<?php $icons = ['new_order' => 'shopping-bag', 'low_stock' => 'exclamation-triangle', 'duplicate' => 'clone', 'fraud' => 'shield', 'blocked_ip' => 'ban', 'courier_error' => 'truck', 'meta_error' => 'facebook', 'upload_error' => 'upload', 'system_error' => 'bug']; ?>
<div class="page-a" data-page="notifications">
  <div class="toolbar-top"><p class="small muted">সাম্প্রতিক ১০০টি নোটিফিকেশন</p>
    <button type="button" class="btn btn-soft btn-sm" data-post="/admin/api/notifications/read" data-reload><i class="fa fa-check"></i> সব পড়া হয়েছে</button></div>
  <?php if ($items): ?>
  <div class="list card">
    <?php foreach ($items as $n): ?>
    <a class="list-row notif<?= $n['is_read'] ? '' : ' unread' ?>" href="<?= e($n['link'] ?: '/admin/notifications') ?>" data-notif-id="<?= (int) $n['id'] ?>">
      <span class="notif-icon n-<?= e($n['type']) ?>"><i class="fa fa-<?= $icons[$n['type']] ?? 'bell' ?>"></i></span>
      <div class="grow"><b><?= e($n['title']) ?></b><br><span class="small muted"><?= e($n['message']) ?></span></div>
      <span class="tiny muted"><?= time_ago($n['created_at']) ?></span>
    </a>
    <?php endforeach; ?>
  </div>
  <?php else: ?>
    <?php View::partial('components/empty', ['icon' => 'bell-slash', 'title' => 'কোনো নোটিফিকেশন নেই']); ?>
  <?php endif; ?>
</div>
