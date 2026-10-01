<?php
/** In-app notification center. */
View::$meta['title'] = 'নোটিফিকেশন';
View::$meta['back'] = true;
$cat = (string) ($_GET['cat'] ?? 'all');
$where = 'user_id = ?';
$args = [(int) $user['id']];
if (isset(Notify::CATEGORIES[$cat])) {
    $where .= ' AND category = ?';
    $args[] = $cat;
} elseif ($cat === 'unread') {
    $where .= ' AND is_read = 0';
} else {
    $cat = 'all';
}
$rows = db()->all("SELECT * FROM notifications WHERE $where ORDER BY id DESC LIMIT 60", $args);
$icons = ['payment' => 'wallet', 'security' => 'shield', 'product' => 'package', 'system' => 'info', 'admin' => 'megaphone'];
?>
<div class="row between" style="margin-bottom:10px">
  <div class="chips grow">
    <a href="<?= e(url('/notifications')) ?>" class="chip <?= $cat === 'all' ? 'active' : '' ?>" data-link>সব</a>
    <a href="<?= e(url('/notifications?cat=unread')) ?>" class="chip <?= $cat === 'unread' ? 'active' : '' ?>" data-link>অপঠিত</a>
    <?php foreach (Notify::CATEGORIES as $k => $label): ?>
      <a href="<?= e(url('/notifications?cat=' . $k)) ?>" class="chip <?= $cat === $k ? 'active' : '' ?>" data-link><?= e($label) ?></a>
    <?php endforeach; ?>
  </div>
</div>
<?php if ($rows): ?>
  <div class="row" style="justify-content:flex-end;margin-bottom:10px">
    <button class="btn btn-sm btn-soft" data-post="<?= e(url('/api/notifications/read-all')) ?>"><?= icon('check') ?> সব পঠিত</button>
  </div>
  <div class="list">
    <?php foreach ($rows as $n): ?>
      <div class="notif <?= $n['is_read'] ? '' : 'unread' ?>" data-item>
        <span class="tx-ic n-cat-<?= e($n['category']) ?>"><?= icon($icons[$n['category']] ?? 'bell') ?></span>
        <div class="notif-body">
          <b><?= e($n['title']) ?></b>
          <?php if ($n['body']): ?><p><?= e($n['body']) ?></p><?php endif; ?>
          <time><?= e(Notify::CATEGORIES[$n['category']] ?? '') ?> · <?= e(time_ago($n['created_at'])) ?></time>
          <?php if ($n['url']): ?> · <a href="<?= e(url($n['url'])) ?>" class="small" data-link>দেখুন</a><?php endif; ?>
        </div>
        <div class="notif-actions">
          <?php if (!$n['is_read']): ?><button class="icon-btn" data-post="<?= e(url('/api/notifications/read')) ?>" data-id="<?= (int) $n['id'] ?>" aria-label="পঠিত চিহ্নিত করুন"><?= icon('check') ?></button><?php endif; ?>
          <button class="icon-btn" data-post="<?= e(url('/api/notifications/delete')) ?>" data-id="<?= (int) $n['id'] ?>" data-then="remove" aria-label="মুছুন"><?= icon('trash') ?></button>
        </div>
      </div>
    <?php endforeach; ?>
  </div>
<?php else: ?>
  <div class="card"><?= empty_state('bell', 'কোনো নোটিফিকেশন নেই', 'নতুন আপডেট এলে এখানে দেখা যাবে।') ?></div>
<?php endif; ?>
