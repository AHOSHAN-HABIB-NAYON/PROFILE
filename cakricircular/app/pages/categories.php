<?php
/* ================= ক্যাটাগরি সমূহ ================= */
$cats = categories();
$counts = [];
try {
    foreach (all("SELECT cat_id, COUNT(*) n FROM posts WHERE status = 1 AND deleted_at IS NULL GROUP BY cat_id") as $r)
        $counts[(int)$r['cat_id']] = (int)$r['n'];
} catch (Throwable $e) {}
$promoN = 0;
try {
    $promoN = (int)col("SELECT COUNT(*) FROM posts WHERE status = 1 AND deleted_at IS NULL
                        AND is_premium = 1 AND (premium_until IS NULL OR premium_until >= CURDATE())");
} catch (Throwable $e) {}

css_once('categories', <<<CSS
.ct-list{display:grid;gap:10px}
.ct{display:flex;align-items:center;gap:14px;padding:13px 14px;background:var(--card);border:1px solid var(--line-2);
  border-radius:20px;box-shadow:var(--sh);transition:transform .18s,border-color .18s}
.ct:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--t1) 40%,var(--line))}
.ct:active{transform:scale(.99)}
.ct .tile-ic{width:52px;height:52px;font-size:1.2rem}
.ct-tx{flex:1;min-width:0}
.ct-tx b{display:block;font-size:1rem;font-weight:700;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-tx small{display:block;font-size:.78rem;color:var(--muted);font-weight:600}
.ct .go{width:32px;height:32px;flex:none;border-radius:50%;display:grid;place-items:center;background:var(--tl);color:var(--t2);font-size:.78rem}
html[data-theme="dark"] .ct .go{color:var(--t1)}
.ct.gold{--t1:#e3a82c;--t2:#b7791f;--tl:#fdf3df}
@media(min-width:701px){ .ct-list{grid-template-columns:repeat(2,minmax(0,1fr))} }
@media(min-width:1100px){ .ct-list{grid-template-columns:repeat(3,minmax(0,1fr))} }
CSS);

$P = [
  'title' => 'ক্যাটাগরি সমূহ | ' . setting('site_name', 'চাকরি সার্কুলার'),
  'desc'  => 'সরকারি চাকরি, বেসরকারি চাকরি, ভর্তি, রেজাল্ট, নোটিশ ও স্কলারশিপ — আপনার পছন্দের ক্যাটাগরি বেছে নিন।',
  'canonical' => url('categories'),
  'nav' => 'categories',
];
?>
<div class="hero">
  <div class="hero-in">
    <span class="hero-ic"><i class="fa fa-table-cells-large"></i></span>
    <div>
      <h1>ক্যাটাগরি সমূহ</h1>
      <p>আপনার পছন্দের ক্যাটাগরি বেছে নিন</p>
    </div>
  </div>
  <div class="hero-chips">
    <span><i class="fa fa-folder-tree"></i> মোট <?= bn(count($cats)) ?>টি ক্যাটাগরি</span>
    <span><i class="fa fa-layer-group"></i> <?= bn(array_sum($counts)) ?>টি পোস্ট</span>
  </div>
</div>

<?php if (!$cats): ?>
  <div class="card empty"><i class="fa fa-folder-open"></i>এখনো কোনো ক্যাটাগরি যোগ করা হয়নি।</div>
<?php else: ?>
  <div class="ct-list">
    <?php foreach ($cats as $i => $c): ?>
      <a class="ct tone-<?= ($i % 6) + 1 ?>" href="<?= e(cat_url($c['slug'])) ?>">
        <span class="tile-ic"><i class="fa <?= e($c['icon'] ?: 'fa-folder') ?>"></i></span>
        <span class="ct-tx">
          <b><?= e($c['name']) ?></b>
          <small><?= bn($counts[(int)$c['id']] ?? 0) ?>টি পোস্ট</small>
        </span>
        <span class="go"><i class="fa fa-chevron-right"></i></span>
      </a>
    <?php endforeach; ?>
    <?php if ($promoN): ?>
      <a class="ct gold" href="<?= e(url('promoted')) ?>">
        <span class="tile-ic"><i class="fa fa-crown"></i></span>
        <span class="ct-tx"><b>বিজ্ঞাপন</b><small><?= bn($promoN) ?>টি চলমান</small></span>
        <span class="go"><i class="fa fa-chevron-right"></i></span>
      </a>
    <?php endif; ?>
  </div>
<?php endif; ?>
