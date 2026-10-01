<?php
/* ================= ব্যানার ================= */
admin_start('ব্যানার');
need('banners');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();
    $do = (string)($_POST['do'] ?? '');

    if ($do === 'add') {
        $n = (int)col("SELECT COUNT(*) FROM banners");
        if ($n >= 10) flash('err', 'সর্বোচ্চ ১০টি ব্যানার রাখা যাবে।');
        elseif (empty($_FILES['image']['name'])) flash('err', 'ছবি নির্বাচন করুন।');
        else {
            $err = null;
            if ($f = upload_image($_FILES['image'], 'banners', 1712, $err, 856 / 292, 220)) {
                q("INSERT INTO banners (title, image, link, sort_order, is_active, created_at) VALUES (?,?,?,?,?,NOW())",
                  [trim((string)$_POST['title']), $f, trim((string)$_POST['link']), (int)$_POST['sort_order'], isset($_POST['is_active']) ? 1 : 0]);
                flash('ok', 'ব্যানার যোগ হয়েছে।');
            } else flash('err', $err ?: 'ছবি আপলোড হয়নি।');
        }
    } elseif ($do === 'update') {
        q("UPDATE banners SET title = ?, link = ?, sort_order = ?, is_active = ? WHERE id = ?",
          [trim((string)$_POST['title']), trim((string)$_POST['link']), (int)$_POST['sort_order'],
           isset($_POST['is_active']) ? 1 : 0, (int)$_POST['id']]);
        flash('ok', 'আপডেট হয়েছে।');
    } elseif ($do === 'toggle') {
        q("UPDATE banners SET is_active = 1 - is_active WHERE id = ?", [(int)$_POST['id']]);
        flash('ok', 'ব্যানারের অবস্থা বদলানো হয়েছে।');
    } elseif ($do === 'delete') {
        $b = one("SELECT * FROM banners WHERE id = ?", [(int)$_POST['id']]);
        if ($b) { @unlink(UPLOAD_PATH . '/banners/' . $b['image']); q("DELETE FROM banners WHERE id = ?", [$b['id']]); }
        flash('ok', 'মুছে ফেলা হয়েছে।');
    }
    admin_go(au('banners'));
}

$rows = all("SELECT * FROM banners ORDER BY sort_order, id");
show_flash();
?>
<div class="a-card">
  <h2><i class="fa fa-plus"></i>নতুন ব্যানার (<?= bn(count($rows)) ?>/১০)</h2>
  <form method="post" enctype="multipart/form-data">
    <?= csrf_field() ?>
    <input type="hidden" name="do" value="add">
    <div class="grid g4" style="align-items:end">
      <div><label>ছবি * <span style="font-weight:500;color:var(--muted)">(৮৫৬×২৯২)</span></label>
        <input type="file" name="image" accept="image/*" data-maxw="1712" data-ratio="2.9315" data-kb="220" required></div>
      <div><label>শিরোনাম (alt)</label><input type="text" name="title"></div>
      <div><label>লিংক (ঐচ্ছিক)</label><input type="url" name="link" placeholder="https://..."></div>
      <div><label>ক্রম</label><input type="number" name="sort_order" value="<?= count($rows) ?>"></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:12px;align-items:center">
      <label style="display:flex;gap:8px;align-items:center;font-weight:500;margin:0">
        <input type="checkbox" class="chk" name="is_active" value="1" checked> সক্রিয়</label>
      <button class="btn" type="submit"><i class="fa fa-upload"></i> যোগ করুন</button>
    </div>
    <p class="hint">সবচেয়ে ভালো মাপ <b>৮৫৬ × ২৯২ পিক্সেল</b>। অন্য মাপের ছবি দিলে মাঝখান থেকে অটো কেটে এই মাপে বসানো হবে।
      ছবি আপলোডের আগেই ব্রাউজারে ছোট (≈২০০কেবি) হয়ে যায়, তাই বড় ছবিও দ্রুত আপলোড হবে। লিংক না দিলে ব্যানারে ক্লিক করলে কিছু হবে না।</p>
  </form>
</div>

<div class="a-card" style="padding-bottom:6px">
  <h2><i class="fa fa-images"></i>সব ব্যানার (<?= bn(count($rows)) ?>)</h2>

  <div class="bn-grid">
    <?php foreach ($rows as $i => $b): ?>
      <div class="bn-card">
        <span class="bn-img">
          <img src="<?= e(img_url($b['image'], 'banners')) ?>" alt="" loading="lazy">
          <span class="idx">পজিশন <?= bn((int)$b['sort_order']) ?></span>
          <?php if (!$b['is_active']): ?><span class="off-mask"><i class="fa fa-eye-slash" style="margin-left:0;margin-right:7px"></i>বন্ধ আছে</span><?php endif; ?>
        </span>

        <div class="bn-body">
          <span class="nm <?= $b['title'] ? '' : 'none' ?>"><?= e($b['title'] ?: 'শিরোনামহীন') ?></span>
          <span class="pill <?= $b['is_active'] ? 'on' : 'off' ?>"><?= $b['is_active'] ? 'অ্যাক্টিভ' : 'বন্ধ' ?></span>

          <form method="post" style="display:flex;gap:6px">
            <?= csrf_field() ?>
            <input type="hidden" name="id" value="<?= (int)$b['id'] ?>">
            <button class="ibtn" name="do" value="toggle" title="<?= $b['is_active'] ? 'বন্ধ করুন' : 'চালু করুন' ?>"><i class="fa fa-power-off"></i></button>
            <button type="button" class="ibtn" data-bn-edit="<?= (int)$b['id'] ?>" title="সম্পাদনা"><i class="fa fa-pen"></i></button>
            <button class="ibtn dan" name="do" value="delete" data-confirm="ব্যানারটি মুছে ফেলবেন?" title="মুছুন"><i class="fa fa-trash"></i></button>
          </form>
        </div>

        <?php if ($b['link']): ?>
          <span class="bn-lnk"><i class="fa fa-link"></i><?= e($b['link']) ?></span>
        <?php endif; ?>

        <form method="post" class="bn-edit" id="bnEdit<?= (int)$b['id'] ?>" hidden>
          <?= csrf_field() ?>
          <input type="hidden" name="do" value="update"><input type="hidden" name="id" value="<?= (int)$b['id'] ?>">
          <div class="grid g2">
            <div><label>শিরোনাম</label><input type="text" name="title" value="<?= e($b['title']) ?>"></div>
            <div><label>পজিশন</label><input type="number" name="sort_order" value="<?= (int)$b['sort_order'] ?>"></div>
          </div>
          <div><label>লিংক</label><input type="url" name="link" value="<?= e($b['link']) ?>" placeholder="https://..."></div>
          <label style="display:flex;gap:8px;align-items:center;font-weight:500;margin:0">
            <input type="checkbox" class="chk" name="is_active" value="1" <?= $b['is_active'] ? 'checked' : '' ?>> সক্রিয়</label>
          <div style="display:flex;gap:8px">
            <button class="btn sm" type="submit"><i class="fa fa-floppy-disk"></i> সেভ করুন</button>
            <button type="button" class="btn sm sec" data-bn-close="<?= (int)$b['id'] ?>">বাতিল</button>
          </div>
        </form>
      </div>
    <?php endforeach; ?>

    <?php if (!$rows): ?>
      <div class="bn-card" style="padding:28px;text-align:center;color:var(--muted)">এখনো কোনো ব্যানার নেই।</div>
    <?php endif; ?>
  </div>
</div>

<script>
document.addEventListener('click', function (e) {
  var o = e.target.closest('[data-bn-edit]');
  if (o) { var f = document.getElementById('bnEdit' + o.getAttribute('data-bn-edit')); if (f) f.hidden = !f.hidden; return; }
  var c = e.target.closest('[data-bn-close]');
  if (c) { var f2 = document.getElementById('bnEdit' + c.getAttribute('data-bn-close')); if (f2) f2.hidden = true; }
});
</script>

<?php admin_end(); ?>
