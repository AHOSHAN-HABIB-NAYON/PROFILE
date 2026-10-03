<?php
final class ServiceController
{
    public function index(): void
    {
        $categories = DB::all('SELECT * FROM service_categories WHERE is_active = 1 ORDER BY sort_order, id');
        $services = DB::all('SELECT s.*, c.slug AS cat_slug FROM services s LEFT JOIN service_categories c ON c.id = s.category_id
            WHERE s.is_active = 1 ORDER BY s.is_featured DESC, s.sort_order, s.id');
        $cat = (string)input('cat');
        View::page('pages/services', ['categories' => $categories, 'services' => $services, 'cat' => $cat], [
            'title' => t('services.title'), 'nav' => 'services', 'css' => ['services'],
            'description' => t('services.meta'),
        ]);
    }

    public function show(string $slug): void
    {
        $s = DB::row('SELECT s.*, c.name AS cat_name, c.name_bn AS cat_name_bn, c.slug AS cat_slug FROM services s
            LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.slug = ? AND s.is_active = 1', [$slug]);
        if (!$s) throw new HttpException(t('error.404'), 404);
        if (($_SERVER['HTTP_X_PREFETCH'] ?? '') !== '1') DB::q('UPDATE services SET views = views + 1 WHERE id = ?', [$s['id']]);
        $features = DB::all('SELECT * FROM service_features WHERE service_id = ? ORDER BY sort_order, id', [$s['id']]);
        $related = DB::all('SELECT slug, title, title_bn, icon, icon_color, icon_image, price, currency, price_plus FROM services
            WHERE is_active = 1 AND id <> ? AND category_id <=> ? ORDER BY is_featured DESC, sort_order LIMIT 4', [$s['id'], $s['category_id']]);
        View::page('pages/service', ['s' => $s, 'features' => $features, 'related' => $related, 'methods' => Content::paymentMethods()], [
            'title' => tr($s, 'title'), 'nav' => 'services', 'css' => ['services'], 'description' => tr($s, 'short_desc'),
            'page_key' => 'service', 'ref_id' => (int)$s['id'],
            'schema' => ['@context' => 'https://schema.org', '@type' => 'Service', 'name' => $s['title'], 'description' => $s['short_desc'],
                'provider' => ['@type' => 'Organization', 'name' => setting('site_name')],
                'offers' => ['@type' => 'Offer', 'price' => (float)$s['price'], 'priceCurrency' => $s['currency']]],
        ]);
    }
}
