<?php
/** User reports: view, screenshots, status & reply. */
$statuses = ['pending' => 'অপেক্ষমাণ', 'reviewing' => 'পর্যালোচনায়', 'resolved' => 'সমাধান হয়েছে', 'rejected' => 'প্রত্যাখ্যাত'];
if ($id !== null) {
    $r = db()->row('SELECT r.*, u.name, u.email, u.uid AS user_uid FROM reports r JOIN users u ON u.id = r.user_id WHERE r.id = ?', [(int) $id]);
    if (!$r) {
        echo '<div class="card">' . empty_state('flag', 'রিপোর্ট পাওয়া যায়নি') . '</div>';
        return;
    }
    View::$meta['title'] = 'রিপোর্ট #' . $r['uid'];
    $files = db()->all('SELECT * FROM report_files WHERE report_id = ?', [$r['id']]);
    $tx = $r['tx_ref'] ? db()->row('SELECT id, uid FROM transactions WHERE uid = ?', [$r['tx_ref']]) : null;
    ?>
    <div class="admin-toolbar"><a href="<?= e(url('/v2admin/reports')) ?>" class="btn btn-ghost btn-sm" data-link><?= icon('chevron-left') ?> সব রিপোর্ট</a></div>
    <div class="admin-grid-2">
      <section class="card admin-card">
        <div class="row between"><h3 class="card-title">#<?= e($r['uid']) ?> · <?= e($r['category']) ?></h3><?= status_badge($r['status']) ?></div>
        <div class="kv" style="margin:10px 0">
          <div><span class="k">ইউজার</span><span class="v"><a href="<?= e(url('/v2admin/users/' . $r['user_id'])) ?>" data-link><?= e($r['name']) ?></a> <small class="muted"><?= e($r['email']) ?></small></span></div>
          <div><span class="k">Transaction ID</span><span class="v"><?= $tx ? '<a href="' . e(url('/v2admin/transactions/' . $tx['id'])) . '" data-link>' . e($tx['uid']) . '</a>' : e($r['tx_ref'] ?: '—') ?></span></div>
          <div><span class="k">তারিখ</span><span class="v"><?= e(bn_date($r['created_at'])) ?></span></div>
        </div>
        <div class="prose" style="white-space:pre-line;background:var(--surface-2);padding:12px;border-radius:12px"><?= e($r['description']) ?></div>
        <?php if ($files): ?><div class="gallery" style="margin-top:12px"><?php foreach ($files as $f): ?><a href="<?= e(upload_url($f['path'])) ?>" target="_blank" rel="noopener"><img src="<?= e(upload_url($f['path'])) ?>" alt="স্ক্রিনশট"></a><?php endforeach; ?></div><?php endif; ?>
      </section>
      <section class="card admin-card">
        <h3 class="card-title">স্ট্যাটাস ও উত্তর</h3>
        <form action="<?= e(url('/v2admin/api/reports/update')) ?>" method="post" data-ajax style="margin-top:10px">
          <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
          <div class="field"><label>স্ট্যাটাস</label><select class="select" name="status"><?php foreach ($statuses as $k => $v): ?><option value="<?= $k ?>" <?= $r['status'] === $k ? 'selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select></div>
          <div class="field"><label>উত্তর (ইউজার দেখবে)</label><textarea class="textarea" name="reply" rows="6"><?= e($r['admin_reply']) ?></textarea></div>
          <label class="check" style="margin-bottom:12px"><input type="checkbox" name="notify" value="1" checked> ইউজারকে নোটিফিকেশন ও ইমেইল পাঠান</label>
          <button class="btn btn-primary btn-block">আপডেট করুন</button>
        </form>
      </section>
    </div>
    <?php
    return;
}
View::$meta['title'] = 'রিপোর্ট';
$status = (string) ($_GET['status'] ?? '');
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 40;
$where = isset($statuses[$status]) ? 'r.status = ?' : '1';
$args = $where === '1' ? [] : [$status];
$total = (int) db()->val("SELECT COUNT(*) FROM reports r WHERE $where", $args);
$rows = db()->all("SELECT r.*, u.name, (SELECT COUNT(*) FROM report_files f WHERE f.report_id = r.id) files FROM reports r JOIN users u ON u.id = r.user_id WHERE $where ORDER BY FIELD(r.status,'pending','reviewing','resolved','rejected'), r.id DESC LIMIT $per OFFSET " . (($page - 1) * $per), $args);
?>
<div class="admin-toolbar"><div class="chips"><a class="chip <?= $status === '' ? 'active' : '' ?>" href="<?= e(url('/v2admin/reports')) ?>" data-link>সব</a><?php foreach ($statuses as $k => $v): ?><a class="chip <?= $status === $k ? 'active' : '' ?>" href="<?= e(url('/v2admin/reports?status=' . $k)) ?>" data-link><?= $v ?></a><?php endforeach; ?></div></div>
<div class="card table-card"><div class="table-wrap"><table class="table">
  <thead><tr><th>#</th><th>ইউজার</th><th>ক্যাটাগরি</th><th>বিবরণ</th><th>ছবি</th><th>স্ট্যাটাস</th><th>তারিখ</th></tr></thead>
  <tbody><?php foreach ($rows as $r): ?><tr>
    <td><a class="num tbl-link" href="<?= e(url('/v2admin/reports/' . $r['id'])) ?>" data-link><?= e($r['uid']) ?></a></td><td><?= e($r['name']) ?></td><td><?= e($r['category']) ?></td>
    <td><a href="<?= e(url('/v2admin/reports/' . $r['id'])) ?>" data-link class="tbl-link"><?= e(mb_strimwidth($r['description'], 0, 70, '…')) ?></a></td>
    <td><?= $r['files'] ? icon('image') . ' ' . (int) $r['files'] : '—' ?></td><td><?= status_badge($r['status']) ?></td><td class="small muted"><?= e(time_ago($r['created_at'])) ?></td>
  </tr><?php endforeach; ?></tbody>
</table></div><?php if (!$rows) echo empty_state('flag', 'কোনো রিপোর্ট নেই'); ?></div>
<?= admin_pagination($total, $page, $per, array_filter(['status' => $status])) ?>
