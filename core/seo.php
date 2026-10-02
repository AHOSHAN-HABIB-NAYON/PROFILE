<?php
/**
 * SEO helpers: <head> meta tags, JSON-LD, robots.txt, sitemap.xml,
 * and the PWA web manifest (all admin-configurable, so generated).
 */
defined('APP') || exit;

function head_meta(array $m): string
{
    $title = page_title($m);
    $desc = $m['description'] ?? default_description();
    $canonical = abs_url($m['canonical'] ?? request_path());
    $image = abs_url($m['image'] ?? (setting('og_image') ?: '/assets/icons/og-default.png'));
    $robots = $m['robots'] ?? (setting_bool('seo.robots_index') ? 'index,follow' : 'noindex,nofollow');
    $ogTitle = $m['title'] ?? (setting('seo.og_title') ?: (setting_l('seo.meta_title') ?: $title));
    $ogDesc = $m['description'] ?? (setting('seo.og_description') ?: $desc);
    $h = '<title>' . e(empty($m['title']) && setting_l('seo.meta_title') ? setting_l('seo.meta_title') : $title) . '</title>' . "\n"
        . '<meta name="description" content="' . e(mb_substr($desc, 0, 300)) . '">' . "\n"
        . '<meta name="keywords" content="' . e($m['keywords'] ?? setting('seo.keywords')) . '">' . "\n"
        . '<meta name="robots" content="' . e($robots) . '">' . "\n"
        . '<link rel="canonical" href="' . e($canonical) . '">' . "\n"
        . '<meta property="og:site_name" content="' . e(setting('site_name')) . '">' . "\n"
        . '<meta property="og:type" content="' . e($m['og_type'] ?? 'website') . '">' . "\n"
        . '<meta property="og:title" content="' . e($ogTitle) . '">' . "\n"
        . '<meta property="og:description" content="' . e(mb_substr($ogDesc, 0, 300)) . '">' . "\n"
        . '<meta property="og:url" content="' . e($canonical) . '">' . "\n"
        . '<meta property="og:image" content="' . e($image) . '">' . "\n"
        . '<meta property="og:locale" content="' . (lang() === 'bn' ? 'bn_BD' : 'en_US') . '">' . "\n"
        . '<meta name="twitter:card" content="' . e(setting('seo.twitter_card', 'summary_large_image')) . '">' . "\n";
    if (setting('seo.twitter_handle')) $h .= '<meta name="twitter:site" content="' . e(setting('seo.twitter_handle')) . '">' . "\n";
    if (setting('seo.google_verification')) $h .= '<meta name="google-site-verification" content="' . e(setting('seo.google_verification')) . '">' . "\n";
    if (setting('seo.bing_verification')) $h .= '<meta name="msvalidate.01" content="' . e(setting('seo.bing_verification')) . '">' . "\n";
    foreach (LANGS as $code => $_) $h .= '<link rel="alternate" hreflang="' . $code . '" href="' . e($canonical) . '">' . "\n";

    $schemas = $m['schema'] ?? [];
    if (setting_bool('seo.org_schema')) $schemas[] = org_schema();
    foreach ($schemas as $s) {
        $h .= '<script type="application/ld+json" nonce="' . csp_nonce() . '">' . json_encode($s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . '</script>' . "\n";
    }
    return $h;
}

function org_schema(): array
{
    $same = array_column(rows('SELECT url FROM social_links WHERE enabled = 1 AND url <> ""'), 'url');
    $o = ['@context' => 'https://schema.org', '@type' => 'Organization', 'name' => setting('site_name'), 'url' => BASE_URL,
        'logo' => abs_url(setting('logo') ?: '/assets/icons/icon-512.png'), 'sameAs' => $same];
    if (setting('contact.email')) $o['email'] = setting('contact.email');
    if (setting('contact.phone')) $o['telephone'] = setting('contact.phone');
    return $o;
}

function breadcrumb_schema(array $items): array
{
    $list = [];
    $i = 1;
    foreach ($items as $name => $path) $list[] = ['@type' => 'ListItem', 'position' => $i++, 'name' => $name, 'item' => abs_url($path)];
    return ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => $list];
}

function seo_robots(): void
{
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: public, max-age=3600');
    echo "User-agent: *\n";
    if (!setting_bool('seo.robots_index') || setting_bool('maintenance.enabled')) {
        echo "Disallow: /\n";
    } else {
        echo "Disallow: /admin\nDisallow: /api/\nDisallow: /profile\nDisallow: /payment\nDisallow: /notifications\nDisallow: /file/\nAllow: /\n";
    }
    $extra = trim((string)setting('seo.robots_extra'));
    if ($extra !== '') echo $extra . "\n";
    echo "\nSitemap: " . abs_url('/sitemap.xml') . "\n";
}

function seo_sitemap(): void
{
    header('Content-Type: application/xml; charset=utf-8');
    header('Cache-Control: public, max-age=3600');
    $urls = [['/', null, '1.0'], ['/services', null, '0.9'], ['/news', null, '0.9'], ['/team', null, '0.6'], ['/contact', null, '0.6']];
    foreach (rows('SELECT slug, COALESCE(updated_at, created_at) AS m FROM services WHERE status = 1 ORDER BY sort') as $s) $urls[] = ['/services/' . $s['slug'], $s['m'], '0.8'];
    foreach (rows("SELECT id, COALESCE(updated_at, publish_at) AS m FROM news WHERE status = 'published' AND publish_at <= NOW() ORDER BY publish_at DESC LIMIT 5000") as $n) $urls[] = ['/news/' . $n['id'], $n['m'], '0.7'];
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($urls as [$p, $mod, $prio]) {
        echo '  <url><loc>' . e(abs_url($p)) . '</loc>' . ($mod ? '<lastmod>' . date('c', strtotime($mod)) . '</lastmod>' : '') . '<priority>' . $prio . '</priority></url>' . "\n";
    }
    echo '</urlset>';
}

function seo_manifest(): void
{
    header('Content-Type: application/manifest+json; charset=utf-8');
    header('Cache-Control: public, max-age=600');
    $name = setting('pwa.name') ?: setting('site_name');
    $icon = setting('app_icon');
    $icons = $icon
        ? [['src' => media_url($icon), 'sizes' => '512x512', 'type' => 'image/' . (str_ends_with($icon, '.png') ? 'png' : 'webp'), 'purpose' => 'any']]
        : [];
    $icons[] = ['src' => url('/assets/icons/icon-192.png'), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'];
    $icons[] = ['src' => url('/assets/icons/icon-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'];
    $icons[] = ['src' => url('/assets/icons/maskable-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'];
    echo json_encode([
        'name' => $name,
        'short_name' => setting('pwa.short_name') ?: mb_substr((string)$name, 0, 12),
        'description' => setting_l('site_description'),
        'id' => url('/'),
        'start_url' => url('/?source=pwa'),
        'scope' => url('/'),
        'display' => 'standalone',
        'display_override' => ['standalone', 'minimal-ui'],
        'orientation' => 'portrait',
        'background_color' => setting('pwa.background_color', '#f5f7fc'),
        'theme_color' => setting('pwa.theme_color', '#3045d8'),
        'lang' => lang(),
        'icons' => $icons,
        'shortcuts' => [
            ['name' => t('nav.services'), 'url' => url('/services')],
            ['name' => t('nav.news'), 'url' => url('/news')],
            ['name' => t('nav.profile'), 'url' => url('/profile')],
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
}
