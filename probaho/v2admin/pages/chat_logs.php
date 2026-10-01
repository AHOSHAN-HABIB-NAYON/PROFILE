<?php
View::$meta['title'] = 'AI চ্যাট লগ';
$key = preg_replace('/[^a-f0-9]/', '', (string) ($_GET['s'] ?? ''));
if ($key !== '') {
    $msgs = db()->all('SELECT l.*, u.name FROM ai_chat_logs l LEFT JOIN users u ON u.id = l.user_id WHERE session_key = ? ORDER BY id', [$key]);
    ?>
    <div class="admin-toolbar"><a href="<?= e(url('/v2admin/chat-logs')) ?>" class="btn btn-ghost btn-sm" data-link><?= icon('chevron-left') ?> সব কথোপকথন</a></div>
    <div class="card admin-card chat-demo" style="max-width:720px">
      <?php foreach ($msgs as $m): ?><div class="bubble <?= $m['role'] === 'user' ? 'me' : 'bot' ?>"><?= e($m['message']) ?><?php if ($m['source']): ?><br><small class="muted">[<?= e($m['source']) ?>]</small><?php endif; ?></div><?php endforeach; ?>
    </div>
    <?php
    return;
}
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 40;
$total = (int) db()->val('SELECT COUNT(DISTINCT session_key) FROM ai_chat_logs');
$rows = db()->all("SELECT session_key, MAX(l.created_at) last_at, COUNT(*) n, MAX(u.name) name,
    SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN role='user' THEN message END ORDER BY l.id SEPARATOR '\n'), '\n', 1) first_q
    FROM ai_chat_logs l LEFT JOIN users u ON u.id = l.user_id GROUP BY session_key ORDER BY last_at DESC LIMIT $per OFFSET " . (($page - 1) * $per));
?>
<div class="admin-toolbar">
  <span class="muted small">মোট <?= number_format($total) ?>টি কথোপকথন · লগ সংরক্ষণ: <?= setting_on('ai_log_chats') ? 'চালু' : 'বন্ধ' ?></span>
  <button class="btn btn-ghost" style="color:var(--err)" data-post="<?= e(url('/v2admin/api/system/clear-chats')) ?>" data-confirm="সব চ্যাট লগ স্থায়ীভাবে মুছে ফেলবেন?" data-danger><?= icon('trash') ?> সব লগ মুছুন</button>
</div>
<div class="card table-card"><div class="table-wrap"><table class="table">
  <thead><tr><th>প্রথম প্রশ্ন</th><th>ইউজার</th><th>বার্তা</th><th>শেষ</th></tr></thead>
  <tbody><?php foreach ($rows as $r): ?><tr>
    <td><a class="tbl-link" href="<?= e(url('/v2admin/chat-logs?s=' . $r['session_key'])) ?>" data-link><?= e(mb_strimwidth((string) $r['first_q'], 0, 80, '…')) ?></a></td>
    <td><?= e($r['name'] ?: 'অতিথি') ?></td><td><?= (int) $r['n'] ?></td><td class="small muted"><?= e(time_ago($r['last_at'])) ?></td>
  </tr><?php endforeach; ?></tbody>
</table></div><?php if (!$rows) echo empty_state('message', 'কোনো চ্যাট লগ নেই'); ?></div>
<?= admin_pagination($total, $page, $per) ?>
