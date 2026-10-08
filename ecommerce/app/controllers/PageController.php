<?php
/**
 * Profile/settings screen (no account needed), static policy pages and offline fallback.
 */
final class PageController
{
    private const PAGES = [
        'about'         => ['key' => 'page_about',   'title' => 'আমাদের সম্পর্কে'],
        'privacy'       => ['key' => 'page_privacy', 'title' => 'গোপনীয়তা নীতি'],
        'terms'         => ['key' => 'page_terms',   'title' => 'শর্তাবলী'],
        'return-policy' => ['key' => 'page_return',  'title' => 'রিটার্ন ও রিফান্ড নীতি'],
    ];

    public function profile(Request $r): Response
    {
        $saved = Customer::forDevice(device_hash());
        return View::page('pages/profile', ['saved' => $saved, 'pages' => self::PAGES], [
            'title'     => 'প্রোফাইল',
            'robots'    => 'noindex, nofollow',
            'styles'    => ['profile'],
            'page'      => 'profile',
            'nav'       => 'profile',
            'cacheable' => false,
        ]);
    }

    public function show(Request $r, string $slug): Response
    {
        $page = self::PAGES[$slug] ?? throw new HttpException(404);
        $crumbs = [['হোম', '/'], [$page['title'], '/page/' . $slug]];
        return View::page('pages/page', ['title' => $page['title'], 'html' => HtmlSanitizer::clean((string)setting($page['key'])), 'crumbs' => $crumbs], [
            'title'  => $page['title'],
            'jsonld' => [Seo::breadcrumbs($crumbs)],
            'styles' => ['profile'],
            'page'   => 'static',
            'nav'    => 'profile',
        ]);
    }

    public function offline(Request $r): Response
    {
        return View::page('pages/offline', [], ['title' => 'ইন্টারনেট সংযোগ নেই', 'robots' => 'noindex', 'styles' => ['profile'], 'page' => 'offline']);
    }
}
