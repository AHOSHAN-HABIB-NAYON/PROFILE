<?php
final class View
{
    private static array $shared = [];

    public static function share(string $k, mixed $v): void
    {
        self::$shared[$k] = $v;
    }

    public static function render(string $template, array $data = []): string
    {
        $file = BASE_PATH . '/' . (str_starts_with($template, 'admin/') ? $template : 'views/' . $template) . '.php';
        if (!is_file($file)) {
            throw new RuntimeException('View not found: ' . $template);
        }
        extract(self::$shared + $data, EXTR_SKIP);
        ob_start();
        try {
            include $file;
        } catch (Throwable $e) {
            ob_end_clean();
            throw $e;
        }
        return (string) ob_get_clean();
    }

    public static function partial(string $template, array $data = []): void
    {
        echo self::render($template, $data);
    }

    /**
     * Customer page. Direct requests get the full layout (SEO, crawlers);
     * SPA requests get JSON with the main content + meta so the shell stays loaded.
     */
    public static function page(string $template, array $data = [], array $meta = []): void
    {
        $meta = Seo::meta($meta);
        if (Request::method() === 'GET' && $meta['page'] !== 'offline') {
            Analytics::event('page_view');
        }
        $meta['event_id'] = 'pv-' . bin2hex(random_bytes(6));
        if (Request::method() === 'GET') {
            MetaCapi::queue('PageView', $meta['event_id']);
        }
        $content = self::render($template, $data);
        if (Request::isSpa()) {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            header('Vary: X-SPA');
            echo json_encode([
                'success' => true,
                'html'    => $content,
                'title'   => $meta['full_title'],
                'meta'    => $meta,
                'page'    => $meta['page'] ?? 'generic',
                'cache'   => $meta['cacheable'] ?? false,
                'csrf'    => Csrf::token(),
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }
        header('Content-Type: text/html; charset=utf-8');
        header('Vary: X-SPA');
        echo self::render('layouts/main', ['content' => $content, 'meta' => $meta]);
    }

    public static function admin(string $template, array $data = [], string $title = 'ড্যাশবোর্ড', string $page = 'generic'): void
    {
        $content = self::render('admin/views/' . $template, $data);
        if (Request::isSpa()) {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            echo json_encode(['success' => true, 'html' => $content, 'title' => $title . ' · অ্যাডমিন', 'page' => $page, 'cache' => false, 'csrf' => Csrf::token(), 'meta' => ['nav' => self::adminNavKey()]], JSON_UNESCAPED_UNICODE);
            return;
        }
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store, private');
        echo self::render('admin/views/layout', ['content' => $content, 'title' => $title, 'page' => $page]);
    }

    public static function adminNavKey(): string
    {
        $p = Request::path();
        $seg = explode('/', trim(substr($p, 6), '/'))[0] ?? '';
        return $seg === '' ? 'dashboard' : $seg;
    }
}
