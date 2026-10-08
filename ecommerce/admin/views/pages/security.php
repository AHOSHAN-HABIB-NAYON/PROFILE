<?php
/**
 * @var array $blocked @var array $alerts @var array $attempts @var array $sessions @var array $logins @var array $admins @var array $logs
 * @var string $currentHash @var bool $canManageAdmins
 */
$on = static fn(string $k) => setting($k) === '1' ? ' checked' : '';
?>
<div class="a-page">
  <div class="page-head"><div><h1 class="a-title">Security</h1><p class="muted small">Fake/duplicate order protection, IP blocks, alerts, sessions and audit trail</p></div></div>

  <div class="a-grid-2">
    <form class="a-card" method="post" action="<?= e(url('/admin/security/duplicate')) ?>" data-ajax data-no-spa>
      <h2 class="a-card-title"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> Duplicate order protection</h2>
      <label class="switch-row"><input type="checkbox" name="dup_enabled" value="1"<?= $on('dup_enabled') ?>><span class="toggle"></span><span><strong>Enabled</strong><small class="muted d-block">Reject a new order when a recent order matches any selected signal</small></span></label>
      <div class="grid-3">
        <div class="field"><label class="label" for="dp-w">Window (hours)</label><input id="dp-w" class="input" type="number" min="1" name="dup_window_hours" value="<?= e(setting('dup_window_hours')) ?>"></div>
        <div class="field"><label class="label" for="dp-a">Attempts before IP block</label><input id="dp-a" class="input" type="number" min="1" name="dup_max_attempts" value="<?= e(setting('dup_max_attempts')) ?>"></div>
        <div class="field"><label class="label" for="dp-b">Temporary block (hours)</label><input id="dp-b" class="input" type="number" min="1" name="dup_block_hours" value="<?= e(setting('dup_block_hours')) ?>"></div>
      </div>
      <span class="label">Signals</span>
      <label class="switch-row"><input type="checkbox" name="dup_check_phone" value="1"<?= $on('dup_check_phone') ?>><span class="toggle"></span><span>Same phone number</span></label>
      <label class="switch-row"><input type="checkbox" name="dup_check_device" value="1"<?= $on('dup_check_device') ?>><span class="toggle"></span><span>Same browser/device (anonymous cookie)</span></label>
      <label class="switch-row"><input type="checkbox" name="dup_check_ip" value="1"<?= $on('dup_check_ip') ?>><span class="toggle"></span><span>Same IP address<small class="muted d-block">Mobile networks & offices can share one IP — turn off if real customers get blocked</small></span></label>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Save</button></div>
    </form>

    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-ban" aria-hidden="true"></i> Block an IP</h2>
      <form method="post" action="<?= e(url('/admin/security/block')) ?>" data-ajax data-no-spa>
        <div class="grid-2">
          <div class="field"><label class="label" for="bl-ip">IP address</label><input id="bl-ip" class="input mono" name="ip" required placeholder="203.0.113.10"></div>
          <div class="field"><label class="label" for="bl-type">Type</label><select id="bl-type" class="input" name="type"><option value="temporary">Temporary</option><option value="permanent">Permanent</option></select></div>
        </div>
        <div class="grid-2">
          <div class="field"><label class="label" for="bl-h">Hours (temporary)</label><input id="bl-h" class="input" type="number" min="1" name="hours" value="24"></div>
          <div class="field"><label class="label" for="bl-r">Reason</label><input id="bl-r" class="input" name="reason" maxlength="250"></div>
        </div>
        <button class="btn btn-danger" type="submit"><i class="fa-solid fa-ban" aria-hidden="true"></i> Block IP</button>
      </form>
      <p class="muted small">Blocked IPs can still browse; only checkout is refused.</p>
    </section>
  </div>

  <section class="a-card a-table-card">
    <h2 class="a-card-title"><i class="fa-solid fa-list" aria-hidden="true"></i> Blocked IPs (<?= count($blocked) ?>)</h2>
    <?php if (!$blocked): ?><p class="muted small">No blocked IPs.</p><?php else: ?>
    <table class="a-table">
      <thead><tr><th>IP</th><th>Reason</th><th>Type</th><th>Attempts</th><th>Expires</th><th class="t-right">Action</th></tr></thead>
      <tbody>
      <?php foreach ($blocked as $b): $active = $b['type'] === 'permanent' || strtotime((string)$b['expires_at']) > time(); ?>
        <tr>
          <td class="mono" data-label="IP"><?= e($b['ip']) ?></td>
          <td data-label="Reason" class="small"><?= e($b['reason']) ?><span class="muted d-block"><?= e($b['admin_name'] ?: 'Automatic') ?> · <?= e(time_ago($b['created_at'])) ?></span></td>
          <td data-label="Type"><?= $b['type'] === 'permanent' ? '<span class="badge badge-danger">Permanent</span>' : '<span class="badge badge-warning">Temporary</span>' ?></td>
          <td data-label="Attempts"><?= (int)$b['attempts'] ?></td>
          <td data-label="Expires" class="small"><?= $b['type'] === 'permanent' ? '—' : e(date('d M H:i', strtotime((string)$b['expires_at']))) . ($active ? '' : ' <span class="badge badge-muted">expired</span>') ?></td>
          <td class="t-right"><button type="button" class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/admin/security/unblock/' . $b['id'])) ?>" data-confirm="Unblock <?= e($b['ip']) ?>?">Unblock</button></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <?php endif; ?>
  </section>

  <div class="a-grid-2">
    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Security alerts</h2>
      <?php if (!$alerts): ?><p class="muted small">No alerts.</p><?php endif; ?>
      <div class="list">
        <?php foreach ($alerts as $a): ?>
          <div class="list-row<?= (int)$a['is_resolved'] === 1 ? ' is-muted' : '' ?>">
            <span class="sev sev-<?= e($a['severity']) ?>" aria-label="<?= e($a['severity']) ?> severity"></span>
            <span class="list-main"><strong><?= e($a['title']) ?></strong><span class="muted small d-block"><?= e($a['message']) ?> · <?= e(time_ago($a['created_at'])) ?></span></span>
            <?php if ((int)$a['is_resolved'] !== 1): ?><button type="button" class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/admin/security/alerts/' . $a['id'] . '/resolve')) ?>">Resolve</button><?php endif; ?>
          </div>
        <?php endforeach; ?>
      </div>
    </section>
    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-user-xmark" aria-hidden="true"></i> Rejected order attempts (7 days)</h2>
      <?php if (!$attempts): ?><p class="muted small">None.</p><?php endif; ?>
      <div class="list">
        <?php foreach ($attempts as $at): ?>
          <div class="list-row"><span class="list-main"><span class="mono"><?= e($at['ip']) ?></span><span class="muted small d-block"><?= e(str_replace('_', ' ', $at['reason'])) ?> · last <?= e(time_ago($at['last_at'])) ?></span></span><strong><?= (int)$at['c'] ?>×</strong></div>
        <?php endforeach; ?>
      </div>
    </section>
  </div>

  <div class="a-grid-2">
    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-display" aria-hidden="true"></i> Active admin sessions</h2>
      <div class="list">
        <?php foreach ($sessions as $s): $mine = hash_equals($s['session_hash'], $currentHash); ?>
          <div class="list-row"><span class="list-main"><strong><?= e($s['name']) ?></strong><?= $mine ? ' <span class="badge badge-success">This device</span>' : '' ?><span class="muted small d-block"><?= e($s['ip']) ?> · <?= e(str_limit((string)$s['user_agent'], 60)) ?> · active <?= e(time_ago($s['last_activity'])) ?></span></span>
            <?php if (!$mine): ?><button type="button" class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/admin/security/sessions/' . $s['id'] . '/revoke')) ?>" data-confirm="Sign out this session?">Sign out</button><?php endif; ?></div>
        <?php endforeach; ?>
      </div>
    </section>
    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Recent login attempts</h2>
      <div class="list compact">
        <?php foreach ($logins as $l): ?><div class="list-row"><span class="list-main small"><?= (int)$l['success'] === 1 ? '<i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i>' : '<i class="fa-solid fa-circle-xmark text-danger" aria-hidden="true"></i>' ?> <?= e($l['email'] ?: '—') ?> <span class="muted">· <?= e($l['ip']) ?> · <?= e(time_ago($l['created_at'])) ?></span></span></div><?php endforeach; ?>
      </div>
    </section>
  </div>

  <?php if ($canManageAdmins): ?>
  <section class="a-card">
    <h2 class="a-card-title"><i class="fa-solid fa-users-gear" aria-hidden="true"></i> Admin users</h2>
    <div class="list">
      <?php foreach ($admins as $a): ?>
        <form class="list-row admin-row" method="post" action="<?= e(url('/admin/security/admins')) ?>" data-ajax data-no-spa>
          <input type="hidden" name="id" value="<?= (int)$a['id'] ?>">
          <span class="list-main"><strong><?= e($a['name']) ?></strong><?= (int)$a['two_factor_enabled'] === 1 ? ' <span class="badge badge-success">2FA</span>' : '' ?><span class="muted small d-block"><?= e($a['email']) ?> · last login <?= e(time_ago($a['last_login_at'])) ?></span></span>
          <label class="sr-only" for="ar-<?= (int)$a['id'] ?>">Role</label>
          <select id="ar-<?= (int)$a['id'] ?>" class="input input-sm" name="role"><?php foreach (['owner', 'manager', 'staff'] as $role): ?><option<?= $a['role'] === $role ? ' selected' : '' ?>><?= $role ?></option><?php endforeach; ?></select>
          <label class="sr-only" for="as-<?= (int)$a['id'] ?>">Status</label>
          <select id="as-<?= (int)$a['id'] ?>" class="input input-sm" name="status"><option value="active">active</option><option value="disabled"<?= $a['status'] === 'disabled' ? ' selected' : '' ?>>disabled</option></select>
          <input type="hidden" name="allow_google" value="1">
          <button class="btn btn-sm btn-outline" type="submit">Save</button>
        </form>
      <?php endforeach; ?>
    </div>
    <details class="details"><summary>Add admin</summary>
      <form method="post" action="<?= e(url('/admin/security/admins')) ?>" data-ajax data-no-spa autocomplete="off">
        <div class="grid-2">
          <div class="field"><label class="label" for="na-name">Name</label><input id="na-name" class="input" name="name" required></div>
          <div class="field"><label class="label" for="na-email">Email</label><input id="na-email" class="input" type="email" name="email" required></div>
        </div>
        <div class="grid-2">
          <div class="field"><label class="label" for="na-pass">Temporary password</label><input id="na-pass" class="input" type="password" name="password" autocomplete="new-password" required></div>
          <div class="field"><label class="label" for="na-role">Role</label><select id="na-role" class="input" name="role"><option>staff</option><option>manager</option><option>owner</option></select></div>
        </div>
        <label class="switch-row"><input type="checkbox" name="allow_google" value="1" checked><span class="toggle"></span><span>Allow Google Sign-In</span></label>
        <button class="btn btn-primary" type="submit">Create admin</button>
      </form>
    </details>
    <p class="muted small">Staff cannot open settings, security, backup, plugins, tracking, trash, analytics or delivery. Managers cannot create backups or manage admins.</p>
  </section>
  <?php endif; ?>

  <section class="a-card a-table-card">
    <h2 class="a-card-title"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i> Audit log</h2>
    <table class="a-table">
      <thead><tr><th>When</th><th>Admin</th><th>Action</th><th class="hide-sm">Changes</th><th class="hide-sm">IP</th></tr></thead>
      <tbody>
      <?php foreach ($logs as $l): ?>
        <tr>
          <td class="small" data-label="When"><?= e(date('d M H:i', strtotime($l['created_at']))) ?></td>
          <td data-label="Admin"><?= e($l['admin_name'] ?: 'System') ?></td>
          <td data-label="Action"><span class="mono small"><?= e($l['action']) ?></span><?= $l['entity_id'] ? ' <span class="muted small">#' . (int)$l['entity_id'] . '</span>' : '' ?></td>
          <td class="hide-sm small muted"><?= $l['new_values'] ? e(str_limit((string)$l['new_values'], 90)) : '' ?></td>
          <td class="hide-sm mono small"><?= e($l['ip']) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </section>
</div>
