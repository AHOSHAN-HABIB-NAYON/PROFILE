<?php
/** Page-view beacon (navigator.sendBeacon). No CSRF: it only records anonymous counters. */
defined('APP') || exit;
require_once ROOT . '/core/analytics.php';

if (!is_post()) fail(t('err.bad_request'), 405);
session_write_close();
// Same-origin check stands in for CSRF on this write-only, low-risk endpoint
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && rtrim($origin, '/') !== rtrim((string)preg_replace('~^(https?://[^/]+).*$~', '$1', BASE_URL), '/')) fail('', 403);
if (rate_hit('pv:' . client_ip(), 240, 600)) {
    try {
        record_view(mb_substr(input('path', '/'), 0, 255), input('type'), input_int('ref'), mb_substr(input('referrer'), 0, 500));
    } catch (Throwable $e) {
        log_error($e);
    }
}
http_response_code(204);
exit;
