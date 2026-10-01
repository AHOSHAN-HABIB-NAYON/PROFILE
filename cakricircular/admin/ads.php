<?php
/* ================= বিজ্ঞাপন (প্রিমিয়াম পোস্ট) ================= */
admin_start('বিজ্ঞাপন');
need('posts');

/* ---- একক অ্যাকশন ---- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();
    $act = (string)($_POST['act'] ?? '');
    $id  = (int)($_POST['id'] ?? 0);

    if ($act === 'stop' && $id) {
        q("UPDATE posts SET is_premium = 0 WHERE id = ?", [$id]);
        flash('ok', 'বিজ্ঞাপন বন্ধ করা হয়েছে — পোস্টটি সাধারণ হিসেবে থাকবে।');
    } elseif ($act === 'extend' && $id) {
        $days = max(1, min(365, (int)($_POST['days'] ?? 7)));
        $cur  = col("SELECT premium_until FROM posts WHERE id = ?", [$id]);
        $base = ($cur && $cur >= date('Y-m-d')) ? $cur : date('Y-m-d');
        q("UPDATE posts SET is_premium = 1, premium_until = DATE_ADD(?, INTERVAL ? DAY) WHERE id = ?",
          [$base, $days, $id]);
        flash('ok', bn($days) . ' দিন বাড়ানো হয়েছে।');
    } elseif ($act === 'restart' && $id) {
        q("UPDATE posts SET is_premium = 1, premium_until = DATE_ADD(CURDATE(), INTERVAL 7 DAY) WHERE id = ?", [$id]);
        flash('ok', 'আবার চালু করা হয়েছে (৭ দিনের জন্য)।');
    }
    bump_ver();
    admin_go(au('ads'));
}

/* ---- হিসাব ---- */
$act7 = "is_premium = 1 AND (premium_until IS NULL OR premium_until >= CURDATE())";
$running = (int)col("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND $act7");
$soon    = (int)col("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND is_premium = 1
                     AND premium_until IS NOT NULL AND premium_until BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)");
$expired = (int)col("SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND is_premium = 1
                     AND premium_until IS NOT NULL AND premium_until < CURDATE()");
$totalViews = (int)col("SELECT COALESCE(SUM(views),0) FROM posts WHERE deleted_at IS NULL AND is_premium = 1");

$rows = all("SELECT p.*, c.name AS cat_name,
              (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id
               AND v.day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS v7
             FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
             WHERE p.deleted_at IS NULL AND p.is_premium = 1
             ORDER BY (p.premium_until IS NULL OR p.premium_until >= CURDATE()) DESC,
                      p.premium_until ASC, p.published_at DESC");

show_flash();
?>

<?php if ($soon || $expired): ?>
  <div class="msg" style="background:#fff7e8;color:#8a5a08;border:1px solid #f0dcb6">
    <i class="fa fa-bell" style="margin-left:0;margin-right:7px"></i>
    <?php if ($soon): ?><b><?= bn($soon) ?> টি</b> বিজ্ঞাপনের মেয়াদ ৩ দিনের মধ্যে শেষ হচ্ছে। <?php endif; ?>
    <?php if ($expired): ?><b><?= bn($expired) ?> টি</b> এর মেয়াদ শেষ হয়ে গেছে — চাইলে বাড়িয়ে নিন।<?php endif; ?>
  </div>
<?php endif; ?>

<div class="grid g4 stats" style="margin-bottom:14px">
  <div class="stat"><span class="si y"><i class="fa fa-crown"></i></span>
    <span class="sx"><span class="sl">চলমান বিজ্ঞাপন</span><b><?= bn($running) ?></b><span>এখন সাইটে দেখাচ্ছে</span></span></div>
  <div class="stat"><span class="si r"><i class="fa fa-hourglass-end"></i></span>
    <span class="sx"><span class="sl">শেষ হচ্ছে</span><b><?= bn($soon) ?></b><span>৩ দিনের মধ্যে</span></span></div>
  <div class="stat"><span class="si"><i class="fa fa-circle-xmark"></i></span>
    <span class="sx"><span class="sl">মেয়াদ শেষ</span><b><?= bn($expired) ?></b><span>বাড়ানো যাবে</span></span></div>
  <div class="stat"><span class="si p"><i class="fa fa-eye"></i></span>
    <span class="sx"><span class="sl">মোট ভিউ</span><b><?= bn($totalViews) ?></b><span>সব বিজ্ঞাপন মিলিয়ে</span></span></div>
</div>

<div class="a-card">
  <h2><i class="fa fa-bullhorn"></i>সব বিজ্ঞাপন (<?= bn(count($rows)) ?>)</h2>

  <?php if (!$rows): ?>
    <p style="text-align:center;color:var(--muted);padding:26px">
      এখনো কোনো প্রিমিয়াম পোস্ট নেই। পোস্ট এডিটরে “👑 প্রিমিয়াম পোস্ট” চালু করলেই এখানে দেখাবে।
    </p>
  <?php else: ?>
    <div class="a-list">
      <?php foreach ($rows as $r):
        $left = $r['premium_until'] ? (int)floor((strtotime($r['premium_until']) - strtotime(date('Y-m-d'))) / 86400) : null;
        $live = ($left === null || $left >= 0);
      ?>
        <div class="a-row<?= $live ? ' prem-live' : '' ?>">
          <img class="rw-th" src="<?= e(img_url($r['thumb'])) ?>" alt="" loading="lazy">
          <div class="rw-tx">
            <b><?= e($r['title']) ?></b>
            <small>
              <?= e($r['cat_name'] ?: '—') ?> ·
              <?= bn($r['views']) ?> ভিউ (৭ দিনে <?= bn($r['v7']) ?>) ·
              <?= $r['premium_until'] ? 'শেষ ' . e(bn(date('d/m/y', strtotime($r['premium_until'])))) : 'মেয়াদ নেই' ?>
            </small>
          </div>
          <span class="pill <?= $live ? 'on' : 'off' ?>" style="flex:none">
            <?= $left === null ? 'চলছে' : ($left >= 0 ? 'আর ' . bn($left) . ' দিন' : 'শেষ') ?>
          </span>
          <div class="rw-act">
            <a class="ibtn" href="<?= e(url('post/' . $r['slug'])) ?>" target="_blank" data-no-spa title="সাইটে দেখুন"><i class="fa fa-eye"></i></a>
            <a class="ibtn" href="<?= e(au('post?id=' . $r['id'])) ?>" title="সম্পাদনা"><i class="fa fa-pen"></i></a>
            <?php if ($live): ?>
              <button class="ibtn" name="act" value="extend" form="f<?= (int)$r['id'] ?>" title="৭ দিন বাড়ান"><i class="fa fa-plus"></i></button>
              <button class="ibtn dan" name="act" value="stop" form="f<?= (int)$r['id'] ?>" data-confirm="বিজ্ঞাপনটি বন্ধ করবেন? পোস্ট থেকে যাবে, শুধু প্রিমিয়াম চিহ্ন উঠে যাবে।" title="বন্ধ করুন"><i class="fa fa-power-off"></i></button>
            <?php else: ?>
              <button class="ibtn ok" name="act" value="restart" form="f<?= (int)$r['id'] ?>" title="আবার চালু (৭ দিন)"><i class="fa fa-rotate-left"></i></button>
            <?php endif; ?>
          </div>

          <form method="post" id="f<?= (int)$r['id'] ?>" style="display:none">
            <?= csrf_field() ?>
            <input type="hidden" name="id" value="<?= (int)$r['id'] ?>">
            <input type="hidden" name="days" value="7">
          </form>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>

  <p class="hint" style="margin-top:12px">
    <i class="fa fa-circle-info" style="margin-left:0;margin-right:6px;color:var(--brand)"></i>
    ভিউয়ের হিসাব অ্যানালিটিক্সের আসল গণনা থেকে নেওয়া (বট ও প্রিফেচ বাদ দিয়ে)।
    মেয়াদ শেষ হলে পোস্ট মুছে যায় না — শুধু সোনালি চিহ্ন ও উপরে পিন থাকা বন্ধ হয়।
  </p>
</div>

<?php admin_end(); ?>
