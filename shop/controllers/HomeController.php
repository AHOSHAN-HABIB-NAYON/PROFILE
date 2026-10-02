<?php
final class HomeController
{
    public function index(): void
    {
        $lim = static fn (string $k) => max(1, min(48, (int) setting($k, 8)));
        $flash = Settings::on('flash_enabled') && Settings::on('home_flash') ? Product::flash($lim('home_flash_limit')) : [];
        $flashEnds = array_filter(array_map(static fn ($p) => $p['flash_end'] ? strtotime($p['flash_end']) : null, $flash));
        $data = [
            'banners'     => Settings::on('home_banner') ? Banner::active() : [],
            'categories'  => Settings::on('home_categories') ? Category::active() : [],
            'flash'       => $flash,
            'flash_end'   => $flashEnds ? min($flashEnds) : null,
            'featured'    => Settings::on('home_featured') ? Product::featured($lim('home_featured_limit')) : [],
            'combos'      => Settings::on('combo_enabled') && Settings::on('home_combo') ? Combo::active(8) : [],
            'free'        => Settings::on('free_delivery_enabled') && Settings::on('home_free_delivery') ? Product::freeDelivery($lim('home_free_limit')) : [],
            'coupon'      => Settings::on('home_coupon') ? CouponService::highlighted() : null,
            'latest'      => Settings::on('home_products') ? Product::latest($lim('home_products_limit')) : [],
            'recommended' => Settings::on('home_recommended') ? Product::recommended($lim('home_recommended_limit')) : [],
        ];
        $base = Config::get('url') ?: Request::origin();
        View::page('pages/home', $data, Seo::forPage('home', [
            'title' => setting('meta_title') ?: setting('site_name'), 'raw_title' => true,
            'page' => 'home', 'cacheable' => true, 'nav' => 'home',
            'jsonld' => [Seo::organization(), ['@context' => 'https://schema.org', '@type' => 'WebSite', 'name' => setting('site_name'), 'url' => $base . '/',
                'potentialAction' => ['@type' => 'SearchAction', 'target' => $base . '/products?q={search_term_string}', 'query-input' => 'required name=search_term_string']]],
        ]));
    }
}
