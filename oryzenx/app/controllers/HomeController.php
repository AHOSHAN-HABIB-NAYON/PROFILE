<?php
final class HomeController
{
    public function index(): void
    {
        $data = [
            'slides' => DB::all('SELECT * FROM slides WHERE is_active = 1 ORDER BY sort_order, id LIMIT 8'),
            'categories' => DB::all('SELECT * FROM service_categories WHERE is_active = 1 ORDER BY sort_order, id'),
            'featured' => DB::all('SELECT * FROM services WHERE is_active = 1 AND is_featured = 1 ORDER BY sort_order, id LIMIT 8'),
            'grid' => DB::all('SELECT slug, title, title_bn, icon, icon_color, icon_image FROM services WHERE is_active = 1 ORDER BY is_featured DESC, sort_order, id LIMIT 6'),
            'posts' => Content::latestPosts(5),
            'team' => DB::all('SELECT id, name, role, role_bn, photo, is_vip, badge_text, badge_animated FROM team_members WHERE is_active = 1 ORDER BY sort_order, id LIMIT 4'),
            'faqs' => DB::all('SELECT * FROM faqs WHERE is_active = 1 AND show_home = 1 ORDER BY sort_order, id LIMIT 5'),
            'methods' => Content::paymentMethods(),
        ];
        View::page('pages/home', $data, ['nav' => 'home', 'css' => ['home', 'services'], 'page_key' => 'home']);
    }

    public function faq(): void
    {
        $faqs = DB::all('SELECT * FROM faqs WHERE is_active = 1 ORDER BY category, sort_order, id');
        $grouped = [];
        foreach ($faqs as $f) $grouped[$f['category'] ?: t('faq.general')][] = $f;
        View::page('pages/faq', ['grouped' => $grouped], [
            'title' => t('nav.faq'), 'nav' => 'faq', 'css' => ['home'],
            'schema' => ['@context' => 'https://schema.org', '@type' => 'FAQPage', 'mainEntity' => array_map(fn($f) => [
                '@type' => 'Question', 'name' => tr($f, 'question'), 'acceptedAnswer' => ['@type' => 'Answer', 'text' => strip_tags(tr($f, 'answer'))]], $faqs)],
        ]);
    }

    private function results(string $q, int $limit): array
    {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $groups = [];
        $services = DB::all('SELECT slug, title, title_bn, short_desc, short_desc_bn, icon, price, currency, price_plus FROM services WHERE is_active = 1
            AND (title LIKE ? OR title_bn LIKE ? OR short_desc LIKE ? OR short_desc_bn LIKE ? OR slug LIKE ?) ORDER BY is_featured DESC, sort_order LIMIT ' . $limit, [$like, $like, $like, $like, $like]);
        if ($services) $groups[] = ['label' => t('nav.services'), 'items' => array_map(fn($s) => ['title' => tr($s, 'title'), 'sub' => money($s['price'], $s['currency'], (bool)$s['price_plus']) . ' · ' . tr($s, 'short_desc'), 'url' => url('/services/' . $s['slug']), 'icon' => $s['icon'] ?: 'fa-solid fa-code'], $services)];
        $cats = DB::all('SELECT slug, name, name_bn, icon FROM service_categories WHERE is_active = 1 AND (name LIKE ? OR name_bn LIKE ?) LIMIT 5', [$like, $like]);
        if ($cats) $groups[] = ['label' => t('search.categories'), 'items' => array_map(fn($c) => ['title' => tr($c, 'name'), 'sub' => '', 'url' => url('/services?cat=' . $c['slug']), 'icon' => $c['icon'] ?: 'fa-solid fa-folder'], $cats)];
        $posts = DB::all("SELECT id, title, icon, published_at FROM posts WHERE status = 'published' AND published_at <= NOW() AND (title LIKE ? OR excerpt LIKE ? OR tags LIKE ?) ORDER BY published_at DESC LIMIT " . $limit, [$like, $like, $like]);
        if ($posts) $groups[] = ['label' => t('nav.news'), 'items' => array_map(fn($p) => ['title' => trim(($p['icon'] ?? '') . ' ' . $p['title']), 'sub' => time_ago($p['published_at']), 'url' => url('/news/' . $p['id']), 'icon' => 'fa-solid fa-newspaper'], $posts)];
        $team = DB::all('SELECT id, name, role FROM team_members WHERE is_active = 1 AND (name LIKE ? OR role LIKE ? OR skills LIKE ?) LIMIT 4', [$like, $like, $like]);
        if ($team) $groups[] = ['label' => t('nav.team'), 'items' => array_map(fn($m) => ['title' => $m['name'], 'sub' => $m['role'], 'url' => url('/team/' . $m['id']), 'icon' => 'fa-solid fa-user'], $team)];
        $pages = array_filter([
            ['title' => t('nav.home'), 'url' => url('/'), 'icon' => 'fa-solid fa-house', 'k' => 'home হোম'],
            ['title' => t('nav.services'), 'url' => url('/services'), 'icon' => 'fa-solid fa-layer-group', 'k' => 'services সার্ভিস price দাম'],
            ['title' => t('nav.news'), 'url' => url('/news'), 'icon' => 'fa-solid fa-newspaper', 'k' => 'news blog নিউজ খবর'],
            ['title' => t('nav.team'), 'url' => url('/team'), 'icon' => 'fa-solid fa-users', 'k' => 'team টিম'],
            ['title' => t('nav.contact'), 'url' => url('/contact'), 'icon' => 'fa-solid fa-headset', 'k' => 'contact support যোগাযোগ whatsapp'],
            ['title' => t('nav.payment'), 'url' => url('/payment'), 'icon' => 'fa-solid fa-wallet', 'k' => 'payment bkash usdt binance পেমেন্ট'],
            ['title' => t('nav.faq'), 'url' => url('/faq'), 'icon' => 'fa-solid fa-circle-question', 'k' => 'faq help প্রশ্ন'],
            ['title' => t('nav.profile'), 'url' => url('/profile'), 'icon' => 'fa-solid fa-user', 'k' => 'profile account প্রোফাইল'],
            ['title' => t('nav.security'), 'url' => url('/profile/security'), 'icon' => 'fa-solid fa-shield-halved', 'k' => 'security 2fa password passkey নিরাপত্তা'],
        ], fn($p) => mb_stripos($p['title'] . ' ' . $p['k'], $q) !== false);
        if ($pages) $groups[] = ['label' => t('search.pages'), 'items' => array_values(array_map(fn($p) => ['title' => $p['title'], 'sub' => '', 'url' => $p['url'], 'icon' => $p['icon']], $pages))];
        return $groups;
    }

    public function apiSearch(): void
    {
        $q = mb_substr(trim((string)input('q')), 0, 80);
        if (mb_strlen($q) < 2) json_out(['ok' => true, 'groups' => []]);
        if (!RateLimit::hit('search|' . client_ip(), 60, 60)) json_out(['ok' => false, 'groups' => []], 429);
        json_out(['ok' => true, 'groups' => $this->results($q, 5)]);
    }

    public function search(): void
    {
        $q = mb_substr(trim((string)input('q')), 0, 80);
        $groups = mb_strlen($q) >= 2 ? $this->results($q, 20) : [];
        View::page('pages/search', ['q' => $q, 'groups' => $groups], ['title' => t('search.title'), 'noindex' => true, 'cache' => false]);
    }

    public function lang(string $code): void
    {
        Lang::set($code);
        if ($u = auth()) DB::q('UPDATE users SET lang = ? WHERE id = ?', [$code, $u['id']]);
        json_out(['ok' => true]);
    }

    public function track(): void
    {
        $b = json_body();
        $path = '/' . ltrim(substr((string)($b['path'] ?? '/'), 0, 255), '/');
        $key = preg_replace('/[^a-z0-9_\/\-]/', '', (string)($b['key'] ?? 'page'));
        Analytics::track($key, isset($b['ref']) ? (int)$b['ref'] : null, parse_url($path, PHP_URL_PATH) ?: '/');
        json_out(['ok' => true]);
    }
}
