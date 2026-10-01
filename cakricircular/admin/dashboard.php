<?php
/* ================= ড্যাশবোর্ড ================= */
admin_start('ড্যাশবোর্ড');
show_flash();

/* AI দিয়ে তৈরি, রিভিউর অপেক্ষায় থাকা পোস্ট */
$__rev = 0;
try { $__rev = (int)col("SELECT COUNT(*) FROM posts WHERE review_pending = 1 AND deleted_at IS NULL"); } catch (Throwable $e) {}
if ($__rev): ?>
  <a class="msg" href="<?= e(au('posts?review=1')) ?>" style="display:flex;align-items:center;gap:9px;background:#eef2ff;color:#3f4fb8;border:1px solid #d9defa;font-weight:600">
    <i class="fa fa-robot"></i><span style="flex:1"><?= bn($__rev) ?>টি নতুন পোস্ট রিভিউর অপেক্ষায় — দেখে প্রকাশ করুন</span><i class="fa fa-angle-left"></i>
  </a>
<?php endif;

$totalPosts = (int)col("SELECT COUNT(*) FROM posts");
$live       = (int)col("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 1");
$todayV     = (int)col("SELECT COUNT(*) FROM visitors WHERE DATE(last_seen) = CURDATE()");
$allV       = (int)col("SELECT COUNT(*) FROM visitors");
$pageViews  = (int)col("SELECT COUNT(*) FROM visits");
$newRep     = (int)col("SELECT COUNT(*) FROM reports WHERE status = 0");
$notices    = (int)col("SELECT COUNT(*) FROM notices WHERE is_active = 1");
$openJobs   = (int)col("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 1 AND deadline >= CURDATE()");

$recent = all("SELECT p.id, p.title, p.published_at, p.views, c.name AS cat_name
               FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
               ORDER BY p.id DESC LIMIT 8");
$expiring = all("SELECT id, title, deadline FROM posts
                 WHERE status = 1 AND deadline BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
                 ORDER BY deadline ASC LIMIT 6");
?>
<div class="grid g4 stats" style="margin-bottom:14px">
  <div class="stat"><span class="si g"><i class="fa fa-newspaper"></i></span>
    <span class="sx"><span class="sl">প্রকাশিত পোস্ট</span><b><?= bn($live) ?></b><span>মোট <?= bn($totalPosts) ?> টি</span></span></div>
  <div class="stat"><span class="si y"><i class="fa fa-hourglass-half"></i></span>
    <span class="sx"><span class="sl">আবেদন চলমান</span><b><?= bn($openJobs) ?></b><span>সময় বাকি আছে</span></span></div>
  <div class="stat"><span class="si b"><i class="fa fa-users"></i></span>
    <span class="sx"><span class="sl">ইউনিক ভিজিটর</span><b><?= bn($allV) ?></b><span>আজ <?= bn($todayV) ?> জন</span></span></div>
  <div class="stat"><span class="si p"><i class="fa fa-eye"></i></span>
    <span class="sx"><span class="sl">মোট পেজ ভিউ</span><b><?= bn($pageViews) ?></b><span>সব পেজ মিলিয়ে</span></span></div>
</div>
<div class="grid g4 stats" style="margin-bottom:16px">
  <div class="stat"><span class="si r"><i class="fa fa-flag"></i></span>
    <span class="sx"><span class="sl">নতুন রিপোর্ট</span><b><?= bn($newRep) ?></b><span>যাচাই বাকি</span></span></div>
  <div class="stat"><span class="si o"><i class="fa fa-bullhorn"></i></span>
    <span class="sx"><span class="sl">সক্রিয় নোটিশ</span><b><?= bn($notices) ?></b><span>চালু আছে</span></span></div>
  <div class="stat"><span class="si"><i class="fa fa-folder-tree"></i></span>
    <span class="sx"><span class="sl">ক্যাটাগরি</span><b><?= bn(count(categories())) ?></b><span>মোট বিভাগ</span></span></div>
  <div class="stat"><span class="si g"><i class="fa fa-file-lines"></i></span>
    <span class="sx"><span class="sl">মোট পোস্ট</span><b><?= bn($totalPosts) ?></b><span>ড্রাফটসহ</span></span></div>
</div>

<?php if ($expiring): ?>
<div class="a-card">
  <h2><i class="fa fa-hourglass-half"></i>শেষ হয়ে আসছে (৩ দিনের মধ্যে)</h2>
  <div class="a-list">
    <?php foreach ($expiring as $x): $dd = deadline_info($x['deadline']); ?>
      <a class="a-row sm" href="<?= e(au('post?id=' . $x['id'])) ?>">
        <span class="rw-tx">
          <b><?= e($x['title']) ?></b>
          <small>শেষ তারিখ <?= e(bn(date('d/m/Y', strtotime($x['deadline'])))) ?></small>
        </span>
        <span class="pill <?= $dd['state'] === 'over' ? 'off' : 'on' ?>" style="flex:none"><?= e($dd['text']) ?></span>
      </a>
    <?php endforeach; ?>
  </div>
</div>
<?php endif; ?>

<div class="a-card">
  <h2><i class="fa fa-clock-rotate-left"></i>সর্বশেষ পোস্ট</h2>
  <div class="a-list">
    <?php foreach ($recent as $r): ?>
      <a class="a-row sm" href="<?= e(au('post?id=' . $r['id'])) ?>">
        <span class="rw-tx">
          <b><?= e($r['title']) ?></b>
          <small><?= e($r['cat_name'] ?: '—') ?> · <?= bn($r['views']) ?> ভিউ · <?= e(time_ago($r['published_at'])) ?></small>
        </span>
        <span class="ibtn" style="cursor:pointer"><i class="fa fa-pen"></i></span>
      </a>
    <?php endforeach; ?>
    <?php if (!$recent): ?>
      <p style="text-align:center;color:var(--muted);padding:26px">এখনো কোনো পোস্ট নেই।</p>
    <?php endif; ?>
  </div>
</div>
<?php admin_end(); ?>
