<?php
/** Admin: notification composer (targeting) + history. */
defined('APP') || exit;
require_once ROOT . '/core/push.php';
meta(['title' => 'Notifications']);

$targets = ['all' => 'All users', 'users' => 'Selected users', 'vip' => 'VIP users', 'new' => 'New users (last 7 days)', 'pending_payment' => 'Users with pending payment',
    'unpaid_orders' => 'Users with unpaid orders', 'verified' => 'Verified users', 'staff' => 'Staff only'];
$history = rows('SELECT n.*, u.name AS sender, (SELECT COUNT(*) FROM notification_targets t WHERE t.notification_id = n.id AND t.read_at IS NOT NULL) AS read_count
                 FROM notifications n LEFT JOIN users u ON u.id = n.created_by WHERE n.created_by IS NOT NULL ORDER BY n.id DESC LIMIT 25');
$subs = (int)val('SELECT COUNT(*) FROM push_subscriptions');
$preUser = input_int('user');
$pre = $preUser ? row('SELECT id, name, email FROM users WHERE id = ?', [$preUser]) : null;
?>
<div class="page" data-init="notify-composer">
  <div class="adm-title"><h1>Notifications</h1><span class="badge muted"><i class="fa-solid fa-mobile-screen"></i><?= number_format($subs) ?> push subscribers</span></div>
  <?php if (!push_ready()): ?><div class="alert warning mb-2"><i class="fa-solid fa-triangle-exclamation"></i><span>Web Push is not ready — enable it and generate VAPID keys in <a href="<?= e(url('/admin/settings?tab=pwa')) ?>">Settings → PWA</a>. In-app and email notifications still work.</span></div><?php endif ?>
  <form class="card card-pad-lg mb-2" method="post" action="<?= e(url('/api/admin?action=notify_send')) ?>" data-ajax data-confirm="Send this notification now?" novalidate>
    <h2 style="font-size:1rem">Compose</h2>
    <div class="form-grid">
      <div class="form-group"><label class="label">Send to</label><select class="select" name="target" data-target-select><?php foreach ($targets as $k => $v): ?><option value="<?= $k ?>" <?= $pre && $k === 'users' ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach ?></select></div>
      <div class="form-group"><label class="label">Type</label><select class="select" name="type"><?php foreach (NOTIFY_TYPES as $t): ?><option value="<?= $t ?>" <?= $t === 'admin' ? 'selected' : '' ?>><?= ucfirst($t) ?></option><?php endforeach ?></select></div>
      <div class="form-group wide" data-user-picker <?= $pre ? '' : 'hidden' ?>>
        <label class="label">Users</label>
        <div class="chips wrap mb-1" data-picked style="flex-wrap:wrap"><?php if ($pre): ?><span class="chip active"><input type="hidden" name="users[]" value="<?= (int)$pre['id'] ?>"><?= e($pre['name']) ?> <button type="button" class="icon-btn" style="width:22px;height:22px;color:#fff" data-remove-pick aria-label="Remove">×</button></span><?php endif ?></div>
        <div class="input-icon"><i class="fa-solid fa-user-plus"></i><input class="input" data-user-search placeholder="Search users by name or email…" autocomplete="off"></div>
        <div class="list mt-1" data-user-results hidden></div>
      </div>
      <div class="form-group"><label class="label">Title (English)</label><input class="input" name="title_en" maxlength="190" required></div>
      <div class="form-group"><label class="label">Title (বাংলা)</label><input class="input" name="title_bn" maxlength="190"></div>
      <div class="form-group"><label class="label">Message (English)</label><textarea class="textarea" name="body_en" maxlength="1000" rows="3"></textarea></div>
      <div class="form-group"><label class="label">Message (বাংলা)</label><textarea class="textarea" name="body_bn" maxlength="1000" rows="3"></textarea></div>
      <div class="form-group"><label class="label">Icon</label><div class="row"><span class="icon-box" data-icon-preview><i class="fa-solid fa-bullhorn"></i></span><input class="input" name="icon" value="fa-solid fa-bullhorn" list="fa-icons" data-icon-input></div></div>
      <div class="form-group"><label class="label">Link (optional)</label><input class="input" name="link" placeholder="/services or https://…" maxlength="255"></div>
      <div class="form-group"><label class="check switch-row"><span class="switch"><input type="checkbox" name="sound" value="1" checked><span></span></span><span>Play sound</span></label></div>
      <div class="form-group"><label class="check switch-row"><span class="switch"><input type="checkbox" name="push" value="1" <?= push_ready() ? 'checked' : 'disabled' ?>><span></span></span><span>Web push</span></label></div>
      <div class="form-group"><label class="check switch-row"><span class="switch"><input type="checkbox" name="email" value="1"><span></span></span><span>Also send by email</span></label></div>
    </div>
    <div class="form-actions"><button class="btn btn-lg" type="submit"><i class="fa-solid fa-paper-plane"></i>Send notification</button></div>
  </form>

  <h2 style="font-size:1rem">Sent by staff</h2>
  <table class="dtable">
    <thead><tr><th>Notification</th><th>Target</th><th>Channels</th><th>Recipients</th><th>Read</th><th>Sent</th></tr></thead>
    <tbody><?php foreach ($history as $h): ?>
      <tr><td data-label="Notification"><span style="text-align:left;display:block"><i class="<?= e(fa($h['icon'], 'fa-solid fa-bell')) ?>" style="color:var(--primary)"></i> <strong><?= e($h['title_en'] ?: $h['title_bn']) ?></strong><br><span class="tiny muted"><?= e(mb_strimwidth((string)($h['body_en'] ?: $h['body_bn']), 0, 80, '…')) ?></span></span></td>
        <td data-label="Target"><span class="badge muted"><?= e($targets[$h['target']] ?? $h['target']) ?></span></td>
        <td data-label="Channels"><?= $h['send_push'] ? '<i class="fa-solid fa-mobile-screen" title="Push"></i> ' : '' ?><?= $h['send_email'] ? '<i class="fa-solid fa-envelope" title="Email"></i> ' : '' ?><i class="fa-solid fa-bell" title="In-app"></i></td>
        <td data-label="Recipients"><?= number_format((int)$h['recipients']) ?></td>
        <td data-label="Read"><?= $h['recipients'] ? round($h['read_count'] / $h['recipients'] * 100) . '%' : '—' ?></td>
        <td data-label="Sent"><?= e(date('M j, H:i', strtotime($h['created_at']))) ?> <span class="tiny muted">by <?= e($h['sender']) ?></span></td></tr>
    <?php endforeach ?></tbody>
  </table>
  <?php if (!$history): ?><p class="muted small">Nothing sent yet.</p><?php endif ?>
</div>
