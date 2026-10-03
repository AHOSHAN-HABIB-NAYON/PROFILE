<?php
/**
 * Router + page renderer.
 *
 * Every clean URL resolves to a page file. The same page can be rendered:
 *  - as a full HTML document (direct visit / refresh / crawler), or
 *  - as JSON {html, title, meta…} for the AJAX/History-API navigation
 *    (api/navigation.php), so only <main> is swapped on the client.
 */
defined('APP') || exit;

const ADMIN_SECTIONS = [
    'index' => 'dashboard', 'users' => 'users', 'services' => 'services', 'products' => 'services', 'orders' => 'orders',
    'payments' => 'payments', 'news' => 'news', 'team' => 'team', 'notifications' => 'notifications',
    'analytics' => 'analytics', 'ai' => 'ai', 'settings' => 'settings', 'security' => 'security',
    'media' => 'media', 'support' => 'support',
];

function routes(): array
{
    return [
        ['~^/$~', 'pages/home.php', ['nav' => 'home']],
        ['~^/services$~', 'pages/services.php', ['nav' => 'services']],
        ['~^/services/([a-z0-9-]+)$~', 'pages/service-details.php', ['nav' => 'services', 'params' => ['slug']]],
        ['~^/news$~', 'pages/news.php', ['nav' => 'news']],
        ['~^/news/(\d+)(?:/[a-z0-9-]*)?$~', 'pages/news-details.php', ['nav' => 'news', 'params' => ['id']]],
        ['~^/team$~', 'pages/team.php', ['nav' => 'team']],
        ['~^/contact$~', 'pages/contact.php', ['nav' => 'contact']],
        ['~^/profile(?:/(overview|edit|security|payments|orders|notifications))?$~', 'pages/profile.php', ['nav' => 'profile', 'params' => ['tab'], 'cache' => false]],
        ['~^/payment(?:/([A-Za-z0-9-]+))?$~', 'pages/payment.php', ['nav' => 'payment', 'params' => ['code'], 'cache' => false]],
        ['~^/notifications$~', 'pages/notifications.php', ['nav' => 'notifications', 'cache' => false]],
        ['~^/login$~', 'pages/login.php', ['nav' => 'profile', 'cache' => false]],
        ['~^/register$~', 'pages/register.php', ['nav' => 'profile', 'cache' => false]],
        ['~^/forgot-password$~', 'pages/forgot-password.php', ['nav' => 'profile', 'cache' => false]],
        ['~^/reset-password$~', 'pages/forgot-password.php', ['nav' => 'profile', 'cache' => false]],
        ['~^/verify-email$~', 'pages/verify-email.php', ['cache' => false]],
        ['~^/recover-2fa$~', 'pages/verify-email.php', ['cache' => false]],
        ['~^/offline$~', 'pages/offline.php', ['layout' => 'bare']],
        ['~^/admin(?:/([a-z]+))?$~', 'admin', ['layout' => 'admin', 'params' => ['section'], 'cache' => false]],
    ];
}

function match_route(string $path): ?array
{
    foreach (routes() as [$re, $file, $opt]) {
        if (preg_match($re, $path, $m)) {
            $params = [];
            foreach (($opt['params'] ?? []) as $i => $name) $params[$name] = $m[$i + 1] ?? '';
            return ['file' => $file, 'params' => $params, 'layout' => $opt['layout'] ?? 'app', 'nav' => $opt['nav'] ?? '', 'cache' => $opt['cache'] ?? true];
        }
    }
    return null;
}

// ---------------------------------------------------------------------
// Page meta (title/description/OG/schema) – set from inside page files
// ---------------------------------------------------------------------
function meta(?array $set = null): array
{
    static $meta = [];
    if ($set !== null) $meta = array_merge($meta, $set);
    return $meta;
}

function maintenance_active(): bool
{
    return INSTALLED && setting_bool('maintenance.enabled') && !is_staff();
}

/**
 * Render a path to ['status','html','meta','layout','nav','cache','redirect'].
 */
function render_route(string $path): array
{
    $out = ['status' => 200, 'html' => '', 'meta' => [], 'layout' => 'app', 'nav' => '', 'cache' => false, 'redirect' => null];

    if (maintenance_active() && !in_array($path, ['/login', '/forgot-password', '/reset-password'], true) && !str_starts_with($path, '/admin')) {
        return ['status' => 503, 'html' => capture_page(ROOT . '/pages/maintenance.php', []), 'meta' => meta(), 'layout' => 'bare'] + $out;
    }

    $route = match_route($path);
    if (!$route) return render_error_page(404) + $out;

    try {
        if ($route['layout'] === 'admin') {
            $section = $route['params']['section'] ?: 'index';
            if (!isset(ADMIN_SECTIONS[$section])) abort(404);
            $u = user();
            if (!$u) throw new RedirectTo('/login?next=' . rawurlencode(request_path_with_query()));
            if (!is_staff($u)) abort(403);
            if (!can(ADMIN_SECTIONS[$section], $u)) abort(403);
            $file = ROOT . '/admin/' . $section . '.php';
            $route['nav'] = $section;
        } else {
            $file = ROOT . '/' . $route['file'];
        }
        if ($route['layout'] === 'admin') require_once ROOT . '/core/admin-lang.php';
        $html = capture_page($file, $route['params']);
        if ($route['layout'] === 'admin' && lang() === 'bn') {
            $html = admin_tr($html);
            if (!empty(meta()['title'])) meta(['title' => at(meta()['title'])]);
        }
        $m = meta();
        return [
            'status' => $m['status'] ?? 200, 'html' => $html, 'meta' => $m, 'layout' => $route['layout'],
            'nav' => $m['nav'] ?? $route['nav'], 'cache' => (bool)($m['cache'] ?? $route['cache']), 'redirect' => null,
        ];
    } catch (RedirectTo $r) {
        return ['redirect' => $r->to] + $out;
    } catch (HttpError $e) {
        return render_error_page($e->getCode() ?: 500, $e->getMessage()) + ['layout' => $route['layout']] + $out;
    }
}

/** Include a page file in an isolated scope and return its output. */
function capture_page(string $__file, array $params): string
{
    if (!is_file($__file)) abort(404);
    ob_start();
    try {
        (static function () use ($__file, $params) {
            extract(['params' => $params]);
            include $__file;
        })();
    } catch (Throwable $e) {
        ob_end_clean();
        throw $e;
    }
    return (string)ob_get_clean();
}

function render_error_page(int $code, string $message = ''): array
{
    if (!in_array($code, [400, 401, 403, 404, 419, 429, 500, 503], true)) $code = 500;
    meta(['status' => $code, 'title' => t('error.' . $code . '_title'), 'robots' => 'noindex']);
    $html = capture_page(ROOT . '/pages/error.php', ['code' => $code, 'message' => $message]);
    return ['status' => $code, 'html' => $html, 'meta' => meta(), 'nav' => '', 'cache' => false];
}

/** Full-document render (direct visits). */
function send_page(array $r): void
{
    if ($r['redirect']) redirect($r['redirect']);
    http_response_code($r['status']);
    send_security_headers();
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache, private');
    header('Vary: Cookie');
    // includes below share this scope: keep everything needed in dedicated vars
    $content = $r['html'];
    $meta = $r['meta'];
    $nav = $r['nav'];
    $layout = $r['layout'];
    $cacheable = $r['cache'];
    unset($r);
    if ($layout === 'admin') {
        include ROOT . '/admin/_layout.php';
    } else {
        $bare = $layout === 'bare';
        include ROOT . '/includes/header.php';
        if (!$bare) {
            include ROOT . '/includes/navbar.php';
            include ROOT . '/includes/sidebar.php';
        }
        echo '<main id="app-main" class="app-main" tabindex="-1" data-nav="' . e($nav) . '"'
            . ' data-track-type="' . e($meta['track_type'] ?? '') . '" data-track-ref="' . e($meta['track_ref'] ?? '') . '"'
            . ' data-cache="' . ($cacheable ? '1' : '0') . '">' . $content . '</main>';
        if (!$bare) {
            include ROOT . '/includes/bottom-nav.php';
            include ROOT . '/includes/ai-chat.php';
        }
        include ROOT . '/includes/notifications.php';
        include ROOT . '/includes/footer.php';
    }
}

/** JSON render for the SPA navigation API. */
function send_page_json(array $r): never
{
    if ($r['redirect']) json_out(['ok' => true, 'redirect' => url($r['redirect'])]);
    $m = $r['meta'];
    json_out([
        'ok' => $r['status'] < 400,
        'status' => $r['status'],
        'html' => $r['html'],
        'title' => page_title($m),
        'meta' => [
            'description' => $m['description'] ?? default_description(),
            'canonical' => abs_url($m['canonical'] ?? (defined('NAV_PATH') ? NAV_PATH : request_path())),
            'image' => abs_url($m['image'] ?? (setting('og_image') ?: '/assets/icons/og-default.png')),
            'robots' => $m['robots'] ?? '',
        ],
        'layout' => $r['layout'],
        'nav' => $r['nav'],
        'cache' => $r['cache'],
        'track' => ['type' => $m['track_type'] ?? '', 'ref' => $m['track_ref'] ?? ''],
        'version' => (string)setting('content_version', '1'),
    ], 200);
}

function page_title(array $m): string
{
    $site = (string)setting('site_name', 'Website');
    if (empty($m['title'])) return $site . ' — ' . setting_l('site_tagline');
    return $m['title'] . ' · ' . $site;
}

function default_description(): string
{
    return setting_l('seo.meta_description') ?: setting_l('site_description');
}

/** Friendly error page from anywhere (exception handler, special routes). */
function render_error(int $code, string $message = ''): void
{
    while (ob_get_level() > 0) ob_end_clean();
    try {
        if (defined('API_REQUEST')) {
            json_out(['ok' => false, 'message' => $message ?: t('error.' . $code . '_text'), 'status' => $code], $code);
        }
        $r = render_error_page($code, $message) + ['layout' => 'app', 'redirect' => null];
        if (defined('NAV_PATH')) send_page_json($r);
        send_page($r);
    } catch (Throwable $e) {
        log_error($e);
        if (!headers_sent()) { http_response_code($code); header('Content-Type: text/html; charset=utf-8'); }
        echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            . '<title>Error</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;background:#f5f7fc;color:#13203a">'
            . '<div style="text-align:center"><h1 style="font-size:48px;margin:0;color:#3045d8">' . $code . '</h1>'
            . '<p>Something went wrong. Please try again in a moment.<br>কিছু একটা সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।</p>'
            . '<a href="' . e(url('/')) . '">Home / হোম</a></div></body>';
    }
}
