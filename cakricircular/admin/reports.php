<?php
/* ================= রিপোর্ট ================= */
admin_start('রিপোর্ট');
need('reports');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();
    $act = (string)($_POST['act'] ?? '');
    $ids = array_map('intval', (array)($_POST['ids'] ?? []));
    /* এক সারির বাটন হলে: act = "done:12" */
    if (strpos($act, ':') !== false) {
        [$act, $one] = explode(':', $act, 2);
        $ids = [(int)$one];
    }
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        if ($act === 'delete') { q("DELETE FROM reports WHERE id IN ($in)", $ids); flash('ok', 'মুছে ফেলা হয়েছে।'); }
        elseif ($act === 'done') { q("UPDATE reports SET status = 1 WHERE id IN ($in)", $ids); flash('ok', 'সমাধান করা হয়েছে হিসেবে চিহ্নিত।'); }
        elseif ($act === 'new')  { q("UPDATE reports SET status = 0 WHERE id IN ($in)", $ids); flash('ok', 'নতুন হিসেবে চিহ্নিত।'); }
    }
    admin_go(au('reports'));
}

$rows = all("SELECT * FROM reports ORDER BY status ASC, created_at DESC LIMIT 300");
$new  = (int)col("SELECT COUNT(*) FROM reports WHERE status = 0");
show_flash();
?>
<form method="post">
  <?= csrf_field() ?>
  <div class="a-card">
    <h2><i class="fa fa-flag"></i>রিপোর্ট ও প্রমোশন অনুরোধ — নতুন <?= bn($new) ?> টি</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <label class="pill mut" style="display:flex;align-items:center;gap:7px;cursor:pointer;padding:6px 12px">
        <input type="checkbox" id="checkAll" class="chk"> সব নির্বাচন</label>
      <button class="btn sm" name="act" value="done"><i class="fa fa-check"></i> সমাধান হয়েছে</button>
      <button class="btn sm sec" name="act" value="new"><i class="fa fa-rotate-left"></i> নতুন করুন</button>
      <button class="btn sm dan" name="act" value="delete" data-confirm="নির্বাচিত রিপোর্ট মুছে ফেলবেন?"><i class="fa fa-trash"></i> মুছে ফেলুন</button>
    </div>
    <div class="a-list">
      <?php foreach ($rows as $r): ?>
        <div class="a-row <?= $r['status'] ? '' : 'new' ?>">
          <input type="checkbox" class="chk chk-item" name="ids[]" value="<?= (int)$r['id'] ?>">
          <span class="pill <?= $r['status'] ? 'on' : 'off' ?>" style="flex:none"><?= $r['status'] ? 'সমাধান' : 'নতুন' ?></span>
          <div class="rw-tx">
            <b><?= e($r['title']) ?></b>
            <small><?= e($r['email']) ?> · <?= e(time_ago($r['created_at'])) ?></small>
          </div>
          <div class="rw-act">
            <button type="button" class="ibtn" data-view title="বিস্তারিত দেখুন"><i class="fa fa-eye"></i></button>
            <?php if (!$r['status']): ?>
              <button class="ibtn ok" name="act" value="done:<?= (int)$r['id'] ?>" title="সমাধান হয়েছে"><i class="fa fa-check"></i></button>
            <?php else: ?>
              <button class="ibtn" name="act" value="new:<?= (int)$r['id'] ?>" title="নতুন করুন"><i class="fa fa-rotate-left"></i></button>
            <?php endif; ?>
            <button class="ibtn dan" name="act" value="delete:<?= (int)$r['id'] ?>" data-confirm="রিপোর্টটি মুছে ফেলবেন?" title="মুছুন"><i class="fa fa-trash"></i></button>
          </div>

          <script type="text/template" class="rw-full">
            <h3><?= e($r['title']) ?></h3>
            <div class="am-meta">
              <span><i class="fa fa-clock" style="margin-left:0;margin-right:5px"></i><?= e(bn_datetime($r['created_at'])) ?></span>
              <span><?= $r['status'] ? 'সমাধান হয়েছে' : 'নতুন' ?></span>
              <span><i class="fa fa-location-crosshairs" style="margin-left:0;margin-right:5px"></i><?= e($r['ip']) ?></span>
            </div>
            <div class="am-text"><?= e($r['details']) ?></div>
            <div class="am-act">
              <a class="btn sm" href="mailto:<?= e($r['email']) ?>"><i class="fa fa-reply"></i> <?= e($r['email']) ?></a>
            </div>
          </script>
        </div>
      <?php endforeach; ?>
      <?php if (!$rows): ?>
        <p style="text-align:center;color:var(--muted);padding:26px">এখনো কোনো রিপোর্ট আসেনি।</p>
      <?php endif; ?>
    </div>
  </div>
</form>
<?php admin_end(); ?>
