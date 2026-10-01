<?php
/* ================= ট্রেন্ডিং ================= */
require_once APP_ROOT . '/partials/post_card.php';

$page = max(1, (int)($params['page'] ?? 1));
$per  = per_page();
$off  = ($page - 1) * $per;

/* গত ৭ দিনের ইউনিক ভিউ অনুযায়ী (পাবলিক সংখ্যা দেখবে না) */
$total = (int)col("SELECT COUNT(*) FROM posts WHERE status = 1 AND deleted_at IS NULL");
$rows  = all("SELECT p.*, c.name AS cat_name, c.slug AS cat_slug,
                     COALESCE(v.hot, 0) AS hot
              FROM posts p
              LEFT JOIN categories c ON c.id = p.cat_id
              LEFT JOIN (
                 SELECT post_id, COUNT(*) AS hot FROM post_views
                 WHERE day >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY post_id
              ) v ON v.post_id = p.id
              WHERE p.status = 1 AND p.deleted_at IS NULL
              ORDER BY hot DESC, p.views DESC, p.published_at DESC
              LIMIT $per OFFSET $off");
$pages = max(1, (int)ceil($total / $per));
$remaining = max(0, $total - ($page * $per));

css_once('trending', <<<CSS
.hero.hot{background:linear-gradient(135deg,#b45309,#dd8a22 55%,#eda43b);box-shadow:0 12px 30px rgba(180,83,9,.24)}
.sec-ic.hot{background:linear-gradient(135deg,#b45309,#e5a13a);box-shadow:0 6px 16px rgba(180,83,9,.28)}

/* আগুনের মত জ্বলতে থাকা আইকন */
.fire-ic{position:relative;overflow:visible}
.fire-ic i{position:relative;z-index:2;display:inline-block;transform-origin:50% 90%;
  animation:flame 1.5s ease-in-out infinite;
  text-shadow:0 0 10px rgba(255,214,120,.9), 0 0 20px rgba(255,150,40,.65)}
.fire-ic::before{content:"";position:absolute;left:50%;top:52%;width:46px;height:46px;margin:-23px 0 0 -23px;
  border-radius:50%;z-index:1;
  background:radial-gradient(circle,rgba(255,196,84,.55) 0%,rgba(255,138,30,.28) 45%,transparent 70%);
  animation:glow 1.5s ease-in-out infinite}
@keyframes flame{
  0%,100%{transform:scale(1) rotate(-1.5deg)}
  25%{transform:scale(1.1,.94) rotate(2deg)}
  50%{transform:scale(.96,1.12) rotate(-2deg)}
  75%{transform:scale(1.06,.98) rotate(1deg)}
}
@keyframes glow{
  0%,100%{opacity:.55;transform:scale(.9)}
  40%{opacity:1;transform:scale(1.18)}
  70%{opacity:.7;transform:scale(1)}
}
.bn a[data-key="trending"].active .bn-ic i{animation:flame 1.5s ease-in-out infinite;transform-origin:50% 90%}
@media (prefers-reduced-motion: reduce){ .fire-ic i,.fire-ic::before{animation:none} }
CSS);

$P = [
  'title' => 'ট্রেন্ডিং — এখন সবচেয়ে বেশি দেখা হচ্ছে | ' . setting('site_name', 'চাকরি সার্কুলার'),
  'desc'  => 'গত সাত দিনে সবচেয়ে বেশি পড়া চাকরি, ভর্তি ও রেজাল্টের বিজ্ঞপ্তি।',
  'canonical' => url('trending' . ($page > 1 ? '/page/' . $page : '')),
  'nav' => 'trending',
];
?>
<div class="hero hot">
  <div class="hero-in">
    <span class="hero-ic fire-ic"><i class="fa fa-fire"></i></span>
    <div>
      <h1>ট্রেন্ডিং</h1>
      <p>গত সাত দিনে সবচেয়ে বেশি পড়া বিজ্ঞপ্তিগুলো</p>
    </div>
  </div>
  <div class="hero-chips">
    <span><i class="fa fa-calendar-week"></i> গত ৭ দিন</span>
    <span><i class="fa fa-arrow-trend-up"></i> জনপ্রিয়তা অনুযায়ী সাজানো</span>
  </div>
</div>

<?php if (!$rows): ?>
  <div class="card empty"><i class="fa fa-fire"></i>এখনো ট্রেন্ডিং কিছু নেই।</div>
<?php else: ?>
  <div class="sec-title">
    <div class="sec-l">
      <span class="sec-ic hot"><i class="fa fa-ranking-star"></i></span>
      <h2>সবচেয়ে আলোচিত<small>সবচেয়ে বেশি পড়া হচ্ছে</small></h2>
    </div>
    <?= list_count_btn($total, url('search') . '?sort=popular') ?>
  </div>
  <div class="plist" id="postList"><?php foreach ($rows as $r) post_card($r); ?></div>
  <?= pager($page, $pages, fn($i) => url('trending' . ($i > 1 ? '/page/' . $i : ''))) ?>
<?php endif; ?>
