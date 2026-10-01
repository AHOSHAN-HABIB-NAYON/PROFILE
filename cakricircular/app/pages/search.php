<?php
/* ================= খুঁজুন (ফিল্টার সহ) ================= */
require_once APP_ROOT . '/partials/post_card.php';

$q      = trim((string)($_GET['q'] ?? ''));
$catId  = (int)($_GET['cat'] ?? 0);
$div    = trim((string)($_GET['div'] ?? ''));
$state  = (string)($_GET['state'] ?? '');
$sort   = (string)($_GET['sort'] ?? 'new');
$page   = max(1, (int)($params['page'] ?? ($_GET['page'] ?? 1)));
$per    = per_page();
$off    = ($page - 1) * $per;

$where = ["p.status = 1 AND p.deleted_at IS NULL"]; $args = [];

/* ---- কীওয়ার্ড খোঁজা: শিরোনাম, বিস্তারিত, প্রতিষ্ঠান, বিভাগ, জেলা,
        ক্যাটাগরি, চাকরির ধরন — সব জায়গায়। একাধিক শব্দ দিলে প্রতিটি শব্দই মিলতে হবে ---- */
if ($q !== '') {
    $jobTypeMap = [
        'ফুল টাইম' => 'FULL_TIME', 'ফুলটাইম' => 'FULL_TIME', 'স্থায়ী' => 'FULL_TIME',
        'পার্ট টাইম' => 'PART_TIME', 'পার্টটাইম' => 'PART_TIME', 'খণ্ডকালীন' => 'PART_TIME',
        'চুক্তি' => 'CONTRACTOR', 'চুক্তিভিত্তিক' => 'CONTRACTOR',
        'অস্থায়ী' => 'TEMPORARY', 'ইন্টার্ন' => 'INTERN',
    ];
    $words = preg_split('/\s+/u', trim($q), -1, PREG_SPLIT_NO_EMPTY);
    if (count($words) > 5) $words = array_slice($words, 0, 5);

    foreach ($words as $w) {
        $like = '%' . $w . '%';
        $cond = "(p.title LIKE ? OR p.content LIKE ? OR p.keywords LIKE ? OR p.company LIKE ?
                  OR p.division LIKE ? OR p.district LIKE ? OR p.employment_type LIKE ?
                  OR c.name LIKE ?)";
        array_push($args, $like, $like, $like, $like, $like, $like, $like, $like);

        /* বাংলায় চাকরির ধরন লিখলে ইংরেজি কোডের সাথে মেলাই */
        foreach ($jobTypeMap as $bn => $code) {
            if (mb_strpos($bn, $w, 0, 'UTF-8') !== false || mb_strpos($w, $bn, 0, 'UTF-8') !== false) {
                $cond = rtrim($cond, ')') . " OR p.employment_type = ?)";
                $args[] = $code;
                break;
            }
        }
        $where[] = $cond;
    }
}
if ($catId)    { $where[] = "p.cat_id = ?"; $args[] = $catId; }
if ($div !== '') { $where[] = "(p.division = ? OR p.district = ?)"; $args[] = $div; $args[] = $div; }
if ($state === 'open') $where[] = "(p.deadline IS NULL OR p.deadline >= CURDATE())";
if ($state === 'over') $where[] = "(p.deadline IS NOT NULL AND p.deadline < CURDATE())";
$w = implode(' AND ', $where);

$order = $sort === 'old' ? 'p.published_at ASC' : ($sort === 'popular' ? 'p.views DESC, p.published_at DESC' : 'p.published_at DESC');


$total = (int)col("SELECT COUNT(*) FROM posts p LEFT JOIN categories c ON c.id = p.cat_id WHERE $w", $args);
$rows  = all("SELECT p.*, c.name AS cat_name, c.slug AS cat_slug FROM posts p
              LEFT JOIN categories c ON c.id = p.cat_id
              WHERE $w ORDER BY $order LIMIT $per OFFSET $off", $args);
$pages = max(1, (int)ceil($total / $per));
$remaining = max(0, $total - ($page * $per));
$hasFilter = ($q !== '' || $catId || $div !== '' || $state !== '');

/* সার্চ কিওয়ার্ড সেভ */
if ($q !== '' && $page === 1) {
    try {
        q("INSERT INTO searches (term, hits, last_at) VALUES (?,1,NOW())
           ON DUPLICATE KEY UPDATE hits = hits + 1, last_at = NOW()", [mb_substr($q, 0, 100, 'UTF-8')]);
    } catch (Throwable $e) {}
}
$topTerms  = all("SELECT term FROM searches ORDER BY hits DESC, last_at DESC LIMIT 8");
$divisions = ['ঢাকা','চট্টগ্রাম','রাজশাহী','খুলনা','বরিশাল','সিলেট','রংপুর','ময়মনসিংহ'];

/* ফিল্টার বাদে পরের পেজের লিংক */
$qsBase = array_filter(['q' => $q, 'cat' => $catId ?: '', 'div' => $div, 'state' => $state, 'sort' => $sort !== 'new' ? $sort : '']);
$nextQs = $qsBase; $nextQs['page'] = $page + 1;

css_once('search', <<<CSS
.srch-box{background:var(--card);border:1px solid var(--line-2);border-radius:20px;
  box-shadow:0 1px 2px rgba(16,40,36,.04),0 10px 26px rgba(16,40,36,.05);padding:18px;margin-bottom:14px}
.srch-in{position:relative;display:flex;gap:9px;margin-bottom:13px}
.sfield{flex:1;position:relative;display:flex;align-items:center}
.sfield>i.mg{position:absolute;left:16px;color:var(--brand);font-size:.95rem;pointer-events:none}
.sfield input[type=search]{width:100%;height:52px;border:1.5px solid var(--line);border-radius:16px;
  padding:0 46px 0 44px;font:inherit;font-size:.97rem;background:var(--soft);color:var(--ink);transition:.18s}
.sfield input:focus{outline:none;border-color:var(--brand);background:var(--card);box-shadow:0 0 0 4px rgba(10,125,69,.1)}
.sfield input::-webkit-search-cancel-button{display:none}
.sclear{position:absolute;right:9px;width:30px;height:30px;border-radius:50%;border:0;background:var(--chip);
  color:#5b6d69;display:none;place-items:center;font-size:.76rem;transition:.16s}
.sclear.on{display:grid}
.sclear:hover{background:var(--danger);color:#fff}
.sgo{width:52px;height:52px;border-radius:16px;border:0;background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 6px 14px rgba(10,125,69,.28);color:#fff;font-size:1rem;flex:none;transition:.18s}
.sgo:hover{background:var(--brand-d)}
.filters{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.fsel{position:relative;display:flex;align-items:center}
.fsel>i{position:absolute;left:12px;color:var(--muted);font-size:.72rem;pointer-events:none}
.filters select{width:100%;height:44px;border:1.5px solid var(--line);border-radius:13px;background:var(--soft);
  padding:0 12px 0 30px;font:inherit;font-size:.88rem;color:var(--ink-2);appearance:none;transition:.16s;color:var(--ink)}
.filters select:focus{outline:none;border-color:var(--brand);background:var(--card)}
.srch-act{display:flex;gap:9px;align-items:center;margin-top:13px;flex-wrap:wrap}
.clr-link{font-size:.84rem;font-weight:600;color:var(--muted);display:inline-flex;align-items:center;gap:6px}
.clr-link:hover{color:var(--danger)}
.tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.tag{padding:7px 14px;border-radius:999px;background:var(--soft);border:1px solid var(--line);font-size:.83rem;
  font-weight:600;color:var(--ink-2);transition:.16s;display:inline-flex;align-items:center;gap:7px}
.tag:hover{background:var(--brand);color:#fff;border-color:var(--brand)}
.tag i{font-size:.72rem;opacity:.8}
.tag:hover i{color:#fff}
.tlabel{font-size:.79rem;color:var(--muted);font-weight:700;margin:16px 0 0;display:flex;align-items:center;gap:7px}
.tlabel i{color:var(--brand);font-size:.76rem}
.res-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 12px;flex-wrap:wrap}
.res-bar b{font-size:1rem}
.res-bar .q{color:var(--brand-d)}
@media(max-width:700px){ .filters{grid-template-columns:1fr 1fr} .srch-box{padding:14px;border-radius:17px} }
CSS);

js_once('search_js', <<<'JS'
(function(){
  function sync(){
    var i=document.getElementById('sQ'), b=document.getElementById('sClear');
    if(i&&b) b.classList.toggle('on', i.value.trim()!=='');
  }
  document.addEventListener('input', function(e){ if(e.target.id==='sQ') sync(); });
  document.addEventListener('click', function(e){
    if(e.target.closest('#sClear')){
      var i=document.getElementById('sQ'); if(i){i.value='';i.focus();sync();}
    }
  });
  document.addEventListener('change', function(e){
    if(e.target.closest('#searchForm') && e.target.tagName==='SELECT'){
      e.target.closest('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
    }
  });
  document.addEventListener('spa:ready', sync); sync();
})();
JS);

$P = [
  'title' => ($q !== '' ? '“' . $q . '” — সার্চ ফলাফল | ' : 'খুঁজুন | ') . setting('site_name', 'চাকরি সার্কুলার'),
  'desc'  => 'চাকরি, ভর্তি, রেজাল্ট ও নোটিশ — কিওয়ার্ড, ক্যাটাগরি, বিভাগ ও আবেদনের অবস্থা দিয়ে খুঁজুন।',
  /* ফলাফলের পাতা গুগলে ইনডেক্স করানো উচিত নয় — "পাতলা কনটেন্ট" হিসেবে গণ্য হয়।
     লিংকগুলো ক্রল হবে, কিন্তু পাতাটা ইনডেক্স হবে না। */
  'robots' => 'noindex, follow',
  'canonical' => url('search') . ($q !== '' ? '?q=' . rawurlencode($q) : ''),
  'nav' => 'search',
];
?>
<div class="hero">
  <div class="hero-in">
    <span class="hero-ic"><i class="fa fa-magnifying-glass"></i></span>
    <div>
      <h1>খুঁজুন</h1>
      <p>চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড লিখে সরাসরি খুঁজে নিন</p>
    </div>
  </div>
</div>

<div class="srch-box">
  <form action="<?= e(url('search')) ?>" method="get" data-spa-form id="searchForm">
    <div class="srch-in">
      <div class="sfield">
        <i class="fa fa-magnifying-glass mg"></i>
        <input type="search" name="q" id="sQ" value="<?= e($q) ?>" placeholder="চাকরি, প্রতিষ্ঠান বা কীওয়ার্ড খুঁজুন…" autocomplete="off">
        <button type="button" class="sclear<?= $q !== '' ? ' on' : '' ?>" id="sClear" aria-label="মুছুন"><i class="fa fa-xmark"></i></button>
      </div>
      <button class="sgo" type="submit" aria-label="খুঁজুন"><i class="fa fa-magnifying-glass"></i></button>
    </div>
    <div class="filters">
      <div class="fsel"><i class="fa fa-folder"></i>
        <select name="cat">
          <option value="">সব ক্যাটাগরি</option>
          <?php foreach (categories() as $c): ?>
            <option value="<?= (int)$c['id'] ?>" <?= $catId === (int)$c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="fsel"><i class="fa fa-location-dot"></i>
        <select name="div">
          <option value="">সব বিভাগ</option>
          <?php foreach ($divisions as $d): ?>
            <option value="<?= e($d) ?>" <?= $div === $d ? 'selected' : '' ?>><?= e($d) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div class="fsel"><i class="fa fa-hourglass-half"></i>
        <select name="state">
          <option value="">সব অবস্থা</option>
          <option value="open" <?= $state === 'open' ? 'selected' : '' ?>>আবেদন চলমান</option>
          <option value="over" <?= $state === 'over' ? 'selected' : '' ?>>সময় শেষ</option>
        </select>
      </div>
      <div class="fsel"><i class="fa fa-arrow-down-wide-short"></i>
        <select name="sort">
          <option value="new" <?= $sort === 'new' ? 'selected' : '' ?>>নতুন আগে</option>
          <option value="old" <?= $sort === 'old' ? 'selected' : '' ?>>পুরনো আগে</option>
          <option value="popular" <?= $sort === 'popular' ? 'selected' : '' ?>>জনপ্রিয়</option>
        </select>
      </div>
    </div>
    <?php if ($hasFilter): ?>
      <div class="srch-act">
        <a class="clr-link" href="<?= e(url('search')) ?>"><i class="fa fa-rotate-left"></i>ফিল্টার মুছে ফেলুন</a>
      </div>
    <?php endif; ?>
  </form>

  <?php if ($topTerms && !$hasFilter): ?>
    <div class="tlabel"><i class="fa fa-arrow-trend-up"></i>সবাই যা খুঁজছে</div>
    <div class="tags">
      <?php foreach ($topTerms as $t): ?>
        <a class="tag" href="<?= e(url('search') . '?q=' . rawurlencode($t['term'])) ?>"><i class="fa fa-magnifying-glass"></i><?= e($t['term']) ?></a>
      <?php endforeach; ?>
    </div>
    <div class="tlabel"><i class="fa fa-location-dot"></i>বিভাগ অনুযায়ী</div>
    <div class="tags">
      <?php foreach ($divisions as $d): ?>
        <a class="tag" href="<?= e(url('search') . '?div=' . rawurlencode($d)) ?>"><i class="fa fa-map-pin"></i><?= e($d) ?></a>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>

<?php if ($hasFilter || $rows): ?>
  <div class="res-bar">
    <b><?php if ($q !== ''): ?><span class="q">“<?= e($q) ?>”</span> এর ফলাফল<?php else: ?>সব বিজ্ঞপ্তি<?php endif; ?></b>
    <?= list_count_btn($total, url('search')) ?>
  </div>
<?php endif; ?>

<?php if (!$rows): ?>
  <div class="card empty"><i class="fa fa-magnifying-glass"></i>কিছু পাওয়া যায়নি। অন্য শব্দ দিয়ে চেষ্টা করুন বা ফিল্টার কমিয়ে দেখুন।</div>
<?php else: ?>
  <div class="plist" id="postList"><?php foreach ($rows as $r) post_card($r); ?></div>
  <?= pager($page, $pages, function ($i) use ($qsBase) {
      $x = $qsBase; if ($i > 1) $x['page'] = $i;
      return url('search') . ($x ? '?' . http_build_query($x) : '');
  }) ?>
<?php endif; ?>
