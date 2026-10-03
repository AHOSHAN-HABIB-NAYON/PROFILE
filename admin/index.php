<?php
/** Admin dashboard. */
defined('APP') || exit;
require_once ROOT . '/core/analytics.php';
require_once ROOT . '/admin/_charts.php';
meta(['title' => 'Dashboard']);

$s = row("SELECT
  (SELECT COUNT(*) FROM users WHERE status <> 'deleted') users,
  (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL 7 DAY) new_users,
  (SELECT COALESCE(SUM(pageviews),0) FROM analytics) total_views,
  (SELECT COUNT(*) FROM analytics WHERE last_seen > NOW() - INTERVAL 30 DAY) uniques,
  (SELECT COUNT(*) FROM page_views WHERE created_at >= CURDATE()) views_today,
  (SELECT COUNT(*) FROM orders) orders,
  (SELECT COUNT(*) FROM payments WHERE status = 'pending') pending,
  (SELECT COUNT(*) FROM payments WHERE status IN ('approved','completed')) approved,
  (SELECT COUNT(*) FROM payments WHERE status = 'rejected') rejected,
  (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status IN ('approved','completed') AND currency = 'USD') rev_usd,
  (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status IN ('approved','completed') AND currency = 'BDT') rev_bdt,
  (SELECT COUNT(*) FROM services) services,
  (SELECT COUNT(*) FROM service_categories) categories,
  (SELECT COUNT(*) FROM news) news,
  (SELECT COUNT(*) FROM products WHERE status = 1) products,
  (SELECT COUNT(*) FROM ai_conversations WHERE role = 'assistant' AND created_at > NOW() - INTERVAL 30 DAY) ai,
  (SELECT COUNT(*) FROM notifications) notifications,
  (SELECT COUNT(*) FROM support_conversations WHERE status = 'open') support");
$online = online_count();
$cards = [
    ['Total users', number_format((int)$s['users']), 'fa-user-group', '', '/admin/users'],
    ['New users (7d)', '+' . number_format((int)$s['new_users']), 'fa-user-plus', 'success', '/admin/users?sort=new'],
    ['Online now', number_format($online), 'fa-signal', 'success', '/admin/analytics'],
    ['Total page views', number_format((int)$s['total_views']), 'fa-eye', 'accent', '/admin/analytics'],
    ['Unique visitors (30d)', number_format((int)$s['uniques']), 'fa-fingerprint', 'secondary', '/admin/analytics'],
    ['Page views today', number_format((int)$s['views_today']), 'fa-chart-simple', 'accent', '/admin/analytics'],
    ['Total orders', number_format((int)$s['orders']), 'fa-bag-shopping', '', '/admin/orders'],
    ['Pending payments', number_format((int)$s['pending']), 'fa-hourglass-half', 'warning', '/admin/payments?status=pending'],
    ['Approved payments', number_format((int)$s['approved']), 'fa-circle-check', 'success', '/admin/payments?status=approved'],
    ['Rejected payments', number_format((int)$s['rejected']), 'fa-circle-xmark', 'danger', '/admin/payments?status=rejected'],
    ['Revenue', '$' . number_format((float)$s['rev_usd'], 2) . ((float)$s['rev_bdt'] ? ' + ৳' . number_format((float)$s['rev_bdt']) : ''), 'fa-sack-dollar', 'success', '/admin/payments?status=approved'],
    ['Services', number_format((int)$s['services']), 'fa-layer-group', '', '/admin/services'],
    ['Categories', number_format((int)$s['categories']), 'fa-folder', '', '/admin/services?tab=categories'],
    ['News posts', number_format((int)$s['news']), 'fa-newspaper', 'secondary', '/admin/news'],
    ['Active products', number_format((int)$s['products']), 'fa-boxes-stacked', '', '/admin/products'],
    ['AI replies (30d)', number_format((int)$s['ai']), 'fa-robot', 'secondary', '/admin/ai'],
    ['Notifications', number_format((int)$s['notifications']), 'fa-bell', 'accent', '/admin/notifications'],
    ['Open support chats', number_format((int)$s['support']), 'fa-headset', 'warning', '/admin/support'],
];
// setup checklist
$checks = [];
if (!setting('smtp.username')) $checks[] = ['SMTP is not configured — emails use PHP mail() and may land in spam.', '/admin/settings?tab=smtp'];
if (!val('SELECT 1 FROM payment_methods WHERE enabled = 1')) $checks[] = ['No payment method is enabled yet — add your bKash / USDT / Binance Pay details.', '/admin/settings?tab=payment'];
if (setting_bool('ai.enabled') && setting('ai.provider', 'local') !== 'local' && !setting('ai.api_key')) $checks[] = ['An external AI provider is selected but no API key is set — the built-in assistant answers instead.', '/admin/ai'];
if (setting_bool('notify.push_enabled') && !setting('pwa.vapid_public')) $checks[] = ['Generate VAPID keys to enable Web Push notifications.', '/admin/settings?tab=pwa'];
if (!val('SELECT enabled FROM user_2fa WHERE user_id = ?', [user()['id']])) $checks[] = ['Protect your admin account with two-factor authentication.', '/profile/security'];
if (setting_bool('maintenance.enabled')) $checks[] = ['Maintenance mode is ON — visitors see the maintenance page.', '/admin/settings?tab=maintenance'];

$days = rows("SELECT DATE(created_at) d, COUNT(*) c FROM page_views WHERE created_at >= CURDATE() - INTERVAL 13 DAY GROUP BY DATE(created_at)");
$series = [];
$map = array_column($days, 'c', 'd');
for ($i = 13; $i >= 0; $i--) { $d = date('Y-m-d', strtotime("-$i day")); $series[] = [date('M j', strtotime($d)), (int)($map[$d] ?? 0)]; }
$recentPay = rows('SELECT p.*, u.name, o.code FROM payments p JOIN users u ON u.id = p.user_id JOIN orders o ON o.id = p.order_id ORDER BY p.id DESC LIMIT 6');
$recentUsers = rows('SELECT id, name, email, created_at FROM users ORDER BY id DESC LIMIT 5');
?>
<div class="page">
  <div class="adm-title"><div><h1>Dashboard</h1><p class="muted small mb-0"><?= e(at('Welcome back,')) ?> <?= e(user()['name']) ?> · <?= e(fmt_date(date('Y-m-d H:i:s'))) ?></p></div>
    <div class="row"><a class="btn btn-sm btn-soft" href="<?= e(url('/admin/news?new=1')) ?>"><i class="fa-solid fa-pen"></i>New post</a><a class="btn btn-sm" href="<?= e(url('/admin/notifications')) ?>"><i class="fa-solid fa-paper-plane"></i>Notify</a></div></div>

  <?php if ($checks): ?><div class="stack mb-2"><?php foreach ($checks as [$msg, $link]): ?>
    <a class="alert warning" href="<?= e(url($link)) ?>" style="color:inherit"><i class="fa-solid fa-triangle-exclamation"></i><span class="grow"><?= e($msg) ?></span><i class="fa-solid fa-chevron-right small muted"></i></a>
  <?php endforeach ?></div><?php endif ?>

  <div class="stat-grid mb-2">
    <?php foreach ($cards as [$label, $value, $icon, $tone, $link]): ?>
      <a class="card card-link stat-card" href="<?= e(url($link)) ?>"><span class="icon-box sm <?= $tone ?>"><i class="fa-solid <?= $icon ?>"></i></span><div><div class="v"><?= e($value) ?></div><div class="l"><?= e($label) ?></div></div></a>
    <?php endforeach ?>
  </div>

  <div class="grid-2 mb-2">
    <section class="card card-pad-lg">
      <div class="row-between mb-1"><h2 style="font-size:1rem;margin:0">Page views · last 14 days</h2><a class="small" href="<?= e(url('/admin/analytics')) ?>">Analytics</a></div>
      <?= chart_bars($series, 'Page views') ?>
    </section>
    <section class="card card-pad-lg">
      <div class="row-between mb-1"><h2 style="font-size:1rem;margin:0">Recent payments</h2><a class="small" href="<?= e(url('/admin/payments')) ?>">All</a></div>
      <?php if (!$recentPay): ?><p class="muted small">No payments yet.</p><?php endif ?>
      <div class="list" style="border:0"><?php foreach ($recentPay as $p): ?>
        <a class="list-row" style="padding:10px 4px" href="<?= e(url('/admin/payments?q=' . rawurlencode($p['txid']))) ?>"><span class="grow" style="min-width:0"><strong style="font-size:.86rem"><?= e($p['name']) ?></strong> <span class="tiny muted">#<?= e($p['code']) ?></span><br><span class="tiny muted"><?= e($p['method']) ?> · <?= e(time_ago($p['created_at'])) ?></span></span>
          <b class="small"><?= e(money($p['amount'], $p['currency'])) ?></b><span class="status status-<?= e($p['status']) ?>"><?= e(ucfirst($p['status'])) ?></span></a>
      <?php endforeach ?></div>
    </section>
  </div>
  <section class="card card-pad-lg">
    <div class="row-between mb-1"><h2 style="font-size:1rem;margin:0">Newest users</h2><a class="small" href="<?= e(url('/admin/users')) ?>">All users</a></div>
    <div class="list" style="border:0"><?php foreach ($recentUsers as $ru): ?>
      <a class="list-row" style="padding:10px 4px" href="<?= e(url('/admin/users?id=' . $ru['id'])) ?>"><span class="avatar sm"><?= e(mb_strtoupper(mb_substr($ru['name'], 0, 1))) ?></span><span class="grow" style="min-width:0"><strong style="font-size:.88rem"><?= e($ru['name']) ?></strong><br><span class="tiny muted truncate" style="display:block"><?= e($ru['email']) ?></span></span><span class="tiny muted"><?= e(time_ago($ru['created_at'])) ?></span></a>
    <?php endforeach ?></div>
  </section>
</div>
