<?php
/**
 * Renders a page either as a full HTML document (direct visit) or as a JSON
 * fragment for the client-side navigation engine (X-SPA header).
 */
final class View
{
    public static function render(string $view, array $data = []): string
    {
        $file = VIEWS . '/' . $view . '.php';
        if (!is_file($file)) throw new RuntimeException("View $view not found");
        extract($data, EXTR_SKIP);
        ob_start();
        try { include $file; } catch (Throwable $e) { ob_end_clean(); throw $e; }
        return (string)ob_get_clean();
    }

    public static function page(string $view, array $data = [], array $opt = []): never
    {
        $layout = $opt['layout'] ?? 'app';
        $page = self::meta($opt);
        $page['layout'] = $layout;
        $page['nav'] = $opt['nav'] ?? '';
        $page['css'] = array_values(array_unique(array_merge($layout === 'admin' ? ['admin'] : [], $opt['css'] ?? [])));
        $page['js'] = array_values(array_unique(array_merge($layout === 'admin' ? ['admin'] : [], $opt['js'] ?? [])));
        $page['cache'] = $opt['cache'] ?? ($layout === 'app');
        $content = self::render($view, $data + ['page' => $page]);

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && $layout === 'app' && empty($opt['no_track'])) {
            Analytics::track($opt['page_key'] ?? $view, $opt['ref_id'] ?? null);
        }
        if (isset($opt['status'])) http_response_code($opt['status']);
        header('X-Content-Type-Options: nosniff');
        header('Vary: X-SPA, Cookie');

        if (is_spa()) {
            json_out([
                'ok' => true, 'layout' => $layout, 'title' => $page['full_title'], 'html' => $content,
                'meta' => ['description' => $page['description'], 'canonical' => $page['canonical'], 'image' => $page['image'], 'robots' => $page['robots']],
                'nav' => $page['nav'], 'css' => array_map(fn($c) => asset("css/$c.css"), $page['css']),
                'js' => array_map(fn($j) => asset("js/$j.js"), $page['js']), 'cache' => $page['cache'],
                'url' => current_path_with_query(),
                'track' => $layout === 'app' && empty($opt['no_track']) ? ['key' => str_replace('pages/', '', $opt['page_key'] ?? $view), 'ref' => $opt['ref_id'] ?? null] : null,
            ]);
        }
        header('Content-Type: text/html; charset=utf-8');
        echo self::render("layouts/$layout", ['content' => $content, 'page' => $page]);
        exit;
    }

    public static function meta(array $opt): array
    {
        $site = setting('site_name');
        $title = $opt['title'] ?? '';
        $desc = $opt['description'] ?? (lang() === 'bn' ? setting('site_description_bn') : setting('seo_description'));
        $canonicalBase = rtrim(setting('canonical_base') ?: base_url(), '/');
        return [
            'title' => $title,
            'full_title' => $title ? "$title · $site" : (setting('seo_title') ?: $site),
            'description' => mb_substr(trim(strip_tags((string)$desc)), 0, 300),
            'canonical' => $canonicalBase . ($opt['canonical'] ?? current_path()),
            'image' => $opt['image'] ?? (setting('og_image') ? abs_url(upload_url(setting('og_image'))) : ''),
            'type' => $opt['type'] ?? 'website',
            'robots' => !empty($opt['noindex']) ? 'noindex,nofollow' : 'index,follow',
            'schema' => $opt['schema'] ?? null,
        ];
    }

    public static function errorPage(int $code, string $msg = ''): never
    {
        $titles = [404 => t('error.404_title'), 403 => t('error.403_title'), 419 => t('error.419_title'), 429 => t('error.429_title')];
        self::page('pages/error', ['code' => $code, 'message' => $msg ?: t('error.generic_sub'), 'heading' => $titles[$code] ?? t('error.generic')],
            ['title' => $titles[$code] ?? t('error.generic'), 'status' => $code, 'noindex' => true, 'no_track' => true, 'cache' => false]);
    }
}
