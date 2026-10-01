<?php
/**
 * Front controller. Serves full pages on first load and JSON fragments
 * for AJAX navigation (X-Requested-With: fetch). Rendered fragments are
 * cached per page + language and cleared whenever the admin saves.
 */
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

if (!is_installed()) {
    header('Location: install/');
    exit;
}

require ROOT . '/includes/components.php';

$routes = ['home', 'services', 'service', 'portfolio', 'about', 'contact'];
$page   = (string) ($_GET['p'] ?? 'home');
$page   = in_array($page, $routes, true) ? $page : '404';
$slug   = preg_replace('/[^a-z0-9-]/', '', strtolower((string) ($_GET['slug'] ?? '')));
$lang   = lang();

$cacheKey = $page . ($slug !== '' ? '-' . $slug : '') . '-' . $lang;
$data = cache_get($cacheKey);

if ($data === null) {
    $title  = '';
    $status = $page === '404' ? 404 : 200;
    ob_start();
    include ROOT . '/pages/' . $page . '.php';
    $data = ['title' => $title, 'html' => ob_get_clean(), 'page' => $page, 'status' => $status];
    if ($status === 200) {
        cache_put($cacheKey, $data);
    }
}

track_visit();

$siteName  = setting('site_name', 'CodeNexa');
$fullTitle = ($data['title'] !== '' ? $data['title'] . ' | ' : '') . $siteName;

http_response_code((int) $data['status']);
header('Vary: X-Requested-With, Cookie');
header('Cache-Control: private, no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

if (extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    ob_start('ob_gzhandler');
}

if (is_ajax()) {
    json_out(['title' => $fullTitle, 'html' => $data['html'], 'page' => $data['page']], (int) $data['status']);
}

include ROOT . '/includes/layout.php';
