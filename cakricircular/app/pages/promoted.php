<?php
/* ================= বিজ্ঞাপন (প্রিমিয়াম পোস্ট) ================= */
require_once APP_ROOT . '/partials/post_card.php';

$page = max(1, (int)($params['page'] ?? 1));
$per  = per_page();
$off  = ($page - 1) * $per;

$where = "p.status = 1 AND p.deleted_at IS NULL AND p.is_premium = 1
          AND (p.premium_until IS NULL OR p.premium_until >= CURDATE())";

$total = (int)col("SELECT COUNT(*) FROM posts p WHERE $where");
$rows  = all("SELECT p.*, c.name AS cat_name, c.slug AS cat_slug
              FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
              WHERE $where
              ORDER BY p.published_at DESC, p.id DESC
              LIMIT $per OFFSET $off");
$pages = max(1, (int)ceil($total / $per));

/* সীমার বাইরের পৃষ্ঠা (যেমন /page/9999) — খালি পাতা না দিয়ে ৪০৪ */
if ($page > $pages) { require APP_ROOT . '/app/pages/404.php'; return; }

/* আজ যোগ হয়েছে কতটি */
$todayN = (int)col("SELECT COUNT(*) FROM posts p WHERE $where AND DATE(p.published_at) = CURDATE()");

css_once('promoted', <<<CSS
.hero.gold{background:linear-gradient(135deg,#a86a08,#d29a22 55%,#e8b84d);
  box-shadow:0 12px 30px rgba(168,106,8,.24)}
.sec-ic.gold{background:linear-gradient(135deg,#a86a08,#e0a83a);box-shadow:0 6px 16px rgba(168,106,8,.3)}
.crown-ic{font-size:1.25rem;line-height:1}
.promo-note{display:flex;align-items:flex-start;gap:10px;background:#fffdf6;border:1px solid #f0e2c4;
  border-radius:15px;padding:12px 14px;margin-bottom:14px;font-size:.85rem;color:var(--ink-2);line-height:1.7}
.promo-note .ic{width:30px;height:30px;flex:none;border-radius:50%;display:grid;place-items:center;
  background:linear-gradient(135deg,#c98410,#e6b445);color:#fff;font-size:.8rem}
CSS);

$P = [
  'title' => 'বিজ্ঞাপন ও প্রিমিয়াম পোস্ট | ' . setting('site_name', 'চাকরি সার্কুলার'),
  'desc'  => 'প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি, ভর্তি ও প্রশিক্ষণের প্রচারমূলক পোস্ট — এক জায়গায়।',
  'canonical' => url('promoted' . ($page > 1 ? '/page/' . $page : '')),
  'nav'   => 'promoted',
];
?>
<div class="hero gold">
  <div class="hero-in">
    <span class="hero-ic"><span class="crown-ic">👑</span></span>
    <div>
      <h1>বিজ্ঞাপন</h1>
      <p>প্রতিষ্ঠানের প্রচারমূলক ও স্পনসর করা পোস্ট</p>
    </div>
  </div>
  <div class="hero-chips">
    <span><i class="fa fa-bullhorn"></i> চলমান <?= bn($total) ?> টি</span>
    <?php if ($todayN): ?><span><i class="fa fa-bolt"></i> আজ <?= bn($todayN) ?> টি নতুন</span><?php endif; ?>
  </div>
</div>

<?php if (!$rows): ?>
  <div class="card empty"><i class="fa fa-bullhorn"></i>এই মুহূর্তে কোনো বিজ্ঞাপন চলছে না।</div>
<?php else: ?>
  <div class="promo-note">
    <span class="ic">👑</span>
    <span>এই পোস্টগুলো প্রতিষ্ঠানের অনুরোধে প্রচারিত। তথ্য যাচাই করে নিজ দায়িত্বে আবেদন বা যোগাযোগ করুন।</span>
  </div>

  <div class="sec-title">
    <div class="sec-l">
      <span class="sec-ic gold"><i class="fa fa-star"></i></span>
      <h2>চলমান বিজ্ঞাপন<small>নতুন আগে দেখানো হচ্ছে</small></h2>
    </div>
    <?= list_count_btn($total, url('promoted')) ?>
  </div>

  <div class="plist" id="postList">
    <?php foreach ($rows as $r) post_card($r); ?>
  </div>
  <?= pager($page, $pages, fn($i) => url('promoted' . ($i > 1 ? '/page/' . $i : ''))) ?>
<?php endif; ?>
