<?php
/* =========================================================
   CakriCircular – Front Controller
   সব রিকোয়েস্ট এখানে আসে (clean URL, .php দেখা যায় না)
   ========================================================= */
require __DIR__ . '/config/config.php';
require __DIR__ . '/config/db.php';
require __DIR__ . '/config/helpers.php';

/* ইনস্টল না হলে ইনস্টলারে পাঠাই */
if (!file_exists(APP_ROOT . '/install.lock') && file_exists(APP_ROOT . '/install.php')) {
    header('Location: ' . url('install.php')); exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = rawurldecode(trim((string)$path, '/'));
$seg  = $path === '' ? [] : explode('/', $path);
$s0   = $seg[0] ?? '';

/* ---------- Admin (গোপন পথ, এডমিন সেটিং থেকে বদলানো যায়) ---------- */
if ($s0 !== '' && $s0 === setting('admin_slug', DEFAULT_ADMIN_SLUG)) {
    $ADMIN_SEG = array_slice($seg, 1);
    require APP_ROOT . '/admin/app.php';
    exit;
}

/* ---------- API ---------- */
if ($s0 === 'api') { $API_ACTION = $seg[1] ?? ''; require APP_ROOT . '/app/api.php'; exit; }

ensure_trash_column();
ensure_salary_column();
ensure_premium_columns();
ensure_auto_schema();
ensure_auto_fails();
ensure_auto_fix3();
prune_visits();

/* ---------- প্রতিটি HTML রেসপন্স সবসময় টাটকা (লাইভ আপডেট) ---------- */
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-CC-Ver: ' . content_ver());

/* ---------- PWA: ম্যানিফেস্ট ও সার্ভিস ওয়ার্কার ---------- */
if ($s0 === 'manifest.webmanifest') {
    header('Content-Type: application/manifest+json; charset=utf-8');
    $appName = setting('app_name', 'Cakricircular');
    echo json_encode([
        'id' => url(),
        'name' => $appName,
        'short_name' => $appName,
        'description' => setting('meta_description', 'চাকরি সার্কুলার — আজকের চাকরির খবর'),
        'start_url' => url() . '?src=app',
        'scope' => url(),
        'display' => 'standalone',
        'orientation' => 'portrait',
        'background_color' => '#ffffff',
        'theme_color' => '#06592f',
        'lang' => 'bn',
        'dir' => 'ltr',
        'icons' => [
            ['src' => app_icon(192), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
            ['src' => app_icon(512), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
            ['src' => app_icon(512, true), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
        ],
        /* এটি থাকলে ব্রাউজার বলতে পারে অ্যাপটি এখনো ইনস্টল আছে কিনা */
        'related_applications' => [
            ['platform' => 'webapp', 'url' => url('manifest.webmanifest')],
        ],
        'prefer_related_applications' => false,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
if ($s0 === 'favicon.ico') {
    /* গুগল সবার আগে /favicon.ico খোঁজে — লোগো থেকে বানানো PNG-টাই পাঠাই */
    $f = setting('favicon');
    $path = $f ? UPLOAD_PATH . '/site/' . $f : '';
    if (!$path || !is_file($path)) {
        $cand = UPLOAD_PATH . '/site/appicon-192.png';
        $path = is_file($cand) ? $cand : APP_ROOT . '/assets/img/icon-192.png';
    }
    if (is_file($path)) {
        $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $mime = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
                 'gif' => 'image/gif', 'svg' => 'image/svg+xml', 'ico' => 'image/x-icon'][$ext] ?? 'image/png';
        header('Content-Type: ' . $mime);
        header('Cache-Control: public, max-age=604800');
        header('Content-Length: ' . filesize($path));
        readfile($path);
    } else {
        http_response_code(404);
    }
    exit;
}

if ($s0 === 'sw.js') {
    header('Content-Type: application/javascript; charset=utf-8');
    header('Service-Worker-Allowed: /');
    header('Cache-Control: no-cache');
    echo "/* CakriCircular service worker — ভার্সন " . content_ver() . " */\n";
    readfile(APP_ROOT . '/assets/js/sw.js');
    exit;
}

/* ---------- sitemap / robots ---------- */
if ($s0 === 'sitemap.xml') { require APP_ROOT . '/app/sitemap.php'; exit; }
if ($s0 === 'robots.txt') {
    header('Content-Type: text/plain; charset=utf-8');
    /* এডমিনের ঠিকানা এখানে লিখি না — লিখলে যে কেউ robots.txt খুলে জেনে যেত।
       এডমিন পেজ এমনিতেই X-Robots-Tag: noindex পাঠায়। */
    echo "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /search\n\nSitemap: " . url('sitemap.xml') . "\n";
    exit;
}

/* ---------- মেইনটেন্যান্স মোড ---------- */
if (setting('maintenance', '0') === '1' && empty($_SESSION['admin_id'])) {
    http_response_code(503);
    header('Retry-After: 3600');
    header('Content-Type: text/html; charset=utf-8');
    require APP_ROOT . '/app/pages/maintenance.php';
    exit;
}

/* ---------- রাউট রেজলভ ---------- */
$route = ['file' => '404', 'params' => []];
$page  = 1;

/* /page/2 সাফিক্স ধরা */
$segCount = count($seg);
if ($segCount >= 2 && $seg[$segCount - 2] === 'page' && ctype_digit($seg[$segCount - 1])) {
    $page = max(1, (int)$seg[$segCount - 1]);
    $seg  = array_slice($seg, 0, $segCount - 2);
    $s0   = $seg[0] ?? '';
}

if ($s0 === '')                        $route = ['file' => 'home',     'params' => ['page' => $page]];
elseif ($s0 === 'category' && isset($seg[1])) $route = ['file' => 'category', 'params' => ['slug' => $seg[1], 'page' => $page]];
elseif ($s0 === 'post' && isset($seg[1]))     $route = ['file' => 'post',     'params' => ['slug' => $seg[1]]];
elseif ($s0 === 'search')              $route = ['file' => 'search',   'params' => ['page' => $page]];
elseif ($s0 === 'trending')            $route = ['file' => 'trending', 'params' => ['page' => $page]];
elseif ($s0 === 'promoted')            $route = ['file' => 'promoted', 'params' => ['page' => $page]];
elseif ($s0 === 'notices')             $route = ['file' => 'notices',  'params' => []];
elseif ($s0 === 'categories')          $route = ['file' => 'categories', 'params' => []];
elseif ($s0 === 'saved')               $route = ['file' => 'saved',    'params' => []];
elseif ($s0 === 'report')              $route = ['file' => 'report',   'params' => []];
elseif ($s0 === 'about' || $s0 === 'privacy') $route = ['file' => 'info', 'params' => ['key' => $s0]];

/* ---------- পেজ রেন্ডার ---------- */
$P = [];                       // পেজ মেটা (title, desc, og, canonical, schema, nav)
$pageFile = APP_ROOT . '/app/pages/' . $route['file'] . '.php';
if (!file_exists($pageFile)) $pageFile = APP_ROOT . '/app/pages/404.php';

$params = $route['params'];
ob_start();
require $pageFile;
$CONTENT = ob_get_clean();

if (($P['status'] ?? 200) === 404) http_response_code(404);

/* ভিজিটর ট্র্যাকিং */
/* SPA রিকোয়েস্টে গুনি না — পেজ বসার পর app.js একবারই /api/track এ পাঠায়,
   নইলে একই ভিজিট দুইবার (আর প্রিফেচে আরও বেশি) গোনা হতো */
if (!is_spa()) track_visit('/' . $path);

/* ---------- মেটা তৈরি ---------- */
$siteName  = setting('site_name', 'চাকরি সার্কুলার');
$title     = $P['title'] ?? $siteName;
$desc      = $P['desc']  ?? setting('meta_description', '');
$canonical = $P['canonical'] ?? url($path);
$ogImage   = $P['og'] ?? default_og();
/* শেয়ার কার্ডে SVG দেখায় না — থাকলে PNG-তে বদলে দিই */
if (preg_match('/\.svg($|\?)/i', $ogImage)) $ogImage = asset('img/default-og.png');
$schema    = $P['schema'] ?? [];
$navKey    = $P['nav'] ?? '';
$robots    = $P['robots'] ?? 'index, follow';

/* ---------- SPA হলে শুধু JSON ---------- */
if (is_spa()) {
    json_out([
        'ok'     => true,
        'title'  => $title,
        'html'   => $CONTENT,
        'css'    => collected_css(),
        'js'     => collected_js(),
        'meta'   => ['desc' => $desc, 'canonical' => $canonical, 'og' => $ogImage],
        'schema' => $schema,
        'nav'    => $navKey,
        'status' => $P['status'] ?? 200,
    ]);
}

/* ---------- ফুল পেজ (সরাসরি URL খুললে / SEO / প্রথম লোড) ----------
   লেআউট পার্টস আগে বাফার করি, যাতে প্রতিটি ফাইলের নিজস্ব CSS <head>-এ যায় */
ob_start(); require APP_ROOT . '/partials/header.php';    $HEADER = ob_get_clean();
ob_start(); require APP_ROOT . '/partials/sidebar.php';   $SIDEBAR = ob_get_clean();
ob_start(); require APP_ROOT . '/partials/footer.php';    $FOOTER = ob_get_clean();
ob_start(); require APP_ROOT . '/partials/bottomnav.php'; $BOTTOMNAV = ob_get_clean();
?>
<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#06592f">
<script>try{if(localStorage.getItem('cc_theme')==='dark'){document.documentElement.setAttribute('data-theme','dark');document.querySelector('meta[name="theme-color"]').setAttribute('content','#03251a');}}catch(e){}</script>
<title><?= e($title) ?></title>
<meta name="description" content="<?= e($desc) ?>">
<?php if ($kw = setting('meta_keywords')): ?><meta name="keywords" content="<?= e($kw) ?>"><?php endif; ?>
<link rel="canonical" href="<?= e($canonical) ?>">
<meta name="robots" content="<?= e($robots) ?>, max-image-preview:large">

<meta property="og:site_name" content="<?= e($siteName) ?>">
<meta property="og:type" content="<?= e($P['og_type'] ?? 'website') ?>">
<meta property="og:title" content="<?= e($title) ?>">
<meta property="og:description" content="<?= e($desc) ?>">
<meta property="og:url" content="<?= e($canonical) ?>">
<meta property="og:image" content="<?= e($ogImage) ?>">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="bn_BD">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<?= e($title) ?>">
<meta name="twitter:description" content="<?= e($desc) ?>">
<meta name="twitter:image" content="<?= e($ogImage) ?>">

<link rel="icon" href="<?= e(url('favicon.ico')) ?>" sizes="any">
<link rel="icon" type="image/png" sizes="192x192" href="<?= e(app_icon(192)) ?>">
<link rel="shortcut icon" href="<?= e(url('favicon.ico')) ?>">
<link rel="manifest" href="<?= e(url('manifest.webmanifest')) ?>">
<link rel="apple-touch-icon" href="<?= e(app_icon(180)) ?>">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="<?= e(setting('app_name', 'Cakricircular')) ?>">
<meta name="mobile-web-app-capable" content="yes">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">

<?php if ($v = setting('google_verification')): ?><meta name="google-site-verification" content="<?= e($v) ?>"><?php endif; ?>

<script type="application/ld+json"><?= json_encode([
  '@context' => 'https://schema.org', '@graph' => array_merge([
    [
      '@type' => 'Organization',
      '@id'   => url('#organization'),
      'name'  => 'চাকরি সার্কুলার',
      'alternateName' => ['CakriCircular', 'CakriCircular.com', 'চাকরির সার্কুলার', 'চাকরির খবর', 'আজকের চাকরি'],
      'url'   => url(),
      'logo'  => ['@type' => 'ImageObject', 'url' => site_logo()],
      'email' => setting('contact_email', ''),
      'address' => ['@type' => 'PostalAddress', 'addressCountry' => 'BD', 'addressLocality' => setting('location', 'Bangladesh')],
      'sameAs' => array_values(array_filter([setting('fb'), setting('twitter'), setting('telegram')])),
    ],
    [
      '@type' => 'WebSite',
      '@id'   => url('#website'),
      'url'   => url(),
      'name'  => $siteName,
      'inLanguage' => 'bn-BD',
      'publisher'  => ['@id' => url('#organization')],
      'potentialAction' => [
        '@type' => 'SearchAction',
        'target' => ['@type' => 'EntryPoint', 'urlTemplate' => url('search') . '?q={search_term_string}'],
        'query-input' => 'required name=search_term_string',
      ],
    ],
  ], $schema)
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>

<?php foreach (collected_css() as $k => $css): ?>
<style data-k="<?= e($k) ?>"><?= $css ?></style>
<?php endforeach; ?>
</head>
<body data-nav="<?= e($navKey) ?>">

<?= $HEADER ?>
<?= $SIDEBAR ?>

<div id="spa-progress"><span></span></div>

<main id="app" class="container" data-page="<?= e($route['file']) ?>"><?= $CONTENT ?></main>

<?= $FOOTER ?>
<?= $BOTTOMNAV ?>

<script>
/* অ্যাপ ইনস্টলের সুযোগ ব্রাউজার খুব আগেই দেয় — app.js লোড হওয়ার আগেই ধরে রাখি */
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__ccBIP = e; });
window.addEventListener('appinstalled', function () { try { localStorage.setItem('cc_installed', '1'); } catch (x) {} });
window.CC = {
  base: <?= json_encode(url()) ?>,
  siteName: <?= json_encode($siteName) ?>,
  defaultOg: <?= json_encode(default_og()) ?>,
  csrf: <?= json_encode(csrf_token()) ?>,
  ver: <?= json_encode(content_ver()) ?>,
  appName: <?= json_encode(setting('app_name', 'Cakricircular')) ?>
};
</script>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
<?php foreach (collected_js() as $k => $js): ?>
<script data-k="<?= e($k) ?>"><?= $js ?></script>
<?php endforeach; ?>
</body>
</html>
