<?php
/** Admin: security overview — audit log, failed logins, staff sessions, cron. */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
require_once ROOT . '/core/cron.php';
meta(['title' => 'Security & Audit']);

$tab = in_array(input('tab'), ['audit', 'logins', 'sessions', 'system'], true) ? input('tab') : 'audit';
$q = mb_substr(input('q'), 0, 80);
?>
<div class="page">
  <div class="adm-title"><h1>Security & Audit</h1><a class="btn btn-sm btn-soft" href="<?= e(url('/admin/settings?tab=security')) ?>"><i class="fa-solid fa-sliders"></i>Security settings</a></div>
  <nav class="tabs">
    <?php foreach (['audit' => ['Audit log', 'fa-clipboard-list'], 'logins' => ['Login attempts', 'fa-right-to-bracket'], 'sessions' => ['Staff sessions', 'fa-laptop'], 'system' => ['System', 'fa-server']] as $k => [$l, $i]): ?>
      <a class="tab <?= $tab === $k ? 'active' : '' ?>" href="<?= e(url('/admin/security?tab=' . $k)) ?>"><i class="fa-solid <?= $i ?>"></i><?= $l ?></a>
    <?php endforeach ?>
  </nav>
<?php if ($tab === 'audit'):
    $where = '1'; $p = [];
    if ($q !== '') { $l = '%' . addcslashes($q, '%_\\') . '%'; $where = '(a.action LIKE ? OR a.description LIKE ? OR u.name LIKE ? OR a.ip LIKE ?)'; $p = [$l, $l, $l, $l]; }
    $pg = paginate((int)val("SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.id = a.admin_id WHERE $where", $p), 40, max(1, input_int('page', 1)));
    $logs = rows("SELECT a.*, u.name FROM audit_logs a LEFT JOIN users u ON u.id = a.admin_id WHERE $where ORDER BY a.id DESC LIMIT {$pg['per']} OFFSET {$pg['offset']}", $p); ?>
  <form class="toolbar" method="get" action="<?= e(url('/admin/security')) ?>" data-get-form><input type="hidden" name="tab" value="audit">
    <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="Action, admin, IP, description…"></div></form>
  <table class="dtable"><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Description</th><th>IP</th></tr></thead><tbody>
    <?php foreach ($logs as $a): ?><tr><td data-label="Time"><?= e(date('M j, H:i:s', strtotime($a['created_at']))) ?></td><td data-label="Admin"><?= e($a['name'] ?: 'System') ?></td>
      <td data-label="Action"><span class="badge muted"><?= e($a['action']) ?></span></td><td data-label="Target"><?= e($a['target_type'] ? $a['target_type'] . ' #' . $a['target_id'] : '—') ?></td>
      <td data-label="Description"><?= e(mb_strimwidth((string)$a['description'], 0, 120, '…')) ?></td><td data-label="IP"><?= e($a['ip']) ?></td></tr><?php endforeach ?>
  </tbody></table>
  <?php admin_pager($pg, '/admin/security?' . http_build_query(['tab' => 'audit', 'q' => $q])) ?>
<?php elseif ($tab === 'logins'):
    $fails = rows('SELECT ip, COUNT(*) c, MAX(created_at) last FROM login_history WHERE success = 0 AND created_at > NOW() - INTERVAL 1 DAY GROUP BY ip ORDER BY c DESC LIMIT 10');
    $logins = rows('SELECT l.*, u.name FROM login_history l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 60'); ?>
  <?php if ($fails): ?><section class="card card-pad-lg mb-2"><h2 style="font-size:1rem">Failed logins by IP (24h)</h2>
    <?php require_once ROOT . '/admin/_charts.php'; echo chart_hbars(array_map(fn($f) => [$f['ip'], (int)$f['c']], $fails)); ?></section><?php endif ?>
  <table class="dtable"><thead><tr><th>Time</th><th>Account</th><th>Result</th><th>Method</th><th>IP</th><th>Device</th></tr></thead><tbody>
    <?php foreach ($logins as $l): ?><tr><td data-label="Time"><?= e(date('M j, H:i', strtotime($l['created_at']))) ?></td><td data-label="Account"><?= $l['user_id'] ? '<a href="' . e(url('/admin/users?id=' . $l['user_id'])) . '">' . e($l['name']) . '</a>' : e($l['email'] ?: '—') ?></td>
      <td data-label="Result"><span class="badge <?= $l['success'] ? 'success' : 'danger' ?>"><?= $l['success'] ? 'Success' : e($l['reason'] ?: 'Failed') ?></span></td><td data-label="Method"><?= e($l['method']) ?></td><td data-label="IP"><?= e($l['ip']) ?></td><td data-label="Device"><?= e($l['device']) ?></td></tr><?php endforeach ?>
  </tbody></table>
<?php elseif ($tab === 'sessions'):
    $sess = rows("SELECT s.*, u.name, u.role FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.revoked_at IS NULL AND u.role IN ('admin','editor','support') ORDER BY s.last_active DESC LIMIT 50"); ?>
  <table class="dtable"><thead><tr><th>Staff</th><th>Role</th><th>Device</th><th>IP</th><th>Last active</th><th></th></tr></thead><tbody>
    <?php foreach ($sess as $s): ?><tr><td data-label="Staff"><?= e($s['name']) ?></td><td data-label="Role"><span class="badge muted"><?= e($s['role']) ?></span></td><td data-label="Device"><?= e($s['device']) ?></td><td data-label="IP"><?= e($s['ip']) ?></td><td data-label="Last active"><?= e(time_ago($s['last_active'])) ?></td>
      <td class="actions"><button class="btn btn-sm btn-ghost" data-action="post" data-url="<?= e(url('/api/admin?action=session_revoke')) ?>" data-params='<?= e(json_encode(['id' => (int)$s['id']])) ?>' data-confirm="End this session?">Revoke</button></td></tr><?php endforeach ?>
  </tbody></table>
<?php else:
    $checks = [
        ['HTTPS', IS_HTTPS, IS_HTTPS ? 'Site URL uses HTTPS — secure cookies & HSTS active.' : 'Install an SSL certificate and use https:// in config/env.php.'],
        ['Installer locked', is_file(ROOT . '/storage/installed.lock'), 'The installer is disabled after installation.'],
        ['Storage writable', is_writable(ROOT . '/storage') && is_writable(ROOT . '/assets/uploads'), 'storage/ and assets/uploads/ must be writable by PHP.'],
        ['display_errors off', !ini_get('display_errors'), 'Errors are logged to storage/logs, never shown to visitors.'],
        ['GD WebP support', function_exists('imagewebp'), 'Needed for WebP conversion of uploads.'],
        ['Sodium (encryption)', function_exists('sodium_crypto_secretbox'), 'Secrets (SMTP/API keys, 2FA seeds) are encrypted at rest.'],
        ['Admin 2FA required', setting_bool('security.require_2fa_admin'), 'Optional: force staff accounts to use 2FA.'],
        ['reCAPTCHA', recaptcha_enabled(), 'Optional: protects login, registration, contact.'],
    ];
    $queue = row('SELECT SUM(sent_at IS NULL AND attempts < 3) pending, SUM(sent_at IS NULL AND attempts >= 3) failed FROM email_queue'); ?>
  <section class="card card-pad-lg mb-2"><h2 style="font-size:1rem">Health checks</h2>
    <div class="list"><?php foreach ($checks as [$l, $ok, $hint]): ?><div class="list-row"><span class="icon-box sm <?= $ok ? 'success' : 'warning' ?>"><i class="fa-solid <?= $ok ? 'fa-check' : 'fa-exclamation' ?>"></i></span><span class="grow"><strong style="font-size:.88rem"><?= e($l) ?></strong><br><span class="tiny muted"><?= e($hint) ?></span></span></div><?php endforeach ?></div></section>
  <section class="card card-pad-lg mb-2"><h2 style="font-size:1rem">Cron (recommended)</h2>
    <p class="muted small">Add a cron job in your hosting panel every 5 minutes to send queued email and clean old data:</p>
    <div class="copy-row" style="display:flex;gap:8px;align-items:center;background:var(--soft);border-radius:12px;padding:8px 8px 8px 12px"><code class="grow small" style="word-break:break-all">curl -fsS <?= e(abs_url('/cron/' . cron_key())) ?> &gt;/dev/null</code><button class="btn btn-sm btn-soft" data-action="copy" data-copy="curl -fsS <?= e(abs_url('/cron/' . cron_key())) ?> >/dev/null"><i class="fa-regular fa-copy"></i></button></div>
    <p class="small mt-1 mb-0">Email queue: <b><?= (int)$queue['pending'] ?></b> pending, <b><?= (int)$queue['failed'] ?></b> failed.</p></section>
  <section class="card card-pad-lg"><h2 style="font-size:1rem">Environment</h2>
    <dl class="kv"><dt>App version</dt><dd><?= APP_VERSION ?></dd><dt>PHP</dt><dd><?= PHP_VERSION ?></dd><dt>Database</dt><dd><?= e((string)db()->getAttribute(PDO::ATTR_SERVER_VERSION)) ?></dd><dt>Site URL</dt><dd><?= e(BASE_URL) ?></dd><dt>Timezone</dt><dd><?= e(date_default_timezone_get()) ?></dd></dl></section>
<?php endif ?>
</div>
