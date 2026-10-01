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
$homeCats = array_slice(categories(), 0, 6);

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
/* ===== হোম হিরো (হেডারের সবুজ রঙ নিচে নেমে আসে) ===== */
.hh{position:relative;margin:-16px -16px 0;padding:22px 18px 74px;background:var(--hero-grad);color:#fff;overflow:hidden;isolation:isolate}
.hh::before{content:"";position:absolute;inset:0;z-index:-1;opacity:.55;
  background:radial-gradient(420px 220px at 92% 18%,rgba(160,240,190,.28),transparent 70%),
             radial-gradient(300px 200px at -5% 100%,rgba(255,255,255,.10),transparent 70%)}
.hh-art{position:absolute;right:-14px;top:6px;width:min(44%,220px);z-index:-1;opacity:.5;pointer-events:none}
.hh-badge{display:inline-flex;align-items:center;gap:7px;padding:4px 12px 4px 5px;border-radius:999px;font-size:.74rem;font-weight:600;
  background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);margin-bottom:10px}
.hh-badge b{background:#fbbf24;color:#3b2a00;border-radius:999px;padding:0 8px;font-size:.66rem;line-height:1.8}
.hh h1{font-size:1.72rem;line-height:1.28;margin:0 0 8px;font-weight:700;letter-spacing:-.6px;max-width:15em;text-wrap:balance}
.hh h1 span{color:#9bf0bd}
.hh p{margin:0 0 16px;font-size:.88rem;opacity:.86;max-width:28em;line-height:1.65}
.hh-search{position:relative;display:flex;align-items:center;background:var(--card);border-radius:18px;padding:5px 5px 5px 14px;
  box-shadow:0 14px 30px rgba(0,0,0,.18);max-width:620px}
html[data-theme="dark"] .hh-search{background:var(--card)}
.hh-search i.mg{color:var(--muted);font-size:.95rem}
.hh-search input{flex:1;min-width:0;border:0;background:none;height:44px;padding:0 10px;font:inherit;font-size:.94rem;color:var(--ink)}
.hh-search input:focus{outline:none}
.hh-search input::placeholder{color:#93a39b}
.hh-search button{width:44px;height:44px;border:0;border-radius:14px;flex:none;color:#fff;font-size:.95rem;
  background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 6px 14px rgba(10,125,69,.3)}
.hh-search button:active{transform:scale(.94)}
.hh-stats{display:flex;gap:16px;margin-top:14px;font-size:.76rem;opacity:.9;flex-wrap:wrap}
.hh-stats span{display:inline-flex;align-items:center;gap:6px}
.hh-stats i{color:#9bf0bd}

/* ক্যাটাগরি গ্রিড — হিরোর ওপর ভেসে থাকা সাদা প্যানেল */
.cg{position:relative;z-index:2;margin:-56px 0 0;background:var(--card);border:1px solid var(--line-2);border-radius:24px;
  padding:14px;box-shadow:var(--sh-lg);display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.cg a{display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;padding:12px 4px 10px;border-radius:18px;
  background:var(--tl);transition:transform .18s,box-shadow .18s;min-width:0}
.cg a:hover{transform:translateY(-3px);box-shadow:0 10px 22px rgba(10,40,25,.1)}
.cg a:active{transform:scale(.97)}
.cg b{font-size:.84rem;font-weight:700;color:var(--ink);line-height:1.3;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cg small{font-size:.68rem;color:var(--muted);font-weight:600;margin-top:-5px}

/* "সঠিক প্রস্তুতি" প্রোমো কার্ড */
.hp{position:relative;display:flex;align-items:center;gap:14px;margin:14px 0 0;padding:16px 18px;border-radius:22px;overflow:hidden;
  background:linear-gradient(120deg,#063f24,#0a6b3c 60%,#12925a);color:#fff;box-shadow:var(--sh);isolation:isolate}
.hp::after{content:"";position:absolute;right:-40px;top:-50px;width:180px;height:180px;border-radius:50%;z-index:-1;
  background:radial-gradient(circle,rgba(170,245,200,.3),transparent 70%)}
.hp-tx{flex:1;min-width:0}
.hp b{display:block;font-size:1.06rem;line-height:1.35}
.hp-tx>span{display:block;font-size:.78rem;opacity:.85;margin-top:2px}
.hp .hp-go{opacity:1;display:inline-flex;align-items:center;gap:6px;margin-top:10px;background:#fbbf24;color:#3b2a00;font-weight:700;
  font-size:.78rem;padding:6px 14px;border-radius:999px;box-shadow:0 6px 14px rgba(251,191,36,.3)}
.hp-ic{width:62px;height:62px;flex:none;border-radius:20px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);
  display:grid;place-items:center;font-size:1.6rem}

@media(min-width:701px){
  .hh{margin:0;border-radius:28px;padding:34px 34px 88px}
  .hh h1{font-size:2.1rem}
  .hh p{font-size:.96rem}
  .cg{margin:-64px 20px 0;grid-template-columns:repeat(6,1fr);padding:16px}
}
@media(min-width:1024px){
  .hh{padding:44px 48px 96px}
  .hh h1{font-size:2.5rem}
  .hh-art{width:330px;right:40px;top:auto;bottom:70px;opacity:.85}
  .cg{margin:-70px 40px 0}
}
@media(max-width:700px){
  .hh{margin:-12px -12px 0;padding:18px 16px 70px}
  .cg{padding:12px;gap:8px;border-radius:22px;margin-top:-54px}
  .cg b{font-size:.8rem}
  .hp b{font-size:.98rem}
}
@media(max-width:360px){ .hh h1{font-size:1.5rem} }
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
  <svg class="hh-art" viewBox="0 0 300 220" aria-hidden="true">
    <defs>
      <linearGradient id="hhA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bff5d4" stop-opacity=".55"/><stop offset="1" stop-color="#bff5d4" stop-opacity=".05"/></linearGradient>
      <linearGradient id="hhB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".35"/><stop offset="1" stop-color="#ffffff" stop-opacity=".04"/></linearGradient>
    </defs>
    <!-- স্মৃতিসৌধের আদলে ত্রিভুজ আর পতাকা -->
    <path d="M150 20 L188 210 L112 210 Z" fill="url(#hhA)"/>
    <path d="M150 52 L210 210 L90 210 Z" fill="url(#hhB)"/>
    <path d="M150 84 L236 210 L64 210 Z" fill="url(#hhB)" opacity=".7"/>
    <path d="M150 116 L262 210 L38 210 Z" fill="url(#hhB)" opacity=".5"/>
    <line x1="232" y1="30" x2="232" y2="150" stroke="#e8fff1" stroke-opacity=".7" stroke-width="2"/>
    <rect x="233" y="30" width="52" height="32" rx="3" fill="#0a7d45" stroke="#e8fff1" stroke-opacity=".5"/>
    <circle cx="255" cy="46" r="9" fill="#f42a41"/>
  </svg>
  <span class="hh-badge"><b>নতুন</b>প্রতিদিন হালনাগাদ চাকরির খবর</span>
  <h1><?= e(setting('home_hero_title', 'সবার আগে সঠিক তথ্য')) ?> <span><?= e(setting('home_hero_accent', 'চাকরি সার্কুলার')) ?></span></h1>
  <p><?= e(setting('home_hero_sub', 'সরকারি-বেসরকারি চাকরি, ভর্তি, রেজাল্ট, নোটিশ ও স্কলারশিপ — সব তথ্য এক প্ল্যাটফর্মে।')) ?></p>
  <form class="hh-search" action="<?= e(url('search')) ?>" method="get" data-spa-form role="search">
    <i class="fa fa-magnifying-glass mg"></i>
    <input type="search" name="q" placeholder="চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড লিখুন…" autocomplete="off" aria-label="খুঁজুন">
    <button type="submit" aria-label="খুঁজুন"><i class="fa fa-arrow-right"></i></button>
  </form>
  <div class="hh-stats">
    <span><i class="fa fa-layer-group"></i>মোট <?= bn($total) ?>টি পোস্ট</span>
    <span><i class="fa fa-circle-check"></i>যাচাই করা তথ্য</span>
  </div>
</section>

<?php if ($homeCats): ?>
<nav class="cg" aria-label="ক্যাটাগরি">
  <?php foreach ($homeCats as $i => $c): ?>
    <a class="tone-<?= ($i % 6) + 1 ?>" href="<?= e(cat_url($c['slug'])) ?>">
      <span class="tile-ic"><i class="fa <?= e($c['icon'] ?: 'fa-folder') ?>"></i></span>
      <b><?= e($c['name']) ?></b>
      <small><?= bn($catCounts[(int)$c['id']] ?? 0) ?>টি</small>
    </a>
  <?php endforeach; ?>
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
  <span class="hp-tx">
    <b>সঠিক প্রস্তুতি, সফল ক্যারিয়ার</b>
    <span>আমাদের সাথে থাকুন, আপনার স্বপ্ন পূরণে</span>
    <span class="hp-go">ট্রেন্ডিং দেখুন <i class="fa fa-arrow-right"></i></span>
  </span>
  <span class="hp-ic"><i class="fa fa-user-graduate"></i></span>
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
