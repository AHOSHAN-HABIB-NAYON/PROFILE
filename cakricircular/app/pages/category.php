<?php
/* ================= ক্যাটাগরি পেজ ================= */
require_once APP_ROOT . '/partials/post_card.php';

$slug = (string)($params['slug'] ?? '');
$cat  = category_by_slug($slug);

if (!$cat) { require APP_ROOT . '/app/pages/404.php'; return; }

$page = max(1, (int)($params['page'] ?? 1));
$per  = per_page();
$off  = ($page - 1) * $per;

$total = (int)col("SELECT COUNT(*) FROM posts WHERE status = 1 AND deleted_at IS NULL AND cat_id = ?", [$cat['id']]);
$rows  = all("SELECT p.*, c.name AS cat_name, c.slug AS cat_slug
              FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
              WHERE p.status = 1 AND p.deleted_at IS NULL AND p.cat_id = ?
              ORDER BY p.published_at DESC, p.id DESC
              LIMIT $per OFFSET $off", [$cat['id']]);
$pages = max(1, (int)ceil($total / $per));

/* সীমার বাইরের পৃষ্ঠা (যেমন /page/9999) — খালি পাতা না দিয়ে ৪০৪ */
if ($page > $pages) { require APP_ROOT . '/app/pages/404.php'; return; }
$remaining = max(0, $total - ($page * $per));

/* এই ক্যাটাগরিতে আজ ও চলমান কতটি */
$todayN = (int)col("SELECT COUNT(*) FROM posts WHERE status = 1 AND deleted_at IS NULL AND cat_id = ? AND DATE(published_at) = CURDATE()", [$cat['id']]);
$openN  = (int)col("SELECT COUNT(*) FROM posts WHERE status = 1 AND deleted_at IS NULL AND cat_id = ? AND (deadline IS NULL OR deadline >= CURDATE())", [$cat['id']]);

$catTitle = $cat['meta_title'] ?: ($cat['name'] . ' — ' . setting('site_name', 'চাকরি সার্কুলার'));
$P = [
  'title'     => $catTitle . ($page > 1 ? ' | পৃষ্ঠা ' . bn($page) : ''),
  'desc'      => $cat['meta_desc'] ?: ($cat['name'] . ' সংক্রান্ত সর্বশেষ বিজ্ঞপ্তি ও খবর — প্রতিদিন হালনাগাদ। মোট ' . bn($total) . ' টি প্রকাশিত।'),
  'canonical' => cat_url($cat['slug'], $page),
  'nav'       => 'category',
  'schema'    => [[
    '@type' => 'BreadcrumbList',
    'itemListElement' => [
      ['@type' => 'ListItem', 'position' => 1, 'name' => 'হোম', 'item' => url()],
      ['@type' => 'ListItem', 'position' => 2, 'name' => $cat['name'], 'item' => cat_url($cat['slug'])],
    ],
  ]],
];
?>
<div class="hero">
  <div class="hero-in">
    <span class="hero-ic"><i class="fa <?= e($cat['icon'] ?: 'fa-folder-open') ?>"></i></span>
    <div>
      <h1><?= e($cat['name']) ?></h1>
      <p><?= e($cat['name']) ?> সংক্রান্ত সর্বশেষ বিজ্ঞপ্তি ও খবর</p>
    </div>
  </div>
  <div class="hero-chips">
    <span><i class="fa fa-layer-group"></i> মোট <?= bn($total) ?> টি</span>
    <?php if ($todayN): ?><span><i class="fa fa-bolt"></i> আজ <?= bn($todayN) ?> টি নতুন</span><?php endif; ?>
    <span><i class="fa fa-circle-check"></i> চলমান <?= bn($openN) ?> টি</span>
  </div>
</div>

<?php if (!$rows): ?>
  <div class="card empty"><i class="fa fa-folder-open"></i>এই ক্যাটাগরিতে এখনো কিছু যোগ করা হয়নি।</div>
<?php else: ?>
  <div class="sec-title">
    <div class="sec-l">
      <span class="sec-ic"><i class="fa fa-list-ul"></i></span>
      <h2>সর্বশেষ <?= e($cat['name']) ?><small>নতুন বিজ্ঞপ্তি আগে</small></h2>
    </div>
    <?= list_count_btn($total, url('search') . '?cat=' . (int)$cat['id']) ?>
  </div>
  <div class="plist" id="postList">
    <?php foreach ($rows as $r) post_card($r); ?>
  </div>
  <?= pager($page, $pages, fn($i) => cat_url($cat['slug'], $i)) ?>
<?php endif; ?>
