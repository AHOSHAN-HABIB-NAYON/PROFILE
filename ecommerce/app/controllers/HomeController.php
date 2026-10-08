<?php
/**
 * Home page: admin-ordered sections, each individually cached.
 */
final class HomeController
{
    public function index(Request $r): Response
    {
        $sections = [];
        foreach (Setting::json('home_sections') as $s) {
            if (empty($s['enabled'])) {
                continue;
            }
            $key = (string)$s['key'];
            $limit = (int)($s['limit'] ?? 8);
            $sort = (string)($s['sort'] ?? 'manual');
            $data = match ($key) {
                'hero'          => Banner::active($limit),
                'categories'    => array_slice(Category::topLevel(), 0, $limit),
                'flash', 'featured', 'combo', 'free_delivery', 'popular', 'latest' => Product::section($key, $limit, $sort),
                'coupon'        => Coupon::highlight(),
                'cta'           => true,
                default         => null,
            };
            if ($key === 'flash' && setting('flash_sale_ends_at') && strtotime((string)setting('flash_sale_ends_at')) < time()) {
                continue;
            }
            if ($data === null || $data === [] || $data === false) {
                if ($key !== 'hero') {
                    continue;
                }
            }
            $sections[] = ['key' => $key, 'data' => $data];
        }

        return View::page('pages/home', ['sections' => $sections], [
            'title'       => '',
            'description' => setting('seo_description'),
            'canonical'   => absolute_url('/'),
            'jsonld'      => [Seo::organization(), Seo::website()],
            'styles'      => ['home'],
            'scripts'     => ['home'],
            'page'        => 'home',
            'nav'         => 'home',
        ]);
    }
}
