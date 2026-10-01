<?php
View::$meta['title'] = 'লগ';
$tab = (string) ($_GET['tab'] ?? 'admin');
?>
<div class="admin-toolbar"><div class="chips">
  <a class="chip <?= $tab === 'admin' ? 'active' : '' ?>" href="<?= e(url('/v2admin/logs')) ?>" data-link>অ্যাডমিন কার্যক্রম</a>
  <a class="chip <?= $tab === 'email' ? 'active' : '' ?>" href="<?= e(url('/v2admin/logs?tab=email')) ?>" data-link>ইমেইল লগ</a>
  <a class="chip <?= $tab === 'login' ? 'active' : '' ?>" href="<?= e(url('/v2admin/logs?tab=login')) ?>" data-link>লগইন চেষ্টা</a>
</div></div>
<div class="card table-card"><div class="table-wrap"><table class="table">
<?php if ($tab === 'email'): $rows = db()->all('SELECT * FROM email_logs ORDER BY id DESC LIMIT 100'); ?>
  <thead><tr><th>প্রাপক</th><th>বিষয়</th><th>টেমপ্লেট</th><th>স্ট্যাটাস</th><th>ত্রুটি</th><th>সময়</th></tr></thead><tbody>
  <?php foreach ($rows as $r): ?><tr><td><?= e($r['to_email']) ?></td><td><?= e($r['subject']) ?></td><td><?= e($r['template']) ?></td><td><?= $r['status'] === 'sent' ? '<span class="badge badge-ok">sent</span>' : '<span class="badge badge-' . ($r['status'] === 'failed' ? 'err' : 'muted') . '">' . e($r['status']) . '</span>' ?></td><td class="small"><?= e(mb_strimwidth((string) $r['error'], 0, 80, '…')) ?></td><td class="small muted"><?= e(bn_date($r['created_at'])) ?></td></tr><?php endforeach; ?>
<?php elseif ($tab === 'login'): $rows = db()->all('SELECT * FROM login_attempts ORDER BY id DESC LIMIT 100'); ?>
  <thead><tr><th>স্কোপ</th><th>আইডেন্টিফায়ার</th><th>IP</th><th>ফলাফল</th><th>সময়</th></tr></thead><tbody>
  <?php foreach ($rows as $r): ?><tr><td><?= e($r['scope']) ?></td><td><?= e($r['identifier']) ?></td><td class="num"><?= e($r['ip']) ?></td><td><?= $r['success'] ? '<span class="badge badge-ok">সফল</span>' : '<span class="badge badge-err">ব্যর্থ</span>' ?></td><td class="small muted"><?= e(bn_date($r['created_at'])) ?></td></tr><?php endforeach; ?>
<?php else: $rows = db()->all('SELECT l.*, a.name FROM admin_logs l LEFT JOIN admin_users a ON a.id = l.admin_id ORDER BY l.id DESC LIMIT 100'); ?>
  <thead><tr><th>অ্যাডমিন</th><th>কাজ</th><th>টার্গেট</th><th>IP</th><th>সময়</th></tr></thead><tbody>
  <?php foreach ($rows as $r): ?><tr><td><?= e($r['name'] ?? '—') ?></td><td><code><?= e($r['action']) ?></code></td><td><?= e($r['target']) ?></td><td class="num"><?= e($r['ip']) ?></td><td class="small muted"><?= e(bn_date($r['created_at'])) ?></td></tr><?php endforeach; ?>
<?php endif; ?>
</tbody></table></div><?php if (!$rows) echo empty_state('activity', 'কোনো লগ নেই'); ?></div>
