<?php
/* ================= পোস্ট বিস্তারিত ================= */
require_once APP_ROOT . '/partials/post_card.php';

$slug = (string)($params['slug'] ?? '');
$post = one("SELECT p.*, c.name AS cat_name, c.slug AS cat_slug
             FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
             WHERE p.slug = ? AND p.status = 1 AND p.deleted_at IS NULL LIMIT 1", [$slug]);

/* পুরনো/ভাঙা লিংক হলে নতুন লিংকে ৩০১ রিডাইরেক্ট */
if (!$post && $slug !== '') {
    try {
        $rd = one("SELECT p.slug FROM slug_redirects r JOIN posts p ON p.id = r.post_id
                   WHERE r.old_slug = ? LIMIT 1", [$slug]);
        if ($rd) {
            if (is_spa()) json_out(['redirect' => url('post/' . $rd['slug'])], 200);
            header('Location: ' . url('post/' . $rd['slug']), true, 301); exit;
        }
    } catch (Throwable $e) {}
}

if (!$post) { require APP_ROOT . '/app/pages/404.php'; return; }

count_post_view((int)$post['id']);

$images = all("SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order ASC, id ASC LIMIT 5", [$post['id']]);
$links  = all("SELECT * FROM post_links  WHERE post_id = ? ORDER BY sort_order ASC, id ASC", [$post['id']]);
$dl     = deadline_info($post['deadline']);
$pdfPath = $post['pdf'] ? UPLOAD_PATH . '/pdf/' . $post['pdf'] : null;

$related = all("SELECT p.*, c.name AS cat_name FROM posts p LEFT JOIN categories c ON c.id = p.cat_id
                WHERE p.status = 1 AND p.deleted_at IS NULL AND p.cat_id = ? AND p.id <> ?
                ORDER BY p.published_at DESC LIMIT 6", [$post['cat_id'], $post['id']]);

css_once('post_detail', <<<CSS
.pd{background:var(--card);border:1px solid var(--line-2);border-radius:24px;box-shadow:var(--sh);padding:18px;margin-top:4px;overflow:hidden}
.crumb{font-size:.78rem;color:var(--muted);margin:0 0 12px;display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.crumb a:hover{color:var(--brand)}
.crumb i{font-size:.62rem;opacity:.7}

/* মাথা: লোগো + ট্যাগ + শিরোনাম */
.pd-top{display:flex;gap:14px;align-items:flex-start}
.pd-logo{width:66px;height:66px;flex:none;border-radius:20px;overflow:hidden;background:var(--soft);border:1px solid var(--line-2);box-shadow:var(--sh)}
.pd-logo img{width:100%;height:100%;object-fit:cover}
.pd-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.pd-tag{display:inline-flex;align-items:center;gap:5px;padding:1px 11px;border-radius:999px;font-size:.72rem;font-weight:700;line-height:1.8;
  background:var(--tl,#e6f4f1);color:var(--t2,#0b544e)}
html[data-theme="dark"] .pd-tag{color:var(--t1,#5fd6c3)}
.pd-tag.new{background:#ef4444;color:#fff}
.pd h1{font-size:1.32rem;line-height:1.45;margin:0;font-weight:700;letter-spacing:-.4px;color:var(--ink)}
.pd-org{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:.84rem;color:var(--muted);font-weight:600}
.pd-org i{color:var(--brand);margin-right:5px;font-size:.78rem}
.pd-org .loc i{color:#e0493a}

.prem-strip{display:flex;align-items:center;gap:8px;margin:14px 0 0;padding:8px 13px;border-radius:14px;
  background:linear-gradient(120deg,#fdf3df,#fae9c4);border:1px solid #eeddb4;color:#8f5606;font-size:.82rem;font-weight:700}
.prem-strip .cr{font-size:.95rem;line-height:1}
.prem-strip small{font-weight:500;color:#a08040;font-size:.75rem;margin-left:auto}

/* মূল তথ্যের টাইল */
.pd-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:16px 0 0}
.pst{background:var(--soft);border:1px solid var(--line-2);border-radius:16px;padding:10px 11px;min-width:0}
.pst span{display:flex;align-items:center;gap:6px;font-size:.72rem;color:var(--muted);font-weight:600}
.pst span i{color:var(--brand);font-size:.74rem}
.pst b{display:block;font-size:.88rem;font-weight:700;margin-top:3px;line-height:1.4;color:var(--ink);word-break:break-word}
.pst.sal i{color:#16a34a}.pst.dl i{color:#e0493a}

/* বিস্তারিত তালিকা */
.pd-info{margin:14px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 14px}
.pi{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px dashed var(--line)}
.pi .ic{width:34px;height:34px;flex:none;border-radius:11px;display:grid;place-items:center;font-size:.84rem;background:var(--brand-l);color:var(--brand)}
.pi small{display:block;font-size:.72rem;color:var(--muted);font-weight:600;line-height:1.4}
.pi b{display:block;font-size:.88rem;font-weight:700;line-height:1.4}

/* কাউন্টডাউন */
.cd{margin:16px 0 0;border-radius:18px;padding:12px 14px;text-align:center;background:#fff4f2;border:1px solid #fdd8d2;color:#c8352a}
html[data-theme="dark"] .cd{background:rgba(230,68,52,.1);border-color:rgba(230,68,52,.25);color:#fca5a0}
.cd.open{background:var(--brand-ll);border-color:color-mix(in srgb,var(--brand) 25%,transparent);color:var(--brand)}
.cd small{display:block;font-size:.78rem;font-weight:700;opacity:.9}
.cd-row{display:flex;justify-content:center;align-items:flex-start;gap:6px;margin-top:6px}
.cd-u{min-width:54px;background:var(--card);border-radius:12px;padding:5px 6px;box-shadow:0 2px 8px rgba(0,0,0,.05)}
.cd-u b{display:block;font-size:1.3rem;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums;color:currentColor}
.cd-u i{display:block;font-style:normal;font-size:.64rem;color:var(--muted);font-weight:600}
.cd-sep{font-size:1.2rem;font-weight:700;padding-top:6px}
.cd.over .cd-row{display:none}
.pchip{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;font-weight:700}

/* বাটন */
.pd-cta{display:grid;gap:9px;margin-top:14px}
.apply-row{display:flex;flex-wrap:wrap;gap:9px}
.apply{flex:1 1 200px;display:inline-flex;align-items:center;justify-content:center;gap:9px;min-width:0;
  background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;padding:13px 20px;border-radius:16px;
  font-weight:700;font-size:.96rem;box-shadow:0 10px 22px rgba(15,118,110,.28);transition:.2s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apply:hover{filter:brightness(1.06);transform:translateY(-1px)}
.apply:active{transform:scale(.98)}
.pdf-dl{display:flex;align-items:center;justify-content:center;gap:9px;padding:12px 18px;border-radius:16px;border:1.5px solid #2563eb;
  color:#2563eb;background:var(--card);font-weight:700;font-size:.92rem;transition:.18s}
.pdf-dl i{color:#e0493a}
.pdf-dl:hover{background:#2563eb;color:#fff}
.pdf-dl:hover i{color:#fff}
html[data-theme="dark"] .pdf-dl{color:#7aa7ff;border-color:#3b6fd6}
.pd-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.pd-acts>a,.pd-acts>button,.pd-acts .share-btn{width:auto;height:auto;border-radius:14px;border:1px solid var(--line);background:var(--soft);
  display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 4px;font:inherit;font-size:.76rem;font-weight:600;color:var(--ink-2);transition:.18s}
.pd-acts i{font-size:1rem;color:var(--brand)}
.pd-acts>*:hover{border-color:var(--brand);color:var(--brand);background:var(--brand-l);transform:none}
.pd-acts .save.on{background:var(--brand);border-color:var(--brand);color:#fff}
.pd-acts .save.on i{color:#fff}
.pd-acts .save.on i::before{font-weight:900}

/* ছবি — ব্যানারের মাপে (৮৫৬×২৯২) */
.gal{margin:18px 0 0}
.gal-main{position:relative;width:100%;aspect-ratio:856/292;border-radius:16px;overflow:hidden;background:var(--soft);cursor:zoom-in;box-shadow:var(--sh)}
.gal-main img{width:100%;height:100%;object-fit:cover;display:block;transition:opacity .2s,transform .35s}
.gal-main:hover img{transform:scale(1.02)}
.gal-main .zi{position:absolute;bottom:9px;right:9px;width:31px;height:31px;border-radius:50%;
  background:rgba(9,25,22,.6);color:#fff;display:grid;place-items:center;font-size:.76rem;backdrop-filter:blur(3px)}
.gal-count{position:absolute;bottom:9px;left:9px;background:rgba(9,25,22,.6);color:#fff;
  font-size:.72rem;font-weight:600;padding:3px 11px;border-radius:999px;backdrop-filter:blur(3px)}
.gal-thumbs{display:flex;gap:8px;margin-top:9px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.gal-thumbs::-webkit-scrollbar{display:none}
.gal-th{flex:none;width:96px;aspect-ratio:856/292;border-radius:10px;overflow:hidden;background:var(--soft);
  border:2px solid transparent;cursor:pointer;padding:0;transition:.18s;opacity:.7}
.gal-th img{width:100%;height:100%;object-fit:cover;display:block}
.gal-th.on{border-color:var(--brand);opacity:1}
.gal-th:hover{opacity:1}

/* লেখার অংশ */
.pd-sec{display:flex;align-items:center;gap:9px;margin:22px 0 0;padding-bottom:10px;border-bottom:2px solid var(--line-2);font-size:1rem;font-weight:700}
.pd-sec i{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:var(--brand-l);color:var(--brand);font-size:.8rem}
.pd-body{font-size:1rem;line-height:1.95;color:var(--ink-2);word-break:break-word;margin-top:12px}
.pd-body>*:first-child{margin-top:0}
.pd-body h2,.pd-body h3,.pd-body h4{margin:22px 0 10px;font-weight:700;line-height:1.5;color:var(--ink);
  padding-left:11px;border-left:3px solid var(--brand);border-radius:2px}
.pd-body h2{font-size:1.1rem}.pd-body h3{font-size:1.02rem}.pd-body h4{font-size:.97rem}
.pd-body p{margin:0 0 14px}
.pd-body ul,.pd-body ol{margin:0 0 16px;padding-left:2px;list-style:none}
.pd-body ol{counter-reset:li}
.pd-body li{position:relative;margin-bottom:8px;padding-left:22px}
.pd-body ul li::before{content:"";position:absolute;left:4px;top:.72em;width:7px;height:7px;border-radius:50%;background:var(--brand)}
.pd-body ol li{counter-increment:li;padding-left:29px}
.pd-body ol li::before{content:counter(li);position:absolute;left:0;top:.2em;width:21px;height:21px;border-radius:50%;
  background:var(--brand-l);color:var(--brand);font-size:.72rem;font-weight:700;display:grid;place-items:center}
.pd-body a{color:var(--brand);font-weight:600;text-decoration:underline;text-underline-offset:3px;word-break:break-word}
.pd-body a[style*="background"],.pd-body a[href^="tel:"],.pd-body a[href*="wa.me"],.pd-body a[href^="mailto:"]{text-decoration:none !important;word-break:normal}
.apply,.lnk,.sh-row a{text-decoration:none !important}
.pd-body img{border-radius:12px;margin:12px 0}
.pd-body a[href^="tel:"],.pd-body a[href*="wa.me"],.pd-body a[style*="background"]{
  display:inline-flex !important;align-items:center;gap:7px;padding:7px 15px !important;font-size:13px !important;font-weight:600 !important;
  border-radius:999px !important;margin:4px 6px 4px 0 !important;text-decoration:none !important;line-height:1.6}
.pd-body a[href^="tel:"] i,.pd-body a[href*="wa.me"] i{margin:0 !important}
.pd-body table{width:100%;border-collapse:collapse;margin:14px 0;font-size:.92rem;display:block;overflow-x:auto}
.pd-body th,.pd-body td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
.pd-body th{background:var(--soft);font-weight:600}
.pd-body blockquote{margin:14px 0;padding:11px 15px;background:var(--soft);border-left:3px solid var(--brand);border-radius:12px;color:var(--ink-2)}

/* লিংক */
.lnk-box{margin-top:18px;display:grid;gap:9px}
.lnk{display:flex;align-items:center;gap:11px;padding:10px 13px;background:var(--soft);border:1px solid var(--line);border-radius:16px;font-weight:600;font-size:.9rem;transition:.18s}
.lnk:hover{background:var(--brand-l);border-color:var(--brand);transform:translateY(-1px)}
.lnk .lnk-ic{width:38px;height:38px;flex:none;border-radius:12px;display:grid;place-items:center;color:#fff;font-size:.92rem;background:var(--brand)}
.lnk.mail .lnk-ic{background:#d6533f}.lnk.tel .lnk-ic{background:#2a62c9}.lnk.wa .lnk-ic{background:#25d366}
.lnk .lnk-t{flex:1;min-width:0}
.lnk .lnk-t b{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lnk .lnk-t small{display:block;font-size:.76rem;font-weight:500;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:left}
.lnk .go{flex:none;display:inline-flex;align-items:center;gap:6px;color:var(--brand);font-size:.82rem}

.sh-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}
.sh-row b{font-size:.86rem;margin-right:4px}
.sh-row a{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:1rem;line-height:1;color:#fff;transition:.18s;flex:none}
.sh-row a.fb{background:#1877f2}.sh-row a.tw{background:#111}.sh-row a.wa{background:#25d366}.sh-row a.tg{background:#29a9eb}
.sh-row a:hover{transform:translateY(-2px)}
.sh-row .share-btn{width:40px;height:40px}

.rel-wrap{margin:30px 0 34px}
.rel-wrap .sec-title{margin-top:0}

@media(max-width:700px){
  .pd{padding:15px;border-radius:22px}
  .pd h1{font-size:1.1rem}
  .pd-logo{width:56px;height:56px;border-radius:17px}
  .pd-top{gap:12px}
  .pd-org{font-size:.78rem}
  .pd-stats{gap:6px}
  .pst{padding:9px;border-radius:14px}
  .pst b{font-size:.8rem}
  .pst span{font-size:.66rem}
  .pd-info{gap:0 10px}
  .pi{gap:8px}
  .pi .ic{width:30px;height:30px;font-size:.76rem}
  .pi b{font-size:.8rem}
  .pd-body{font-size:.96rem;line-height:1.9}
  .apply{padding:12px 16px;font-size:.92rem}
  .lnk .go span{display:none}
  .gal-th{width:78px}
  .rel-wrap{margin:24px 0 26px}
  .cd-u{min-width:48px}
  .cd-u b{font-size:1.12rem}
}
CSS);

$canonical = post_url($post);
$ogImg     = $post['thumb'] ? img_url($post['thumb']) : ($images ? img_url($images[0]['image']) : default_og());
$metaTitle = $post['meta_title'] ?: ($post['title'] . ' | ' . setting('site_name', 'চাকরি সার্কুলার'));
$metaDesc  = $post['meta_desc'] ?: excerpt($post['content'], 160);

$schema = [[
  '@type' => 'BreadcrumbList',
  'itemListElement' => [
    ['@type' => 'ListItem', 'position' => 1, 'name' => 'হোম', 'item' => url()],
    ['@type' => 'ListItem', 'position' => 2, 'name' => $post['cat_name'] ?: 'পোস্ট', 'item' => cat_url($post['cat_slug'] ?: '')],
    ['@type' => 'ListItem', 'position' => 3, 'name' => $post['title'], 'item' => $canonical],
  ],
]];
/* চাকরি হলে JobPosting schema */
$isJob = in_array($post['cat_slug'], ['chakri', 'job', 'chakri-circular'], true) || (int)$post['is_job'] === 1;
if ($isJob) {
    $schema[] = array_filter([
        '@type' => 'JobPosting',
        'title' => $post['title'],
        'description' => schema_description(format_content($post['content'])) ?: $post['title'],
        'datePosted' => date('Y-m-d', strtotime($post['published_at'])),
        'validThrough' => $post['deadline'] ? date('Y-m-d\TH:i:s', strtotime($post['deadline'] . ' 23:59:59')) : null,
        'employmentType' => $post['employment_type'] ?: 'FULL_TIME',
        /* সংখ্যায় বেতন দিলেই কেবল গুগলে পাঠাই ("আলোচনা সাপেক্ষে" পাঠালে গুগল ভুল ধরে) */
        'baseSalary' => (function () use ($post) {
            $raw = trim((string)($post['salary'] ?? ''));
            if ($raw === '') return null;
            $en  = strtr($raw, ['০'=>'0','১'=>'1','২'=>'2','৩'=>'3','৪'=>'4','৫'=>'5','৬'=>'6','৭'=>'7','৮'=>'8','৯'=>'9']);
            if (!preg_match_all('/\d[\d,]*/', $en, $m)) return null;
            $nums = array_map(function ($x) { return (float)str_replace(',', '', $x); }, $m[0]);
            $nums = array_values(array_filter($nums, function ($n) { return $n > 0; }));
            if (!$nums) return null;
            $val = count($nums) >= 2
                ? ['@type' => 'QuantitativeValue', 'minValue' => min($nums), 'maxValue' => max($nums), 'unitText' => 'MONTH']
                : ['@type' => 'QuantitativeValue', 'value' => $nums[0], 'unitText' => 'MONTH'];
            return ['@type' => 'MonetaryAmount', 'currency' => 'BDT', 'value' => $val];
        })(),
        'hiringOrganization' => ['@type' => 'Organization', 'name' => $post['company'] ?: 'চাকরি সার্কুলার', 'sameAs' => url()],
        /* "সারাদেশ"/"একাধিক" লেখা থাকলে সেটি জেলা/বিভাগ হিসেবে না পাঠিয়ে
           পুরো বাংলাদেশ বোঝাই — নাহলে গুগল ভুল জায়গা ধরে নেয় */
        'jobLocation' => (function () use ($post) {
            $wide = ['সারাদেশ', 'সারা দেশ', 'সারা-দেশ', 'একাধিক', 'সব জেলা', 'সকল জেলা', 'দেশব্যাপী', 'anywhere', 'all'];
            $norm = function ($v) use ($wide) {
                $v = trim((string)$v);
                if ($v === '') return null;
                foreach ($wide as $w) if (mb_strtolower($v, 'UTF-8') === mb_strtolower($w, 'UTF-8')) return null;
                return $v;
            };
            $loc = $norm($post['district'] ?? '');
            $reg = $norm($post['division'] ?? '');
            $addr = array_filter([
                '@type' => 'PostalAddress',
                'addressLocality' => $loc,
                'addressRegion'   => $reg,
                'addressCountry'  => 'BD',
            ]);
            return ['@type' => 'Place', 'address' => $addr];
        })(),
        /* জেলা/বিভাগ না থাকলে বা "সারাদেশ" হলে — পুরো দেশের জন্য প্রযোজ্য */
        'applicantLocationRequirements' => (function () use ($post) {
            $wide = ['সারাদেশ', 'সারা দেশ', 'একাধিক', 'সব জেলা', 'সকল জেলা', 'দেশব্যাপী'];
            $d = trim((string)($post['district'] ?? ''));
            $v = trim((string)($post['division'] ?? ''));
            $isWide = ($d === '' && $v === '');
            foreach ($wide as $w) {
                if (mb_strtolower($d, 'UTF-8') === mb_strtolower($w, 'UTF-8')) $isWide = true;
                if (mb_strtolower($v, 'UTF-8') === mb_strtolower($w, 'UTF-8')) $isWide = true;
            }
            return $isWide ? ['@type' => 'Country', 'name' => 'Bangladesh'] : null;
        })(),
        'directApply' => true,
        'identifier' => ['@type' => 'PropertyValue', 'name' => setting('site_name', 'চাকরি সার্কুলার'), 'value' => (string)$post['id']],
    ]);
} else {
    $schema[] = [
        '@type' => 'NewsArticle',
        'headline' => mb_substr($post['title'], 0, 110, 'UTF-8'),
        'image' => [$ogImg],
        'datePublished' => date('c', strtotime($post['published_at'])),
        'dateModified'  => date('c', strtotime($post['updated_at'] ?: $post['published_at'])),
        'author' => ['@type' => 'Organization', 'name' => setting('site_name', 'চাকরি সার্কুলার')],
        'publisher' => ['@id' => url('#organization')],
        'mainEntityOfPage' => $canonical,
    ];
}

$P = [
  'title' => $metaTitle, 'desc' => $metaDesc, 'canonical' => $canonical,
  'og' => $ogImg, 'og_type' => 'article', 'nav' => 'category', 'schema' => $schema,
];

$enc = rawurlencode($canonical); $enct = rawurlencode($post['title']);
?>
<?php
  $jobTypes = ['FULL_TIME' => 'ফুল টাইম', 'PART_TIME' => 'পার্ট টাইম', 'CONTRACTOR' => 'চুক্তিভিত্তিক',
               'TEMPORARY' => 'অস্থায়ী', 'INTERN' => 'ইন্টার্ন', 'OTHER' => 'অন্যান্য'];
  $jType = $post['employment_type'] ? ($jobTypes[$post['employment_type']] ?? $post['employment_type']) : '';
  /* বেতন — শুধু চাকরির পোস্টে */
  $isJobPost = in_array($post['cat_slug'], ['chakri', 'job', 'chakri-circular', 'chakrir-khobor'], true) || (int)$post['is_job'] === 1;
  $salaryTxt = '';
  if ($isJobPost) {
    $sv = trim((string)($post['salary'] ?? ''));
    $salaryTxt = $sv !== '' ? $sv : 'আলোচনা সাপেক্ষে';
  }
  $loc = trim((string)$post['district']) ?: trim((string)$post['division']);
  $hasDl = $post['deadline'] && $dl['state'] !== 'none';
  $isNew = (time() - strtotime($post['published_at'])) < 172800;
  $logo = $post['thumb'] ? img_url($post['thumb']) : default_thumb();
  $tone = cat_tone($post['cat_slug'] ?: $post['cat_name']);
  $applyLinks = array_filter($links, fn($l) => (int)$l['is_apply'] === 1);
  $hasPdf = $post['pdf'] && $pdfPath && file_exists($pdfPath);
?>
<article class="pd">
  <p class="crumb">
    <a href="<?= e(url()) ?>"><i class="fa fa-house"></i></a> <i class="fa fa-chevron-right"></i>
    <?php if ($post['cat_name']): ?><a href="<?= e(cat_url($post['cat_slug'])) ?>"><?= e($post['cat_name']) ?></a> <i class="fa fa-chevron-right"></i><?php endif; ?>
    <span>বিস্তারিত</span>
  </p>

  <div class="pd-top">
    <span class="pd-logo"><img src="<?= e($logo) ?>" alt="" width="66" height="66"></span>
    <div style="min-width:0;flex:1">
      <div class="pd-tags">
        <?php if ($post['cat_name']): ?><span class="pd-tag tone-<?= $tone ?>"><?= e($post['cat_name']) ?></span><?php endif; ?>
        <?php if ($isNew): ?><span class="pd-tag new">নতুন</span><?php endif; ?>
      </div>
      <h1><?= e($post['title']) ?></h1>
      <div class="pd-org">
        <?php if ($post['company']): ?><span><i class="fa fa-building"></i><?= e($post['company']) ?></span><?php endif; ?>
        <?php if ($loc): ?><span class="loc"><i class="fa fa-location-dot"></i><?= e($loc) ?></span><?php endif; ?>
        <span><i class="fa fa-clock"></i><?= e(time_ago($post['published_at'])) ?></span>
      </div>
    </div>
  </div>

  <?php if (is_premium($post)): ?>
    <div class="prem-strip"><span class="cr">👑</span>প্রিমিয়াম পোস্ট<small>প্রতিষ্ঠানের অনুরোধে প্রচারিত</small></div>
  <?php endif; ?>

  <?php if ($post['vacancy'] || $salaryTxt || $hasDl): ?>
  <div class="pd-stats">
    <div class="pst"><span><i class="fa fa-user-group"></i>পদ সংখ্যা</span><b><?= $post['vacancy'] ? e(bn($post['vacancy'])) . ' টি' : '—' ?></b></div>
    <div class="pst sal"><span><i class="fa fa-sack-dollar"></i>বেতন</span><b title="<?= e($salaryTxt) ?>"><?= $salaryTxt ? e($salaryTxt) : '—' ?></b></div>
    <div class="pst dl"><span><i class="fa fa-calendar-xmark"></i>শেষ তারিখ</span><b><?= $hasDl ? e(bn_date($post['deadline'])) : '—' ?></b></div>
  </div>
  <?php endif; ?>

  <?php if ($post['division'] || $post['district'] || $jType || $post['company']): ?>
  <div class="pd-info">
    <?php if ($post['company']): ?><div class="pi"><span class="ic"><i class="fa fa-landmark"></i></span><span><small>প্রতিষ্ঠানের নাম</small><b><?= e($post['company']) ?></b></span></div><?php endif; ?>
    <?php if ($jType): ?><div class="pi"><span class="ic"><i class="fa fa-briefcase"></i></span><span><small>চাকরির ধরন</small><b><?= e($jType) ?></b></span></div><?php endif; ?>
    <?php if ($post['district']): ?><div class="pi"><span class="ic"><i class="fa fa-location-dot"></i></span><span><small>জেলা</small><b><?= e($post['district']) ?></b></span></div><?php endif; ?>
    <?php if ($post['division']): ?><div class="pi"><span class="ic"><i class="fa fa-map"></i></span><span><small>বিভাগ</small><b><?= e($post['division']) ?></b></span></div><?php endif; ?>
    <div class="pi"><span class="ic"><i class="fa fa-calendar-plus"></i></span><span><small>প্রকাশের তারিখ</small><b><?= e(bn_date($post['published_at'])) ?></b></span></div>
  </div>
  <?php endif; ?>

  <?php if ($hasDl): ?>
    <div class="cd <?= $dl['state'] === 'over' ? 'over' : ($dl['state'] === 'open' ? 'open' : '') ?>" data-countdown="<?= e($post['deadline']) ?>">
      <small><i class="fa fa-hourglass-half"></i> <span class="pchip" data-deadline="<?= e($post['deadline']) ?>"><?= e($dl['text']) ?></span></small>
      <div class="cd-row">
        <span class="cd-u"><b data-u="d">০</b><i>দিন</i></span><span class="cd-sep">:</span>
        <span class="cd-u"><b data-u="h">০</b><i>ঘন্টা</i></span><span class="cd-sep">:</span>
        <span class="cd-u"><b data-u="m">০</b><i>মিনিট</i></span><span class="cd-sep">:</span>
        <span class="cd-u"><b data-u="s">০</b><i>সেকেন্ড</i></span>
      </div>
    </div>
  <?php endif; ?>

  <?php if ($applyLinks || $hasPdf): ?>
  <div class="pd-cta">
    <?php if ($applyLinks): ?>
      <div class="apply-row">
        <?php foreach ($applyLinks as $l): ?>
          <a class="apply" href="<?= e($l['url']) ?>" target="_blank" rel="noopener" data-no-spa>
            <i class="fa fa-paper-plane"></i><?= e($l['label'] ?: 'অনলাইনে আবেদন করুন') ?>
          </a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
    <?php if ($hasPdf): ?>
      <a class="pdf-dl" href="<?= e(UPLOAD_URL . '/pdf/' . $post['pdf']) ?>" download data-no-spa aria-label="পিডিএফ ডাউনলোড করুন">
        <i class="fa fa-file-pdf"></i><span>বিজ্ঞপ্তির PDF দেখুন</span>
      </a>
    <?php endif; ?>
  </div>
  <?php endif; ?>

  <div class="pd-acts">
    <?= share_button($post['title'], $canonical, $post['cat_name'] ?? '') ?>
    <button type="button" class="save" data-save="<?= e($canonical) ?>" data-title="<?= e($post['title']) ?>"
            data-img="<?= e($logo) ?>" data-cat="<?= e($post['cat_name'] ?? '') ?>" data-org="<?= e($post['company'] ?? '') ?>"
            data-dl="<?= e($post['deadline'] ?? '') ?>" aria-pressed="false"><i class="fa-regular fa-bookmark"></i><span class="lbl">সেভ</span></button>
    <a href="<?= e(url('report')) ?>"><i class="fa fa-flag"></i>রিপোর্ট</a>
  </div>

  <?php if ($images): $first = img_url($images[0]['image']); ?>
    <div class="gal" id="postGal">
      <div class="gal-main" data-zoom="<?= e($first) ?>" id="galMain">
        <img src="<?= e($first) ?>" alt="<?= e($post['title']) ?>" width="856" height="292" decoding="async">
        <?php if (count($images) > 1): ?>
          <span class="gal-count"><span id="galIdx">১</span>/<?= bn(count($images)) ?></span>
        <?php endif; ?>
        <span class="zi"><i class="fa fa-magnifying-glass-plus"></i></span>
      </div>
      <?php if (count($images) > 1): ?>
        <div class="gal-thumbs">
          <?php foreach ($images as $i => $im): ?>
            <button type="button" class="gal-th<?= $i === 0 ? ' on' : '' ?>"
                    data-gal="<?= e(img_url($im['image'])) ?>" data-i="<?= bn($i + 1) ?>" aria-label="ছবি <?= bn($i + 1) ?>">
              <img src="<?= e(img_url($im['image'])) ?>" alt="" loading="lazy" decoding="async">
            </button>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>
    </div>
  <?php endif; ?>

  <div class="pd-sec"><i class="fa fa-file-lines"></i>বিস্তারিত বিবরণ</div>
  <div class="pd-body"><?= format_content($post['content']) ?></div>

  <?php $otherLinks = array_filter($links, fn($l) => (int)$l['is_apply'] !== 1); ?>
  <?php if ($otherLinks): ?>
    <div class="pd-sec"><i class="fa fa-link"></i>গুরুত্বপূর্ণ লিংক</div>
    <div class="lnk-box">
      <?php foreach ($otherLinks as $l):
        $u = (string)$l['url'];
        if (stripos($u, 'mailto:') === 0) {
            $kind = 'mail'; $ic = 'fa-envelope'; $def = 'ইমেইল করুন'; $go = 'মেইল'; $shown = substr($u, 7);
        } elseif (stripos($u, 'tel:') === 0) {
            $kind = 'tel'; $ic = 'fa-phone'; $def = 'ফোন করুন'; $go = 'কল'; $shown = substr($u, 4);
        } elseif (stripos($u, 'wa.me/') !== false) {
            $kind = 'wa'; $ic = 'fa-brands fa-whatsapp'; $def = 'হোয়াটসঅ্যাপ'; $go = 'চ্যাট';
            $shown = '+' . preg_replace('~^.*wa\.me/~i', '', $u);
        } else {
            $kind = 'web'; $ic = 'fa-link'; $def = 'লিংক'; $go = 'ওপেন'; $shown = '';
        }
      ?>
        <a class="lnk <?= $kind ?>" href="<?= e($u) ?>" <?= $kind === 'web' || $kind === 'wa' ? 'target="_blank" rel="noopener"' : '' ?> data-no-spa>
          <span class="lnk-ic"><i class="fa <?= e($ic) ?>"></i></span>
          <span class="lnk-t">
            <b><?= e($l['label'] ?: $def) ?></b>
            <?php if ($shown): ?><small><?= e($shown) ?></small><?php endif; ?>
          </span>
          <span class="go"><span><?= e($go) ?></span> <i class="fa <?= $kind === 'web' ? 'fa-arrow-up-right-from-square' : 'fa-chevron-right' ?>"></i></span>
        </a>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>

  <div class="sh-row">
    <b>শেয়ার করুন:</b>
    <a href="https://www.facebook.com/sharer/sharer.php?u=<?= $enc ?>" target="_blank" rel="noopener" class="fb" aria-label="Facebook" data-no-spa><i class="fa-brands fa-facebook-f"></i></a>
    <a href="https://twitter.com/intent/tweet?text=<?= $enct ?>&url=<?= $enc ?>" target="_blank" rel="noopener" class="tw" aria-label="X" data-no-spa><i class="fa-brands fa-x-twitter"></i></a>
    <a href="https://api.whatsapp.com/send?text=<?= $enct ?>%20<?= $enc ?>" target="_blank" rel="noopener" class="wa" aria-label="WhatsApp" data-no-spa><i class="fa-brands fa-whatsapp"></i></a>
    <a href="https://t.me/share/url?url=<?= $enc ?>&text=<?= $enct ?>" target="_blank" rel="noopener" class="tg" aria-label="Telegram" data-no-spa><i class="fa-brands fa-telegram"></i></a>
  </div>
</article>

<?php if ($related): ?>
  <div class="rel-wrap">
    <div class="sec-title">
      <div class="sec-l">
        <span class="sec-ic"><i class="fa fa-layer-group"></i></span>
        <h2>সম্পর্কিত পোস্ট<small>একই ক্যাটাগরির আরও</small></h2>
      </div>
      <a class="cnt-pill" href="<?= e(cat_url($post['cat_slug'])) ?>">সব দেখুন <i class="fa fa-arrow-right"></i></a>
    </div>
    <div class="plist">
      <?php foreach ($related as $r) post_card($r); ?>
    </div>
  </div>
<?php endif; ?>

<?php

/* থাম্বনেইলে চাপ দিলে উপরের বড় ছবি বদলায় */
js_once('post_gallery', <<<'JS'
document.addEventListener('click', function (e) {
  var t = e.target.closest('.gal-th');
  if (!t) return;
  var wrap = t.closest('.gal'); if (!wrap) return;
  var main = wrap.querySelector('.gal-main'), img = main && main.querySelector('img');
  if (!img) return;
  var src = t.getAttribute('data-gal');
  img.style.opacity = '.35';
  var pre = new Image();
  pre.onload = function () { img.src = src; img.style.opacity = '1'; };
  pre.onerror = function () { img.src = src; img.style.opacity = '1'; };
  pre.src = src;
  main.setAttribute('data-zoom', src);
  var idx = wrap.querySelector('#galIdx');
  if (idx) idx.textContent = t.getAttribute('data-i');
  wrap.querySelectorAll('.gal-th').forEach(function (b) { b.classList.remove('on'); });
  t.classList.add('on');
});
JS);

/* আবেদনের বাকি সময় — দিন : ঘন্টা : মিনিট : সেকেন্ড */
js_once('post_countdown', <<<'JS'
(function () {
  var timer = null;
  function bn(n) { return String(n).replace(/[0-9]/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; }); }
  function pad(n) { return bn(n < 10 ? '0' + n : n); }
  function run() {
    clearInterval(timer);
    var box = document.querySelector('[data-countdown]');
    if (!box) return;
    var end = new Date(box.getAttribute('data-countdown') + 'T23:59:59+06:00').getTime();
    function tick() {
      if (!document.body.contains(box)) { clearInterval(timer); return; }
      var diff = end - Date.now();
      if (diff <= 0) { box.classList.add('over'); clearInterval(timer); return; }
      var d = Math.floor(diff / 86400000), h = Math.floor(diff % 86400000 / 3600000),
          m = Math.floor(diff % 3600000 / 60000), s = Math.floor(diff % 60000 / 1000);
      box.querySelector('[data-u="d"]').textContent = bn(d);
      box.querySelector('[data-u="h"]').textContent = pad(h);
      box.querySelector('[data-u="m"]').textContent = pad(m);
      box.querySelector('[data-u="s"]').textContent = pad(s);
    }
    tick(); timer = setInterval(tick, 1000);
  }
  document.addEventListener('spa:ready', run); run();
})();
JS);
css_once('post_share_label', '.pd-acts .share-btn::after{content:"শেয়ার";font-size:.76rem}');
