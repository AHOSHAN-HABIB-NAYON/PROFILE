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
                'meta' => ['description' => $page['description'], 'canonical' => $page['canonical'], 'image' => $page['image'] ?: self::defaultImage(), 'robots' => $page['robots'], 'keywords' => $page['keywords']],
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
            'image' => $opt['image'] ?? self::defaultImage(),
            'keywords' => $opt['keywords'] ?? (string)setting('seo_keywords'),
            'published' => $opt['published'] ?? null, 'modified' => $opt['modified'] ?? null, 'tags' => $opt['tags'] ?? [],
            'type' => $opt['type'] ?? 'website',
            'robots' => !empty($opt['noindex']) ? 'noindex,nofollow' : 'index,follow',
            'schema' => $opt['schema'] ?? null,
        ];
    }

    /** Share image used when a page has none: OG image → default banner → logo → app icon. */
    public static function defaultImage(): string
    {
        foreach (['og_image', 'default_banner', 'logo'] as $k) if ($v = setting($k)) return abs_url(upload_url($v));
        return abs_url(url('/icon-512.png'));
    }

    /** Auto SEO: clean description and keywords generated from any text (posts, services…). */
    public static function autoDescription(string $html, int $len = 158): string
    {
        $txt = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags(preg_replace('/<(br|\/p|\/h\d|\/li)[^>]*>/i', ' ', $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        if (mb_strlen($txt) <= $len) return $txt;
        $cut = mb_substr($txt, 0, $len);
        $sp = mb_strrpos($cut, ' ');
        return rtrim($sp > $len * .6 ? mb_substr($cut, 0, $sp) : $cut, " ,.;:-–—") . '…';
    }

    public static function autoKeywords(array $seed, string $text, int $max = 12): string
    {
        $stop = array_flip(explode(',', 'the,and,for,with,that,this,from,your,you,our,are,was,were,will,have,has,can,not,but,all,any,its,into,about,more,than,them,they,their,what,when,which,how,also,just,very,এবং,করে,থেকে,জন্য,একটি,আমরা,আপনার,আমাদের,এই,সেই,হবে,করা,হয়,ও,যে,না,কি,তার,এর,সাথে,নিয়ে,করুন'));
        $words = [];
        foreach ($seed as $w) { $w = trim((string)$w); if ($w !== '') $words[mb_strtolower($w)] = $w; }
        preg_match_all('/[\p{L}\p{M}][\p{L}\p{M}\p{N}.+#-]{2,}/u', mb_strtolower(preg_replace('/<[^>]+>/', ' ', $text)), $m);
        $freq = array_count_values(array_filter($m[0], fn($w) => !isset($stop[$w]) && mb_strlen($w) > 2));
        arsort($freq);
        foreach (array_keys($freq) as $w) { if (count($words) >= $max) break; $words[$w] ??= $w; }
        return implode(', ', array_slice(array_values($words), 0, $max));
    }

    public static function errorPage(int $code, string $msg = ''): never
    {
        $titles = [404 => t('error.404_title'), 403 => t('error.403_title'), 419 => t('error.419_title'), 429 => t('error.429_title')];
        self::page('pages/error', ['code' => $code, 'message' => $msg ?: t('error.generic_sub'), 'heading' => $titles[$code] ?? t('error.generic')],
            ['title' => $titles[$code] ?? t('error.generic'), 'status' => $code, 'noindex' => true, 'no_track' => true, 'cache' => false]);
    }
}
