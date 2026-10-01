<?php
/* ================= নোটিশ ================= */
admin_start('নোটিশ');
need('notices');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();
    $do = (string)($_POST['do'] ?? '');
    if ($do === 'add') {
        $t  = trim((string)$_POST['title']);
        $id = (int)($_POST['id'] ?? 0);
        if ($t === '') flash('err', 'নোটিশের শিরোনাম দিন।');
        elseif ($id) {
            q("UPDATE notices SET title = ?, body = ?, link = ? WHERE id = ?",
              [mb_substr($t, 0, 255, 'UTF-8'), trim((string)$_POST['body']), trim((string)$_POST['link']), $id]);
            flash('ok', 'নোটিশ আপডেট হয়েছে।');
        } else {
            q("INSERT INTO notices (title, body, link, is_active, created_at) VALUES (?,?,?,?,NOW())",
              [mb_substr($t, 0, 255, 'UTF-8'), trim((string)$_POST['body']), trim((string)$_POST['link']), 1]);
            prune_notices();
            flash('ok', 'নোটিশ পাঠানো হয়েছে।');
        }
    } elseif ($do === 'bulk') {
        $act0 = (string)($_POST['act'] ?? '');
        if (strpos($act0, ':') !== false) {                 /* এক সারির বাটন */
            [$a1, $one] = explode(':', $act0, 2);
            $_POST['act'] = $a1;
            $_POST['ids'] = [(int)$one];
        }
        $ids = array_map('intval', (array)($_POST['ids'] ?? []));
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            if (($_POST['act'] ?? '') === 'delete') { q("DELETE FROM notices WHERE id IN ($in)", $ids); flash('ok', bn(count($ids)) . ' টি মুছে ফেলা হয়েছে।'); }
            elseif (($_POST['act'] ?? '') === 'off') { q("UPDATE notices SET is_active = 0 WHERE id IN ($in)", $ids); flash('ok', 'বন্ধ করা হয়েছে।'); }
            elseif (($_POST['act'] ?? '') === 'on')  { q("UPDATE notices SET is_active = 1 WHERE id IN ($in)", $ids); flash('ok', 'সক্রিয় করা হয়েছে।'); }
        }
    }
    admin_go(au('notices'));
}

prune_notices();
$editN = null;
if (!empty($_GET['edit'])) $editN = one("SELECT * FROM notices WHERE id = ?", [(int)$_GET['edit']]);
$limit = notice_limit();
$rows  = all("SELECT * FROM notices ORDER BY created_at DESC, id DESC LIMIT 200");
$nCount = count($rows);
show_flash();
echo '<div class="msg" style="background:#eef5f4;color:#2c4540">'
   . '<i class="fa fa-circle-info" style="margin-left:0;margin-right:7px;color:var(--brand)"></i>'
   . 'এখন আছে <b>' . bn($nCount) . '</b> টি নোটিশ। সর্বোচ্চ <b>' . bn($limit) . '</b> টি রাখা হয় — '
   . 'নতুন নোটিশ এলে এর চেয়ে পুরনোগুলো অটো মেয়াদ শেষ হয়ে এডমিন ও সাইট দুই জায়গা থেকেই মুছে যায়। '
   . '(সংখ্যা বদলাতে সেটিংসে যান)</div>';
?>
<div class="a-card">
  <h2><i class="fa fa-bullhorn"></i><?= $editN ? 'নোটিশ সম্পাদনা' : 'নতুন নোটিশ' ?></h2>
  <form method="post">
    <?= csrf_field() ?>
    <input type="hidden" name="do" value="add">
    <?php if ($editN): ?><input type="hidden" name="id" value="<?= (int)$editN['id'] ?>"><?php endif; ?>
    <div class="grid auto">
      <div><label>শিরোনাম *</label>
        <input type="text" name="title" required value="<?= e($editN['title'] ?? '') ?>" placeholder="যেমন: HSC পরীক্ষার সময়সূচি প্রকাশিত"></div>
      <div><label>লিংক (ঐচ্ছিক)</label>
        <input type="url" name="link" value="<?= e($editN['link'] ?? '') ?>" placeholder="https://..."></div>
    </div>
    <div style="margin-top:10px"><label>বিস্তারিত (ঐচ্ছিক)</label>
      <textarea name="body" style="min-height:62px" placeholder="ছোট করে দুই লাইন লিখুন।"><?= e($editN['body'] ?? '') ?></textarea></div>
    <div class="save-bar">
      <button class="btn" type="submit"><i class="fa fa-paper-plane"></i> <?= $editN ? 'আপডেট করুন' : 'নোটিশ পুশ করুন' ?></button>
      <?php if ($editN): ?><a class="btn sec" href="<?= e(au('notices')) ?>">বাতিল</a><?php endif; ?>
    </div>
    <p class="hint">নতুন নোটিশ দিলে ব্যবহারকারীর বটম মেনুতে লাল ডিজিট ও সাউন্ড দেখাবে।</p>
  </form>
</div>

<form method="post">
  <?= csrf_field() ?>
  <input type="hidden" name="do" value="bulk">
  <div class="a-card">
    <h2><i class="fa fa-list"></i>সব নোটিশ (<?= bn(count($rows)) ?>)</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <label class="pill mut" style="display:flex;align-items:center;gap:7px;cursor:pointer;padding:6px 12px">
        <input type="checkbox" id="checkAll" class="chk"> সব নির্বাচন</label>
      <button class="btn sm" name="act" value="on"><i class="fa fa-eye"></i> সক্রিয়</button>
      <button class="btn sm sec" name="act" value="off"><i class="fa fa-eye-slash"></i> বন্ধ</button>
      <button class="btn sm dan" name="act" value="delete" data-confirm="নির্বাচিত নোটিশ মুছে ফেলবেন?"><i class="fa fa-trash"></i> মুছে ফেলুন</button>
    </div>
    <div class="a-list">
      <?php foreach ($rows as $r): ?>
        <div class="a-row <?= $r['is_active'] ? '' : '' ?>">
          <input type="checkbox" class="chk chk-item" name="ids[]" value="<?= (int)$r['id'] ?>">
          <span class="pill <?= $r['is_active'] ? 'on' : 'off' ?>" style="flex:none"><?= $r['is_active'] ? 'সক্রিয়' : 'বন্ধ' ?></span>
          <div class="rw-tx">
            <b><?= e($r['title']) ?></b>
            <small><?= e(time_ago($r['created_at'])) ?><?= $r['body'] ? ' · ' . e(excerpt($r['body'], 60)) : '' ?></small>
          </div>
          <div class="rw-act">
            <button type="button" class="ibtn" data-view title="বিস্তারিত"><i class="fa fa-eye"></i></button>
            <a class="ibtn" href="<?= e(au('notices?edit=' . (int)$r['id'])) ?>" title="সম্পাদনা"><i class="fa fa-pen"></i></a>
            <button class="ibtn" name="act" value="<?= $r['is_active'] ? 'off' : 'on' ?>:<?= (int)$r['id'] ?>"
                    title="<?= $r['is_active'] ? 'বন্ধ করুন' : 'সক্রিয় করুন' ?>">
              <i class="fa <?= $r['is_active'] ? 'fa-eye-slash' : 'fa-eye' ?>"></i></button>
            <button class="ibtn dan" name="act" value="delete:<?= (int)$r['id'] ?>" data-confirm="নোটিশটি মুছে ফেলবেন?" title="মুছুন"><i class="fa fa-trash"></i></button>
          </div>

          <script type="text/template" class="rw-full">
            <h3><?= e($r['title']) ?></h3>
            <div class="am-meta">
              <span><i class="fa fa-clock" style="margin-left:0;margin-right:5px"></i><?= e(bn_datetime($r['created_at'])) ?></span>
              <span><?= $r['is_active'] ? 'সক্রিয়' : 'বন্ধ' ?></span>
            </div>
            <?php if ($r['body']): ?><div class="am-text"><?= e($r['body']) ?></div><?php endif; ?>
            <div class="am-act">
              <?php if ($r['link']): ?><a class="btn sm" href="<?= e($r['link']) ?>" target="_blank"><i class="fa fa-link"></i> লিংক খুলুন</a><?php endif; ?>
              <a class="btn sm sec" href="<?= e(au('notices?edit=' . (int)$r['id'])) ?>"><i class="fa fa-pen"></i> সম্পাদনা</a>
            </div>
          </script>
        </div>
      <?php endforeach; ?>
      <?php if (!$rows): ?>
        <p style="text-align:center;color:var(--muted);padding:26px">এখনো কোনো নোটিশ নেই।</p>
      <?php endif; ?>
    </div>
  </div>
</form>
<?php admin_end(); ?>
