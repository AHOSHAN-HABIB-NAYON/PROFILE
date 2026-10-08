<?php
/**
 * PHP template renderer + "page" responses that serve either a full HTML
 * document (direct visits, crawlers, no-JS) or a JSON partial for the
 * client-side router (X-SPA: 1). Both come from the same template, so SEO
 * output and app navigation can never drift apart.
 */
final class View
{
    private static ?string $nonce = null;
    private static array $shared = [];

    public static function nonce(): string
    {
        return self::$nonce ??= base64_encode(random_bytes(16));
    }

    public static function share(string $key, mixed $value): void
    {
        self::$shared[$key] = $value;
    }

    /** Render a template file (relative to /views, or "admin:" prefix for /admin/views). */
    public static function render(string $view, array $data = [], ?string $layout = null): string
    {
        $file = self::resolve($view);
        $content = self::capture($file, $data);
        if ($layout === null) {
            return $content;
        }
        return self::capture(self::resolve(str_contains($layout, ':') ? $layout : 'layouts/' . $layout), $data + ['content' => $content]);
    }

    public static function component(string $name, array $data = []): string
    {
        return self::capture(self::resolve('components/' . $name), $data);
    }

    /**
     * Build a page response.
     * $meta keys: title, description, canonical, image, type, robots, jsonld[],
     *             page (JS module), styles[], scripts[], nav, status, track[]
     */
    public static function page(string $view, array $data = [], array $meta = [], string $layout = 'store'): Response
    {
        $isAdmin = $layout === 'admin';
        $request = Request::current();
        $meta['track'] ??= [];
        if (!$isAdmin) {
            Csrf::publicToken();
            if ((int)($meta['status'] ?? 200) === 200) {
                Analytics::pageView($request, (string)($meta['page'] ?? ''));
                array_unshift($meta['track'], Tracking::event('PageView'));
            }
        }
        $meta = self::normalizeMeta($meta, $isAdmin);
        $html = self::render($view, $data + ['meta' => $meta]);
        $status = (int)($meta['status'] ?? 200);

        if ($request->isSpa()) {
            return Response::json([
                'success' => $status < 400,
                'data' => [
                    'html'     => $html,
                    'title'    => $meta['full_title'],
                    'meta'     => [
                        'description' => $meta['description'],
                        'canonical'   => $meta['canonical'],
                        'image'       => $meta['image'],
                        'type'        => $meta['type'],
                        'robots'      => $meta['robots'],
                    ],
                    'jsonld'   => $meta['jsonld'],
                    'page'     => $meta['page'],
                    'styles'   => $meta['style_urls'],
                    'scripts'  => $meta['script_urls'],
                    'nav'      => $meta['nav'],
                    'track'    => $meta['track'],
                    'version'  => (int)setting('cache_version', 1),
                    'cache'    => $meta['cacheable'],
                ],
            ], $status, ['Vary' => 'X-SPA', 'Cache-Control' => 'private, no-cache']);
        }

        $doc = self::render($layout === 'admin' ? 'admin:layouts/admin' : 'layouts/' . $layout, $data + ['meta' => $meta, 'content' => $html]);
        return Response::html($doc, $status, ['Vary' => 'X-SPA', 'Cache-Control' => 'private, no-cache']);
    }

    private static function normalizeMeta(array $meta, bool $isAdmin): array
    {
        $store = setting('store_name');
        $title = $meta['title'] ?? '';
        $meta['full_title'] = $title !== '' ? $title . ' | ' . $store : (setting('seo_title') ?: $store);
        $meta['description'] = mb_substr(strip_tags((string)($meta['description'] ?? setting('seo_description'))), 0, 300);
        $meta['canonical'] = $meta['canonical'] ?? absolute_url(Request::current()->path);
        $meta['image'] = $meta['image'] ?? (setting('og_image') ? absolute_url(upload_url(setting('og_image'))) : absolute_url(asset('icons/icon-512.png')));
        $meta['type'] = $meta['type'] ?? 'website';
        $meta['robots'] = $meta['robots'] ?? ($isAdmin ? 'noindex, nofollow' : 'index, follow');
        $meta['jsonld'] = $meta['jsonld'] ?? [];
        $meta['page'] = $meta['page'] ?? '';
        $meta['nav'] = $meta['nav'] ?? '';
        $meta['track'] = $meta['track'] ?? [];
        $meta['cacheable'] = $meta['cacheable'] ?? !$isAdmin;
        $meta['styles'] = $meta['styles'] ?? [];
        $meta['scripts'] = $meta['scripts'] ?? [];
        $meta['style_urls'] = array_map(static fn($s) => $isAdmin ? admin_asset('css/' . $s . '.css') : asset('css/' . $s . '.css'), $meta['styles']);
        $meta['script_urls'] = array_map(static fn($s) => $isAdmin ? admin_asset('js/' . $s . '.js') : asset('js/pages/' . $s . '.js'), $meta['scripts']);
        return $meta;
    }

    private static function resolve(string $view): string
    {
        if (str_starts_with($view, 'admin:')) {
            $file = ADMIN_PATH . '/views/' . substr($view, 6) . '.php';
        } else {
            $file = VIEW_PATH . '/' . $view . '.php';
        }
        if (!preg_match('#^[a-z0-9/_:-]+$#i', $view) || !is_file($file)) {
            throw new RuntimeException('View not found: ' . $view);
        }
        return $file;
    }

    private static function capture(string $__file, array $__data): string
    {
        extract(self::$shared + $__data, EXTR_SKIP);
        ob_start();
        try {
            include $__file;
        } catch (Throwable $e) {
            ob_end_clean();
            throw $e;
        }
        return (string)ob_get_clean();
    }
}
