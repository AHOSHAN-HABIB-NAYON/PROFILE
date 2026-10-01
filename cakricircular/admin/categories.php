<?php
/* ================= ক্যাটাগরি ================= */
admin_start('ক্যাটাগরি');
need('categories');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();
    $do = (string)($_POST['do'] ?? '');
    if ($do === 'save') {
        $id   = (int)($_POST['id'] ?? 0);
        $name = trim((string)$_POST['name']);
        if ($name === '') { flash('err', 'নাম দিন।'); }
        else {
            $slug = trim((string)$_POST['slug']) !== '' ? $_POST['slug'] : $name;
            $slug = unique_slug($slug, 'categories', $id);
            $args = [$name, $slug, trim((string)$_POST['icon']) ?: 'fa-folder',
                     trim((string)$_POST['meta_title']), trim((string)$_POST['meta_desc']),
                     (int)$_POST['sort_order'], isset($_POST['is_active']) ? 1 : 0];
            if ($id) { $args[] = $id; q("UPDATE categories SET name=?, slug=?, icon=?, meta_title=?, meta_desc=?, sort_order=?, is_active=? WHERE id=?", $args); }
            else     { q("INSERT INTO categories (name, slug, icon, meta_title, meta_desc, sort_order, is_active) VALUES (?,?,?,?,?,?,?)", $args); }
            flash('ok', 'সংরক্ষণ হয়েছে।');
        }
    } elseif ($do === 'delete') {
        $id = (int)$_POST['id'];
        $n  = (int)col("SELECT COUNT(*) FROM posts WHERE cat_id = ?", [$id]);
        if ($n > 0) flash('err', 'এই ক্যাটাগরিতে ' . bn($n) . ' টি পোস্ট আছে। আগে সেগুলো সরান।');
        else { q("DELETE FROM categories WHERE id = ?", [$id]); flash('ok', 'মুছে ফেলা হয়েছে।'); }
    }
    admin_go(au('categories'));
}

$edit = isset($_GET['id']) ? one("SELECT * FROM categories WHERE id = ?", [(int)$_GET['id']]) : null;
$rows = all("SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.cat_id = c.id) AS n
             FROM categories c ORDER BY c.sort_order, c.id");
show_flash();
?>
<div class="a-card">
  <h2><i class="fa <?= $edit ? 'fa-pen' : 'fa-plus' ?>"></i><?= $edit ? 'ক্যাটাগরি এডিট' : 'নতুন ক্যাটাগরি' ?></h2>
  <form method="post">
    <?= csrf_field() ?>
    <input type="hidden" name="do" value="save">
    <input type="hidden" name="id" value="<?= (int)($edit['id'] ?? 0) ?>">
    <div class="grid g4">
      <div><label>নাম *</label><input type="text" name="name" required value="<?= e($edit['name'] ?? '') ?>" placeholder="যেমন: সরকারি চাকরি"></div>
      <div><label>ক্লিন URL</label><input type="text" name="slug" value="<?= e($edit['slug'] ?? '') ?>" placeholder="sorkari-chakri"></div>
      <div><label>আইকন (Font Awesome)</label><input type="text" name="icon" value="<?= e($edit['icon'] ?? 'fa-folder') ?>" placeholder="fa-briefcase"></div>
      <div><label>ক্রম</label><input type="number" name="sort_order" value="<?= (int)($edit['sort_order'] ?? 0) ?>"></div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div><label>মেটা টাইটেল (SEO)</label><input type="text" name="meta_title" value="<?= e($edit['meta_title'] ?? '') ?>"></div>
      <div><label>মেটা ডেসক্রিপশন</label><input type="text" name="meta_desc" value="<?= e($edit['meta_desc'] ?? '') ?>"></div>
    </div>
    <div style="margin-top:14px">
      <label style="display:flex;gap:8px;align-items:center;font-weight:500;margin:0">
        <input type="checkbox" class="chk" name="is_active" value="1" <?= (!$edit || $edit['is_active']) ? 'checked' : '' ?>> সক্রিয়</label>
    </div>
    <div class="save-bar">
      <button class="btn" type="submit"><i class="fa fa-floppy-disk"></i> সংরক্ষণ</button>
      <?php if ($edit): ?><a class="btn sec" href="<?= e(au('categories')) ?>">বাতিল</a><?php endif; ?>
    </div>
  </form>
</div>

<div class="a-card">
  <h2><i class="fa fa-folder-tree"></i>সব ক্যাটাগরি</h2>
  <div class="tbl-wrap"><table>
    <tr><th style="width:44px">আইকন</th><th>নাম</th><th>URL</th><th style="width:80px">পোস্ট</th><th style="width:80px">ক্রম</th><th style="width:90px">অবস্থা</th><th style="width:110px">কাজ</th></tr>
    <?php foreach ($rows as $r): ?>
      <tr>
        <td style="text-align:center"><i class="fa <?= e($r['icon']) ?>" style="color:var(--brand)"></i></td>
        <td><b><?= e($r['name']) ?></b></td>
        <td><code style="font-size:.82rem;color:var(--muted)">/category/<?= e($r['slug']) ?></code></td>
        <td><?= bn($r['n']) ?></td>
        <td><?= bn($r['sort_order']) ?></td>
        <td><span class="pill <?= $r['is_active'] ? 'on' : 'off' ?>"><?= $r['is_active'] ? 'সক্রিয়' : 'বন্ধ' ?></span></td>
        <td>
          <div class="row-act">
            <a class="btn sm" href="<?= e(au('categories?id=' . $r['id'])) ?>"><i class="fa fa-pen"></i></a>
            <form method="post" style="display:inline">
              <?= csrf_field() ?>
              <input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>">
              <button class="btn sm dan" data-confirm="মুছে ফেলবেন?"><i class="fa fa-trash"></i></button>
            </form>
          </div>
        </td>
      </tr>
    <?php endforeach; ?>
  </table></div>
</div>
<?php admin_end(); ?>
