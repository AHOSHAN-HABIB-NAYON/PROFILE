<?php
/** Product / release posts listing. */
View::$meta['title'] = 'প্রোডাক্ট ও আপডেট';
View::$meta['description'] = setting('site_name') . '-এর নতুন প্রোডাক্ট, সার্ভিস ও আপডেট রিলিজ।';
$cat = (string) ($_GET['c'] ?? '');
$cats = db()->col("SELECT DISTINCT category FROM products WHERE status = 'published' AND category IS NOT NULL AND category <> '' ORDER BY category");
$args = [];
$where = "status = 'published'";
if ($cat !== '' && in_array($cat, $cats, true)) {
    $where .= ' AND category = ?';
    $args[] = $cat;
}
$rows = db()->all("SELECT * FROM products WHERE $where ORDER BY is_featured DESC, published_at DESC LIMIT 60", $args);
$posts = db()->all("SELECT * FROM product_posts WHERE status = 'published' ORDER BY is_pinned DESC, created_at DESC LIMIT 5");
?>
<?php if (!$user): ?><div class="container public-page"><div class="section-head"><span class="eyebrow">রিলিজ</span><h1 style="font-size:28px">প্রোডাক্ট ও আপডেট</h1><p>নতুন সার্ভিস, ফিচার ও ঘোষণা।</p></div><?php endif; ?>
<?php if ($cats): ?>
<div class="chips" style="margin-bottom:14px">
  <a href="<?= e(url('/products')) ?>" class="chip <?= $cat === '' ? 'active' : '' ?>" data-link>সব</a>
  <?php foreach ($cats as $c): ?><a href="<?= e(url('/products?c=' . rawurlencode($c))) ?>" class="chip <?= $cat === $c ? 'active' : '' ?>" data-link><?= e($c) ?></a><?php endforeach; ?>
</div>
<?php endif; ?>
<?php if ($posts && $cat === ''): ?>
  <div class="stack" style="margin-bottom:16px">
  <?php foreach ($posts as $p): ?>
    <div class="announce"><span class="ic-box"><?= icon('megaphone') ?></span><span class="grow"><b><?= e($p['title']) ?></b><p><?= e($p['body']) ?></p><small class="muted"><?= e(bn_date($p['created_at'], false)) ?></small></span></div>
  <?php endforeach; ?>
  </div>
<?php endif; ?>
<?php if ($rows): ?>
  <div class="product-grid <?= $user ? '' : 'three' ?>"><?php foreach ($rows as $p) echo product_card($p); ?></div>
<?php else: ?>
  <div class="card"><?= empty_state('package', 'এখনো কোনো প্রোডাক্ট প্রকাশিত হয়নি') ?></div>
<?php endif; ?>
<?php if (!$user): ?></div><?php endif; ?>
