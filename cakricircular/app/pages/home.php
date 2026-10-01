<?php
/* ================= হোম পেজ ================= */
require_once APP_ROOT . '/partials/post_card.php';

$page  = max(1, (int)($params['page'] ?? 1));
$per   = per_page();
$off   = ($page - 1) * $per;

/* গণনায় সব পোস্ট (প্রিমিয়ামসহ) — সংখ্যা যেন ওঠানামা না করে */
$total    = (int)col("SELECT COUNT(*) FROM posts WHERE status = 1 AND deleted_at IS NULL");
/* তালিকায় শুধু সাধারণ পোস্ট — প্রিমিয়ামগুলো মাঝে মাঝে গোঁজা হবে */
$totalOrd = (int)col("SELECT COUNT(*) FROM posts p WHERE p.status = 1 AND p.deleted_at IS NULL" . not_premium('p'));
$rows  = all("SELECT p.*, c.name AS cat_name, c.slug AS cat_slug
              FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
              WHERE p.status = 1 AND p.deleted_at IS NULL" . not_premium('p') . "
              ORDER BY p.published_at DESC, p.id DESC
              LIMIT $per OFFSET $off");
$pages = max(1, (int)ceil($totalOrd / $per));

/* সীমার বাইরের পৃষ্ঠা (যেমন /page/9999) — খালি পাতা না দিয়ে ৪০৪ */
if ($page > $pages) { require APP_ROOT . '/app/pages/404.php'; return; }
$remaining = max(0, $totalOrd - ($page * $per));

$banners = $page === 1
    ? all("SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 10")
    : [];

/* ক্যাটাগরি অনুযায়ী পোস্ট সংখ্যা (হোমের গ্রিডের জন্য) */
$catCounts = [];
if ($page === 1) {
    try {
        foreach (all("SELECT cat_id, COUNT(*) n FROM posts WHERE status = 1 AND deleted_at IS NULL GROUP BY cat_id") as $cc)
            $catCounts[(int)$cc['cat_id']] = (int)$cc['n'];
    } catch (Throwable $e) {}
}
$homeCats = categories();

css_once('banner', <<<CSS
/* ব্যানার — ৮৫৬×২৯২ অনুপাত (২.৯৩:১) */
.bnr{position:relative;border-radius:20px;overflow:hidden;background:var(--soft);
  box-shadow:var(--sh);margin:14px 0 4px}
.bnr-win{overflow:hidden}
.bnr-track{display:flex;will-change:transform}
.bnr-slide{flex:0 0 100%;aspect-ratio:856/292;background:var(--soft);position:relative}
.bnr-slide img{width:100%;height:100%;object-fit:cover}
.bnr-slide a{display:block;width:100%;height:100%}
.bnr-win{cursor:grab}
.bnr-win.drag{cursor:grabbing}
.bnr-win.drag .bnr-slide a{pointer-events:none}
.bnr-dots{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:5px;align-items:center;z-index:2}
.bnr-dot{width:7px;height:7px;border-radius:50%;border:0;padding:0;background:rgba(255,255,255,.55);
  transition:.26s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.bnr-dot.on{width:22px;border-radius:999px;background:var(--card)}
@media(max-width:700px){ .bnr{border-radius:18px;margin:12px 0 4px} .bnr-dots{bottom:8px} }
CSS);

css_once('home', <<<CSS
/* ===== হোম হিরো — আসল ছবি স্পষ্ট দেখা যায়, বাঁয়ে লেখা, নিচে সার্চ ===== */
.hh{position:relative;margin:-16px -16px 0;color:#fff;overflow:hidden;isolation:isolate;
  background:linear-gradient(180deg,#0b544e,#0f766e)}
.hh-photo{position:relative;min-height:290px;padding:26px 18px 34px;display:flex;flex-direction:column;justify-content:center;
  background:#2f7fd0 url("data:image/webp;base64,UklGRrQAAABXRUJQVlA4IKgAAAAwBQCdASogABIAPtFepUyoJaOiMBgIAQAaCWoAnTLVRCA3MQncILywiiBZnhA1/O8Q1ADyc/fE1OEm3/gs8a5mkRKK0osdemRZBpBQ28f6r5H7XhQMbr/8B2AP3wSik3kIR/5IC3WaXiXLzW9wrgGNM4aNEmttB3K2J6Fxr4IRcT3E8CFioQ9yvQIgRpJ7LjWWCfytiv1hM0zDh971A5Fp+HYH9RU58AA=") 68% 50%/cover no-repeat;isolation:isolate}
.hh-scene{position:absolute;inset:0;width:100%;height:100%;z-index:-2;display:block;object-fit:cover;object-position:68% 50%}
.hh-photo::before{content:"";position:absolute;inset:0;z-index:-1;
  background:linear-gradient(90deg,rgba(8,61,57,.78) 0%,rgba(11,84,78,.5) 38%,rgba(11,84,78,.08) 64%,rgba(11,84,78,0) 80%),
             linear-gradient(0deg,#0b544e 0%,rgba(11,84,78,.55) 14%,rgba(11,84,78,0) 34%)}
.hh-pill{align-self:flex-start;display:inline-block;padding:2px 16px 4px;border-radius:14px;font-size:1.5rem;font-weight:700;line-height:1.45;
  background:linear-gradient(135deg,#14a38f,#22c1a4);box-shadow:0 8px 20px rgba(0,0,0,.18);margin-bottom:8px;letter-spacing:-.3px}
.hh h1{font-size:1.85rem;line-height:1.28;margin:0 0 10px;font-weight:700;letter-spacing:-.5px;text-shadow:0 2px 16px rgba(0,0,0,.35)}
.hh h1 span{display:block}
.hh p{margin:0;font-size:.9rem;max-width:22em;line-height:1.6;text-shadow:0 1px 10px rgba(0,0,0,.45);opacity:.96}
.hh-band{padding:4px 16px 18px}
.hh-search{position:relative;display:flex;align-items:center;background:#fff;border-radius:20px;padding:6px 6px 6px 16px;
  box-shadow:0 14px 30px rgba(0,0,0,.2);max-width:680px}
html[data-theme="dark"] .hh-search{background:var(--card)}
.hh-search i.mg{color:#8fa39e;font-size:1rem}
.hh-search input{flex:1;min-width:0;border:0;background:none;height:46px;padding:0 10px;font:inherit;font-size:.95rem;color:var(--ink)}
.hh-search input:focus{outline:none}
.hh-search input::placeholder{color:#93a39f}
.hh-search button{width:48px;height:48px;border:0;border-radius:15px;flex:none;color:#fff;font-size:1rem;
  background:linear-gradient(135deg,var(--brand),#22b49c);box-shadow:0 6px 14px rgba(15,118,110,.3)}
.hh-search button:active{transform:scale(.94)}

/* ক্যাটাগরি — এক লাইনে ছোট পিল, আঙুলে টেনে সরানো যায় */
.cg{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:none;margin:14px -16px 0;padding:2px 16px 4px;
  -webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
.cg::-webkit-scrollbar{display:none}
.cg a{flex:none;scroll-snap-align:start;display:inline-flex;align-items:center;gap:7px;padding:4px 13px 4px 4px;border-radius:999px;
  background:var(--card);box-shadow:0 1px 2px rgba(16,40,36,.06),0 3px 10px rgba(16,40,36,.06);transition:transform .18s}
.cg a:active{transform:scale(.95)}
.cg .tile-ic{width:28px;height:28px;font-size:.72rem;box-shadow:none}
.cg b{font-size:.8rem;font-weight:700;color:var(--ink);white-space:nowrap}

@media(min-width:701px){
  .hh{margin:0;border-radius:26px}
  .hh-photo{min-height:380px;padding:44px 40px 50px}
  .hh-pill{font-size:2rem}
  .hh h1{font-size:2.5rem}
  .hh p{font-size:1rem}
  .hh-band{padding:0 40px 24px}
  .cg{margin:16px 0 0;padding:2px 0 4px}
  .cg a:hover{transform:translateY(-2px)}
}
@media(min-width:1024px){
  .hh-photo{min-height:440px;padding:56px 56px 60px}
  .hh-pill{font-size:2.3rem}
  .hh h1{font-size:3rem}
  .hh-band{padding:0 56px 28px}
}
@media(max-width:700px){ .hh{margin:-12px -12px 0} .cg{margin:12px -12px 0;padding:2px 12px 4px} }
@media(max-width:360px){ .hh h1{font-size:1.55rem} .hh-pill{font-size:1.25rem} }

/* "ট্রেন্ডিং দেখুন" — ছোট এক সারির কার্ড */
.hp{display:flex;align-items:center;gap:11px;margin:12px 0 0;padding:9px 10px 9px 12px;border-radius:16px;
  background:linear-gradient(120deg,#0b544e,#0f766e 60%,#16a08a);color:#fff;box-shadow:var(--sh)}
.hp-ic{width:36px;height:36px;flex:none;border-radius:11px;background:rgba(255,255,255,.15);display:grid;place-items:center;font-size:.95rem}
.hp-tx{flex:1;min-width:0}
.hp b{display:block;font-size:.88rem;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hp-tx>span{display:block;font-size:.7rem;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hp .hp-go{flex:none;display:inline-flex;align-items:center;gap:5px;background:#fbbf24;color:#3b2a00;font-weight:700;
  font-size:.72rem;padding:5px 11px;border-radius:999px}

CSS);

$P = [
  'title'     => setting('meta_title', 'চাকরি সার্কুলার | আজকের চাকরির খবর | সরকারি ও বেসরকারি চাকরি')
                 . ($page > 1 ? ' — পৃষ্ঠা ' . bn($page) : ''),
  'desc'      => setting('meta_description', 'চাকরি সার্কুলার — আজকের চাকরির খবর, সরকারি চাকরি, বেসরকারি চাকরি, ব্যাংক চাকরি, শিক্ষক নিয়োগ ও নিয়োগ বিজ্ঞপ্তি প্রতিদিন হালনাগাদ।'),
  'canonical' => $page > 1 ? url('page/' . $page) : url(),
  'nav'       => 'home',
];
?>

<?php if ($page === 1): ?>
<section class="hh">
  <div class="hh-photo">
    <picture>
      <source media="(min-width:701px)" srcset="<?= e(asset('img/hero-1600.webp')) ?>" type="image/webp">
      <img class="hh-scene" src="<?= e(asset('img/hero-960.webp')) ?>" alt="" width="1600" height="900"
           loading="eager" fetchpriority="high" decoding="async">
    </picture>
    <span class="hh-pill"><?= e(setting('home_hero_badge', 'সবার আগে')) ?></span>
    <h1><span><?= e(setting('home_hero_title', 'সঠিক তথ্য')) ?></span><span><?= e(setting('home_hero_accent', 'চাকরি সার্কুলার')) ?></span></h1>
    <p><?= e(setting('home_hero_sub', 'সরকারি-বেসরকারি চাকরি, ভর্তি, রেজাল্ট, নোটিশ ও স্কলারশিপ')) ?></p>
  </div>
  <div class="hh-band">
    <form class="hh-search" action="<?= e(url('search')) ?>" method="get" data-spa-form role="search">
      <i class="fa fa-magnifying-glass mg"></i>
      <input type="search" name="q" placeholder="চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড লিখুন…" autocomplete="off" aria-label="খুঁজুন">
      <button type="submit" aria-label="খুঁজুন"><i class="fa fa-magnifying-glass"></i></button>
    </form>
  </div>
</section>

<?php if ($homeCats): ?>
<nav class="cg" aria-label="ক্যাটাগরি">
  <?php foreach ($homeCats as $i => $c): ?>
    <a class="tone-<?= ($i % 6) + 1 ?>" href="<?= e(cat_url($c['slug'])) ?>"><span class="tile-ic"><i class="fa <?= e($c['icon'] ?: 'fa-folder') ?>"></i></span><b><?= e($c['name']) ?></b></a>
  <?php endforeach; ?>
  <a class="tone-2" href="<?= e(url('categories')) ?>"><span class="tile-ic"><i class="fa fa-grip"></i></span><b>সব দেখুন</b></a>
</nav>
<?php endif; ?>
<?php endif; ?>

<?php if ($banners): ?>
<div class="bnr" aria-label="বিজ্ঞাপন">
  <div class="bnr-win">
    <div class="bnr-track">
      <?php foreach ($banners as $i => $b): ?>
        <div class="bnr-slide">
          <?php if (!empty($b['link'])): ?>
            <a href="<?= e($b['link']) ?>" target="_blank" rel="noopener sponsored">
              <img src="<?= e(img_url($b['image'], 'banners')) ?>" alt="<?= e($b['title'] ?? '') ?>"
                   width="856" height="292" <?= $i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"' ?> decoding="async">
            </a>
          <?php else: ?>
            <img src="<?= e(img_url($b['image'], 'banners')) ?>" alt="<?= e($b['title'] ?? '') ?>"
                 width="856" height="292" <?= $i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"' ?> decoding="async">
          <?php endif; ?>
        </div>
      <?php endforeach; ?>
    </div>
  </div>
  <?php if (count($banners) > 1): ?>
    <div class="bnr-dots">
      <?php foreach ($banners as $i => $b): ?><button class="bnr-dot<?= $i === 0 ? ' on' : '' ?>" aria-label="স্লাইড <?= bn($i + 1) ?>"></button><?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>
<?php elseif ($page === 1): ?>
<a class="hp" href="<?= e(url('trending')) ?>">
  <span class="hp-ic"><i class="fa fa-fire"></i></span>
  <span class="hp-tx"><b>সঠিক প্রস্তুতি, সফল ক্যারিয়ার</b><span>সবচেয়ে বেশি দেখা বিজ্ঞপ্তিগুলো</span></span>
  <span class="hp-go">ট্রেন্ডিং <i class="fa fa-arrow-right"></i></span>
</a>
<?php endif; ?>

<h1 class="sr-only"><?= e(setting('home_h1', 'চাকরি সার্কুলার ও আজকের চাকরির খবর')) ?></h1>

<div class="sec-title">
  <div class="sec-l">
    <span class="sec-ic fire"><i class="fa fa-fire"></i></span>
    <h2>সর্বশেষ আপডেট<small>মোট <?= bn($total) ?>টি পোস্ট</small></h2>
  </div>
  <a class="cnt-pill" href="<?= e(url('search')) ?>">সব দেখুন <i class="fa fa-arrow-right"></i></a>
</div>

<?php if (!$rows): ?>
  <div class="card empty"><i class="fa fa-inbox"></i>এখনো কোনো পোস্ট প্রকাশ করা হয়নি।</div>
<?php else: ?>
  <div class="plist" id="postList">
    <?php foreach (premium_feed($rows, $page) as $r) post_card($r); ?>
  </div>
  <?= pager($page, $pages, fn($i) => $i > 1 ? url('page/' . $i) : url()) ?>
<?php endif; ?>
