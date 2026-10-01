<?php
/* ================= পোস্ট সমূহ (লিস্ট) ================= */
admin_start('পোস্ট সমূহ');
need('posts');

/* ---- অ্যাকশন ---- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();
    /* ---- ভাঙা বাংলা লিংক (স্লাগ) ঠিক করা ---- */
    if (($_POST['do'] ?? '') === 'fixslug') {
        $fixed = 0;
        foreach (all("SELECT id, title, slug FROM posts") as $r) {
            $good = slugify($r['title']);
            if ($good === $r['slug'] || $good === '') continue;
            /* শুধু সেগুলোই বদলাই যেগুলোর কার/মাত্রা হারিয়ে গেছে */
            $stripped = preg_replace('/\p{M}+/u', '', $good);
            if ($stripped !== $r['slug']) continue;
            $newSlug = unique_slug($r['title'], 'posts', (int)$r['id']);
            q("INSERT IGNORE INTO slug_redirects (old_slug, post_id, created_at) VALUES (?,?,NOW())", [$r['slug'], (int)$r['id']]);
            q("UPDATE posts SET slug = ? WHERE id = ?", [$newSlug, (int)$r['id']]);
            $fixed++;
        }
        flash('ok', $fixed ? bn($fixed) . ' টি পোস্টের লিংক ঠিক করা হয়েছে। পুরনো লিংকগুলো অটো নতুন লিংকে যাবে।' : 'ভাঙা লিংক পাওয়া যায়নি — সবগুলো ঠিক আছে।');
        admin_go(au('posts'));
    }

    $ids = array_map('intval', (array)($_POST['ids'] ?? []));
    $act = (string)($_POST['bulk'] ?? '');
    if (strpos($act, ':') !== false) {          /* এক সারির বাটন */
        [$act, $one] = explode(':', $act, 2);
        $ids = [(int)$one];
    }
    if ($ids && $act) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        if ($act === 'delete') {                       /* রিসাইকেল বিনে পাঠাই */
            q("UPDATE posts SET deleted_at = NOW(), status = 0 WHERE id IN ($in)", $ids);
            flash('ok', bn(count($ids)) . ' টি পোস্ট রিসাইকেল বিনে গেছে — চাইলে ফিরিয়ে আনতে পারবেন।');
        } elseif ($act === 'restore') {                 /* ফিরিয়ে আনি */
            q("UPDATE posts SET deleted_at = NULL WHERE id IN ($in)", $ids);
            flash('ok', bn(count($ids)) . ' টি পোস্ট ফিরিয়ে আনা হয়েছে (খসড়া অবস্থায়)।');
        } elseif ($act === 'purge') {                   /* একেবারে মুছে ফেলি */
            foreach ($ids as $id) {
                foreach (all("SELECT image FROM post_images WHERE post_id = ?", [$id]) as $im) @unlink(UPLOAD_PATH . '/posts/' . $im['image']);
                $p = one("SELECT thumb, pdf FROM posts WHERE id = ?", [$id]);
                if ($p['thumb'] ?? null) @unlink(UPLOAD_PATH . '/posts/' . $p['thumb']);
                if ($p['pdf'] ?? null)   @unlink(UPLOAD_PATH . '/pdf/' . $p['pdf']);
            }
            q("DELETE FROM post_images WHERE post_id IN ($in)", $ids);
            q("DELETE FROM post_links  WHERE post_id IN ($in)", $ids);
            q("DELETE FROM posts WHERE id IN ($in)", $ids);
            flash('ok', bn(count($ids)) . ' টি পোস্ট স্থায়ীভাবে মুছে ফেলা হয়েছে।');
        } elseif ($act === 'publish' || $act === 'draft') {
            if ($act === 'publish') {
                /* রিভিউ বাকি থাকা পোস্ট প্রকাশ হলে এখনকার সময়ে উঠে আসে (তালিকার উপরে) */
                try {
                    q("UPDATE posts SET published_at = NOW(), review_pending = 0 WHERE review_pending = 1 AND id IN ($in)", $ids);
                } catch (Throwable $e) {}
            }
            q("UPDATE posts SET status = ? WHERE id IN ($in)", array_merge([$act === 'publish' ? 1 : 0], $ids));
            flash('ok', $act === 'publish' ? 'প্রকাশ করা হয়েছে।' : 'অবস্থা বদলানো হয়েছে।');
        }
    }
    admin_go(au('posts?' . http_build_query($_GET)));
}

$fCat = (int)($_GET['cat'] ?? 0);
$fSt  = $_GET['st'] ?? '';
$fQ   = trim((string)($_GET['q'] ?? ''));
$page = max(1, (int)($_GET['page'] ?? 1));
$per  = 25; $off = ($page - 1) * $per;

$trash  = !empty($_GET['trash']);
$review = !empty($_GET['review']);
$w = [$trash ? 'p.deleted_at IS NOT NULL' : 'p.deleted_at IS NULL']; $a = [];
if ($review) $w[] = 'p.review_pending = 1';
$reviewCount = 0;
try { $reviewCount = (int)col("SELECT COUNT(*) FROM posts WHERE review_pending = 1 AND deleted_at IS NULL"); } catch (Throwable $e) {}
$trashCount = 0;
try { $trashCount = (int)col("SELECT COUNT(*) FROM posts WHERE deleted_at IS NOT NULL"); } catch (Throwable $e) {}
if ($fCat) { $w[] = 'p.cat_id = ?'; $a[] = $fCat; }
if ($fSt !== '') { $w[] = 'p.status = ?'; $a[] = (int)$fSt; }
if ($fQ !== '') { $w[] = 'p.title LIKE ?'; $a[] = '%' . $fQ . '%'; }
$ws = implode(' AND ', $w);

/* ভাঙা বাংলা লিংক আছে কিনা গুনি */
$broken = 0;
foreach (all("SELECT title, slug FROM posts") as $r0) {
    $good = slugify($r0['title']);
    if ($good !== '' && $good !== $r0['slug'] && preg_replace('/\p{M}+/u', '', $good) === $r0['slug']) $broken++;
}

$total = (int)col("SELECT COUNT(*) FROM posts p WHERE $ws", $a);
$rows  = all("SELECT p.*, c.name AS cat_name FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
              WHERE $ws ORDER BY p.id DESC LIMIT $per OFFSET $off", $a);
$pages = max(1, (int)ceil($total / $per));
show_flash();
?>
<div class="a-card">
  <form method="get" class="grid g4" style="align-items:end">
    <div>
      <label>খুঁজুন</label>
      <input type="text" name="q" value="<?= e($fQ) ?>" placeholder="শিরোনাম দিয়ে খুঁজুন">
    </div>
    <div>
      <label>ক্যাটাগরি</label>
      <select name="cat">
        <option value="0">সব</option>
        <?php foreach (categories() as $c): ?>
          <option value="<?= (int)$c['id'] ?>" <?= $fCat === (int)$c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option>
        <?php endforeach; ?>
      </select>
    </div>
    <div>
      <label>অবস্থা</label>
      <select name="st">
        <option value="">সব</option>
        <option value="1" <?= $fSt === '1' ? 'selected' : '' ?>>প্রকাশিত</option>
        <option value="0" <?= $fSt === '0' ? 'selected' : '' ?>>খসড়া</option>
      </select>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" type="submit"><i class="fa fa-filter"></i> ফিল্টার</button>
      <a class="btn sec" href="<?= e(au('post')) ?>"><i class="fa fa-plus"></i> নতুন</a>
    </div>
  </form>
</div>

<?php if ($broken): ?>
<div class="a-card" style="border-color:#f0d3a8;background:#fffaf2">
  <h2 style="color:#9a5b09"><i class="fa fa-link-slash" style="color:#b45309"></i>ভাঙা বাংলা লিংক পাওয়া গেছে</h2>
  <p style="margin:0 0 12px;font-size:.9rem;color:#6b5636">
    <b><?= bn($broken) ?> টি</b> পোস্টের লিংকে বাংলা কার/মাত্রা বাদ পড়ে গেছে
    (যেমন <code>মডকল-কলজ</code>)। বাটনে চাপলে সেগুলো ঠিক হয়ে <code>মেডিকেল-কলেজ</code> এর মত হবে এবং
    পুরনো লিংকে কেউ ঢুকলে অটো নতুন লিংকে চলে যাবে — সার্চ র‍্যাংকিং নষ্ট হবে না।
  </p>
  <form method="post" style="display:inline">
    <?= csrf_field() ?>
    <input type="hidden" name="do" value="fixslug">
    <button class="btn" data-confirm="সব ভাঙা লিংক ঠিক করে দেব?"><i class="fa fa-wand-magic-sparkles"></i> লিংকগুলো ঠিক করুন</button>
  </form>
</div>
<?php endif; ?>

<form method="post">
  <?= csrf_field() ?>
  <div class="a-card">
    <h2><i class="fa <?= $trash ? 'fa-trash-can-arrow-up' : 'fa-newspaper' ?>"></i><?= $trash ? 'রিসাইকেল বিন — ' : ($review ? 'রিভিউর অপেক্ষায় — ' : '') ?>মোট <?= bn($total) ?> টি · পৃষ্ঠা <?= bn($page) ?>/<?= bn($pages) ?></h2>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
      <label class="pill mut" style="display:flex;align-items:center;gap:7px;cursor:pointer;padding:6px 12px">
        <input type="checkbox" id="checkAll" class="chk"> সব নির্বাচন</label>
      <?php if ($trash): ?>
        <button class="btn sm" name="bulk" value="restore"><i class="fa fa-rotate-left"></i> ফিরিয়ে আনুন</button>
        <button class="btn sm dan" name="bulk" value="purge" data-confirm="নির্বাচিত পোস্টগুলো একেবারে মুছে ফেলবেন? এটি আর ফেরানো যাবে না।"><i class="fa fa-trash"></i> স্থায়ীভাবে মুছুন</button>
        <a class="btn sm sec" href="<?= e(au('posts')) ?>"><i class="fa fa-arrow-right"></i> সব পোস্টে ফিরুন</a>
      <?php else: ?>
        <button class="btn sm" name="bulk" value="publish"><i class="fa fa-eye"></i> প্রকাশ করুন</button>
        <button class="btn sm sec" name="bulk" value="draft"><i class="fa fa-eye-slash"></i> খসড়া করুন</button>
        <button class="btn sm dan" name="bulk" value="delete" data-confirm="নির্বাচিত পোস্টগুলো রিসাইকেল বিনে পাঠাবেন?"><i class="fa fa-trash"></i> মুছে ফেলুন</button>
        <?php if ($trashCount): ?>
          <a class="btn sm sec" href="<?= e(au('posts?trash=1')) ?>"><i class="fa fa-trash-can-arrow-up"></i> রিসাইকেল বিন (<?= bn($trashCount) ?>)</a>
        <?php endif; ?>
        <?php if ($review): ?>
          <a class="btn sm sec" href="<?= e(au('posts')) ?>"><i class="fa fa-arrow-right"></i> সব পোস্ট</a>
        <?php elseif ($reviewCount): ?>
          <a class="btn sm" style="background:#3f4fb8" href="<?= e(au('posts?review=1')) ?>"><i class="fa fa-robot"></i> রিভিউ বাকি (<?= bn($reviewCount) ?>)</a>
        <?php endif; ?>
      <?php endif; ?>
    </div>

    <div class="a-list">
      <?php foreach ($rows as $r): $d = deadline_info($r['deadline']); ?>
        <div class="a-row">
          <input type="checkbox" class="chk chk-item" name="ids[]" value="<?= (int)$r['id'] ?>">
          <img class="rw-th" src="<?= e(img_url($r['thumb'])) ?>" alt="" loading="lazy">
          <div class="rw-tx">
            <b><?= e($r['title']) ?></b>
            <small>
              <?= e($r['cat_name'] ?: '—') ?> · <?= e(time_ago($r['published_at'])) ?> · <?= bn($r['views']) ?> ভিউ
              <?= $r['deadline'] ? ' · শেষ ' . e(bn(date('d/m/y', strtotime($r['deadline'])))) : '' ?>
            </small>
          </div>
          <?php if (!empty($r['review_pending'])): ?>
            <span class="pill auto" style="flex:none"><i class="fa fa-robot" style="margin-left:0;margin-right:4px"></i>রিভিউ বাকি</span>
          <?php else: ?>
            <span class="pill <?= $r['status'] ? 'on' : 'off' ?>" style="flex:none"><?= $r['status'] ? 'প্রকাশিত' : 'খসড়া' ?></span>
          <?php endif; ?>
          <div class="rw-act">
            <?php if ($trash): ?>
              <button class="ibtn ok" name="bulk" value="restore:<?= (int)$r['id'] ?>" title="ফিরিয়ে আনুন"><i class="fa fa-rotate-left"></i></button>
              <button class="ibtn dan" name="bulk" value="purge:<?= (int)$r['id'] ?>" data-confirm="একেবারে মুছে ফেলবেন? আর ফেরানো যাবে না।" title="স্থায়ীভাবে মুছুন"><i class="fa fa-trash"></i></button>
            <?php else: ?>
              <a class="ibtn" href="<?= e(url('post/' . $r['slug'])) ?>" target="_blank" data-no-spa title="সাইটে দেখুন"><i class="fa fa-eye"></i></a>
              <a class="ibtn" href="<?= e(au('post?id=' . $r['id'])) ?>" title="সম্পাদনা"><i class="fa fa-pen"></i></a>
              <button class="ibtn dan" name="bulk" value="delete:<?= (int)$r['id'] ?>" data-confirm="পোস্টটি রিসাইকেল বিনে পাঠাবেন?" title="মুছুন"><i class="fa fa-trash"></i></button>
            <?php endif; ?>
          </div>
        </div>
      <?php endforeach; ?>
      <?php if (!$rows): ?>
        <p style="text-align:center;color:var(--muted);padding:28px">কিছু পাওয়া যায়নি।</p>
      <?php endif; ?>
    </div>

    <?php if ($pages > 1): ?>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px;justify-content:center">
        <?php $qs = $_GET; for ($i = 1; $i <= $pages; $i++): $qs['page'] = $i; ?>
          <a class="btn sm <?= $i === $page ? '' : 'sec' ?>" href="<?= e(au('posts?' . http_build_query($qs))) ?>"><?= bn($i) ?></a>
        <?php endfor; ?>
      </div>
    <?php endif; ?>
  </div>
</form>
<?php admin_end(); ?>
