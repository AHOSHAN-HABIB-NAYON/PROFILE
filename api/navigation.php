<?php
/**
 * SPA navigation endpoint: GET /api/navigation?path=/news/12?x=y
 * Renders only the page content and returns it as JSON.
 */
defined('APP') || exit;

$raw = (string)($_GET['path'] ?? '/');
if (strlen($raw) > 1000) fail(t('err.bad_request'), 400);
$parts = parse_url('http://x' . (str_starts_with($raw, '/') ? $raw : '/' . $raw));
$path = '/' . trim(rawurldecode($parts['path'] ?? '/'), '/');
$query = $parts['query'] ?? '';

define('NAV_PATH', $path);
define('NAV_QUERY', $query);
// pages read their query string through input()/$_GET just like a full load
$_GET = [];
parse_str($query, $_GET);

$r = render_route($path);
header('Vary: Cookie');
send_page_json($r);
